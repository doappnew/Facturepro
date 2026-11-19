// Paiement Pi utilisateur -> application (U2A) en trois phases : approbation serveur, transaction, complétion serveur.
// Le montant et la facture sont TOUJOURS revérifiés côté serveur à partir de la réponse de Pi ; le navigateur ne décide de rien.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { parseDecimal } from "./calc.js";
import type { Config } from "./config.js";
import { PiApiError, type PiPaymentDTO, type PiPlatform } from "./pi/client.js";
import type { InvoiceStatus, Store } from "./store/types.js";

const PAYABLE: InvoiceStatus[] = ["issued", "sent", "pending_payment", "partially_paid", "overdue"];
const idSchema = z.object({ paymentId: z.string().min(1).max(200) });
const completeSchema = idSchema.extend({ txid: z.string().min(1).max(200) });

export function expectedNetwork(c: Config): "Pi Testnet" | "Pi Network" {
  return c.PI_NETWORK === "testnet" ? "Pi Testnet" : "Pi Network";
}

const piAmountMinor = (n: number) => parseDecimal(n.toFixed(7), 7);

export function paymentsRouter(deps: { config: Config; store: Store; platform?: PiPlatform }): Router {
  const { config, store } = deps;
  const r = Router();

  const guard = async (req: Request, res: Response) => {
    if (!deps.platform) { res.status(503).json({ error: "Paiements Pi non configurés (PI_API_KEY)" }); return null; }
    const user = await store.getUser(res.locals.userId as string);
    if (!user) { res.status(401).json({ error: "Utilisateur inconnu" }); return null; }
    return { platform: deps.platform, user };
  };

  // Contrôles communs sur le paiement tel que Pi le décrit.
  async function checkAgainstInvoice(dto: PiPaymentDTO, userUid: string) {
    if (dto.direction !== "user_to_app") return "Ce n'est pas un paiement utilisateur vers application";
    if (dto.network !== expectedNetwork(config)) return `Réseau inattendu (${dto.network})`;
    if (dto.user_uid !== userUid) return "Ce paiement n'appartient pas à cet utilisateur";
    const invoiceId = dto.metadata && typeof dto.metadata.invoiceId === "string" ? dto.metadata.invoiceId : null;
    if (!invoiceId) return "Paiement sans facture";
    const inv = await store.getInvoiceById(invoiceId);
    if (!inv || inv.currency !== "PI" || inv.kind !== "invoice") return "Facture non payable en Pi";
    if (!PAYABLE.includes(inv.status)) return "La facture n'est pas payable dans son statut actuel";
    const remaining = inv.totalMinor - (await store.sumCompletedPiMinor(inv.id));
    if (piAmountMinor(dto.amount) !== remaining) return "Le montant ne correspond pas au solde de la facture";
    return { inv };
  }

  r.post("/approve", async (req, res) => {
    try {
      const g = await guard(req, res); if (!g) return;
      const b = idSchema.safeParse(req.body);
      if (!b.success) { res.status(400).json({ error: "paymentId manquant" }); return; }
      const dto = await g.platform.getPayment(b.data.paymentId);
      const check = await checkAgainstInvoice(dto, g.user.piUid);
      if (typeof check === "string") { res.status(422).json({ error: check }); return; }
      const existing = await store.getPiPayment(dto.identifier);
      if (!existing) {
        await store.insertPiPayment({ invoiceId: check.inv.id, piPaymentId: dto.identifier, network: dto.network,
          amountPi: dto.amount.toFixed(7), payerPiUid: g.user.piUid, status: "created", txid: null });
      }
      if (!dto.status.developer_approved) await g.platform.approvePayment(dto.identifier); // idempotent : déjà approuvé = rien à refaire
      await store.updatePiPayment(dto.identifier, { status: "approved" });
      res.json({ approved: true });
    } catch (e) { fail(res, e); }
  });

  async function complete(paymentId: string, txid: string | null, userUid: string, platform: PiPlatform) {
    const row = await store.getPiPayment(paymentId);
    if (!row || row.payerPiUid !== userUid) return { status: 404, body: { error: "Paiement inconnu" } };
    const dto = await platform.getPayment(paymentId);
    if (dto.network !== expectedNetwork(config) || dto.direction !== "user_to_app" || dto.user_uid !== userUid)
      return { status: 422, body: { error: "Paiement incohérent avec Pi" } };
    if (dto.status.cancelled || dto.status.user_cancelled) {
      await store.updatePiPayment(paymentId, { status: "cancelled" });
      return { status: 409, body: { error: "Paiement annulé" } };
    }
    const chainTx = dto.transaction?.txid ?? null;
    const finalTx = chainTx ?? txid;
    if (!finalTx) return { status: 409, body: { error: "Transaction pas encore connue" } };
    if (txid && chainTx && txid !== chainTx) return { status: 422, body: { error: "txid incohérent" } };
    if (row.amountPi !== dto.amount.toFixed(7)) return { status: 422, body: { error: "Montant modifié" } };

    if (!dto.status.developer_completed) await platform.completePayment(paymentId, finalTx); // lève si Pi ne répond pas 200
    await store.updatePiPayment(paymentId, { status: "completed", txid: finalTx });

    // La facture n'est « payée » qu'après la complétion confirmée par Pi.
    const inv = await store.getInvoiceById(row.invoiceId);
    if (inv) {
      const paid = await store.sumCompletedPiMinor(inv.id);
      await store.setInvoiceStatus(inv.businessId, inv.id, PAYABLE, paid >= inv.totalMinor ? "paid" : "partially_paid");
    }
    return { status: 200, body: { completed: true } };
  }

  r.post("/complete", async (req, res) => {
    try {
      const g = await guard(req, res); if (!g) return;
      const b = completeSchema.safeParse(req.body);
      if (!b.success) { res.status(400).json({ error: "paymentId et txid requis" }); return; }
      const out = await complete(b.data.paymentId, b.data.txid, g.user.piUid, g.platform);
      res.status(out.status).json(out.body);
    } catch (e) { fail(res, e); }
  });

  // Paiement incomplet trouvé à la connexion : on relit l'état chez Pi, on ne croit pas le navigateur.
  r.post("/incomplete", async (req, res) => {
    try {
      const g = await guard(req, res); if (!g) return;
      const b = idSchema.safeParse(req.body);
      if (!b.success) { res.status(400).json({ error: "paymentId manquant" }); return; }
      const dto = await g.platform.getPayment(b.data.paymentId);
      if (dto.status.cancelled || dto.status.user_cancelled) {
        await store.updatePiPayment(dto.identifier, { status: "cancelled" });
        res.json({ resolved: "cancelled" }); return;
      }
      if (dto.status.developer_approved && dto.transaction?.txid) {
        const out = await complete(dto.identifier, null, g.user.piUid, g.platform);
        res.status(out.status).json(out.body); return;
      }
      res.status(202).json({ resolved: "pending" });
    } catch (e) { fail(res, e); }
  });

  r.post("/cancel", async (req, res) => {
    try {
      const g = await guard(req, res); if (!g) return;
      const b = idSchema.safeParse(req.body);
      if (!b.success) { res.status(400).json({ error: "paymentId manquant" }); return; }
      const dto = await g.platform.getPayment(b.data.paymentId);
      if (dto.user_uid === g.user.piUid && (dto.status.cancelled || dto.status.user_cancelled)) {
        await store.updatePiPayment(dto.identifier, { status: "cancelled" });
      }
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  return r;
}

function fail(res: Response, e: unknown) {
  console.error("payments: erreur", e instanceof PiApiError ? `Pi ${e.status}` : e instanceof Error ? e.name : "inconnue");
  if (!res.headersSent) res.status(502).json({ error: "Pi n'a pas répondu comme attendu" });
}
