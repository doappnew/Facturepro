// Frais de service payés en Pi (U2A) par l'entreprise qui facture : frais par facture, ou abonnement.
// Le prix, le réseau, le payeur et la facture sont TOUJOURS revérifiés à partir de la réponse de Pi ; le navigateur ne décide de rien.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { parseDecimal } from "./calc.js";
import type { Config } from "./config.js";
import { PiApiError, type PiPaymentDTO, type PiPlatform } from "./pi/client.js";
import { expectedNetwork } from "./payments.js";
import type { Business, ServiceKind, Store, User } from "./store/types.js";

const idSchema = z.object({ paymentId: z.string().min(1).max(200) });
const completeSchema = idSchema.extend({ txid: z.string().min(1).max(200) });
const piMinor = (n: number) => parseDecimal(n.toFixed(7), 7);

export function priceOf(config: Config, kind: ServiceKind): string {
  return kind === "invoice_fee" ? config.FEE_INVOICE_PI : config.SUBSCRIPTION_PI;
}

export async function billingState(config: Config, store: Store, businessId: string, invoiceId: string | null, now: Date) {
  const until = await store.getSubscriptionUntil(businessId);
  const subscriptionActive = !!until && new Date(until) > now;
  const invoiceFeePaid = invoiceId ? await store.hasCompletedInvoiceFee(invoiceId) : false;
  return {
    enabled: config.BILLING_ENABLED === "1",
    invoiceFeePi: config.FEE_INVOICE_PI,
    subscriptionPi: config.SUBSCRIPTION_PI,
    subscriptionDays: config.SUBSCRIPTION_DAYS,
    activeUntil: subscriptionActive ? until : null,
    subscriptionActive,
    invoiceFeePaid,
  };
}

export function billingRouter(deps: { config: Config; store: Store; platform?: PiPlatform; now?: () => Date }): Router {
  const { config, store } = deps;
  const now = deps.now ?? (() => new Date());
  const r = Router();

  const guard = async (res: Response) => {
    if (config.BILLING_ENABLED !== "1") { res.status(404).json({ error: "Introuvable" }); return null; }
    if (!deps.platform) { res.status(503).json({ error: "Paiements Pi non configurés (PI_API_KEY)" }); return null; }
    const user = await store.getUser(res.locals.userId as string);
    if (!user) { res.status(401).json({ error: "Utilisateur inconnu" }); return null; }
    const business = await store.getBusinessByOwner(user.id);
    if (!business) { res.status(409).json({ error: "Renseignez d'abord votre entreprise" }); return null; }
    return { platform: deps.platform, user, business };
  };

  r.get("/status", async (req: Request, res: Response) => {
    const user = await store.getUser(res.locals.userId as string);
    const business = user ? await store.getBusinessByOwner(user.id) : null;
    if (!business) { res.json({ enabled: config.BILLING_ENABLED === "1", needsBusiness: true }); return; }
    const invoiceId = typeof req.query.invoiceId === "string" ? req.query.invoiceId : null;
    const inv = invoiceId ? await store.getInvoice(business.id, invoiceId) : null;
    res.json({ ...(await billingState(config, store, business.id, inv ? inv.id : null, now())), network: expectedNetwork(config) });
  });

  // Contrôles communs sur le paiement tel que Pi le décrit.
  async function check(dto: PiPaymentDTO, user: User, business: Business): Promise<string | { kind: ServiceKind; invoiceId: string | null }> {
    if (dto.direction !== "user_to_app") return "Ce n'est pas un paiement utilisateur vers application";
    if (dto.network !== expectedNetwork(config)) return `Réseau inattendu (${dto.network})`;
    if (dto.user_uid !== user.piUid) return "Ce paiement n'appartient pas à cet utilisateur";
    const meta = (dto.metadata ?? {}) as { service?: unknown; invoiceId?: unknown };
    if (meta.service !== "invoice_fee" && meta.service !== "subscription") return "Paiement de frais inconnu";
    const kind = meta.service as ServiceKind;
    if (piMinor(dto.amount) !== parseDecimal(priceOf(config, kind), 7)) return "Le montant ne correspond pas au tarif";
    let invoiceId: string | null = null;
    if (kind === "invoice_fee") {
      if (typeof meta.invoiceId !== "string") return "Frais sans facture";
      const inv = await store.getInvoice(business.id, meta.invoiceId);
      if (!inv || inv.kind !== "invoice" || inv.status !== "draft") return "Les frais ne s'appliquent qu'à un brouillon de facture";
      invoiceId = inv.id;
    }
    return { kind, invoiceId };
  }

  r.post("/approve", async (req, res) => {
    try {
      const g = await guard(res); if (!g) return;
      const b = idSchema.safeParse(req.body);
      if (!b.success) { res.status(400).json({ error: "paymentId manquant" }); return; }
      const dto = await g.platform.getPayment(b.data.paymentId);
      const c = await check(dto, g.user, g.business);
      if (typeof c === "string") { res.status(422).json({ error: c }); return; }
      if (!(await store.getServicePayment(dto.identifier))) {
        await store.insertServicePayment({ piPaymentId: dto.identifier, kind: c.kind, businessId: g.business.id, invoiceId: c.invoiceId,
          network: dto.network, amountPi: dto.amount.toFixed(7), payerPiUid: g.user.piUid, status: "created", txid: null });
      }
      if (!dto.status.developer_approved) await g.platform.approvePayment(dto.identifier); // idempotent
      await store.updateServicePayment(dto.identifier, { status: "approved" });
      res.json({ approved: true });
    } catch (e) { fail(res, e); }
  });

  async function complete(paymentId: string, txid: string | null, user: User, platform: PiPlatform) {
    const row = await store.getServicePayment(paymentId);
    if (!row || row.payerPiUid !== user.piUid) return { status: 404, body: { error: "Paiement inconnu" } };
    const dto = await platform.getPayment(paymentId);
    if (dto.network !== expectedNetwork(config) || dto.direction !== "user_to_app" || dto.user_uid !== user.piUid)
      return { status: 422, body: { error: "Paiement incohérent avec Pi" } };
    if (dto.status.cancelled || dto.status.user_cancelled) {
      await store.updateServicePayment(paymentId, { status: "cancelled" });
      return { status: 409, body: { error: "Paiement annulé" } };
    }
    const chainTx = dto.transaction?.txid ?? null;
    const finalTx = chainTx ?? txid;
    if (!finalTx) return { status: 409, body: { error: "Transaction pas encore connue" } };
    if (txid && chainTx && txid !== chainTx) return { status: 422, body: { error: "txid incohérent" } };
    if (row.amountPi !== dto.amount.toFixed(7)) return { status: 422, body: { error: "Montant modifié" } };
    if (!dto.status.developer_completed) await platform.completePayment(paymentId, finalTx); // lève si Pi ne répond pas 200
    // Une seule fois : un doublon de rappel de Pi ne prolonge pas l'abonnement deux fois.
    const done = await store.completeServicePayment(paymentId, finalTx);
    if (done && done.kind === "subscription") await store.extendSubscription(done.businessId, config.SUBSCRIPTION_DAYS, now().toISOString());
    return { status: 200, body: { completed: true } };
  }

  r.post("/complete", async (req, res) => {
    try {
      const g = await guard(res); if (!g) return;
      const b = completeSchema.safeParse(req.body);
      if (!b.success) { res.status(400).json({ error: "paymentId et txid requis" }); return; }
      const out = await complete(b.data.paymentId, b.data.txid, g.user, g.platform);
      res.status(out.status).json(out.body);
    } catch (e) { fail(res, e); }
  });

  r.post("/incomplete", async (req, res) => {
    try {
      const g = await guard(res); if (!g) return;
      const b = idSchema.safeParse(req.body);
      if (!b.success) { res.status(400).json({ error: "paymentId manquant" }); return; }
      const dto = await g.platform.getPayment(b.data.paymentId);
      if (dto.status.cancelled || dto.status.user_cancelled) { await store.updateServicePayment(dto.identifier, { status: "cancelled" }); res.json({ resolved: "cancelled" }); return; }
      if (dto.status.developer_approved && dto.transaction?.txid) {
        const out = await complete(dto.identifier, null, g.user, g.platform);
        res.status(out.status).json(out.body); return;
      }
      res.status(202).json({ resolved: "pending" });
    } catch (e) { fail(res, e); }
  });

  r.post("/cancel", async (req, res) => {
    try {
      const g = await guard(res); if (!g) return;
      const b = idSchema.safeParse(req.body);
      if (!b.success) { res.status(400).json({ error: "paymentId manquant" }); return; }
      const dto = await g.platform.getPayment(b.data.paymentId);
      if (dto.user_uid === g.user.piUid && (dto.status.cancelled || dto.status.user_cancelled)) await store.updateServicePayment(dto.identifier, { status: "cancelled" });
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  return r;
}

function fail(res: Response, e: unknown) {
  console.error("billing: erreur", e instanceof PiApiError ? `Pi ${e.status}` : e instanceof Error ? e.name : "inconnue");
  if (!res.headersSent) res.status(502).json({ error: "Pi n'a pas répondu comme attendu" });
}
