import { Router, type NextFunction, type Request, type Response } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { computeInvoice, parseMoney, parseQuantity, type LineInput } from "./calc.js";
import type { Config } from "./config.js";
import { COUNTRIES } from "./countries.js";
import { CURRENCIES, getCurrency } from "./currencies.js";
import { PiApiError, type PiPlatform, type PiUser } from "./pi/client.js";
import { renderInvoicePdf } from "./pdf.js";
import { hashToken, newShareToken, signSession, verifySession } from "./session.js";
import type { Business, DraftInput, Invoice, Store } from "./store/types.js";
import { paymentsRouter } from "./payments.js";

export interface ApiDeps {
  config: Config;
  store: Store;
  verifyToken: (accessToken: string) => Promise<PiUser>;
  platform?: PiPlatform;
  now?: () => Date;
}

const countryCodes = COUNTRIES.map((c) => c.code);
const currencyCodes = [...CURRENCIES.map((c) => c.code), "PI"];
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

const businessSchema = z.object({
  name: z.string().trim().min(1).max(200),
  countryCode: z.string().refine((c) => countryCodes.includes(c), "pays non pris en charge"),
  defaultCurrency: z.string().refine((c) => currencyCodes.includes(c), "devise non prise en charge"),
  mode: z.enum(["pi_only", "web"]),
  address: optText(500), taxId: optText(100), contact: optText(200),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  paymentInstructions: optText(1000), legalMentions: optText(2000),
}).strict();

const clientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  countryCode: z.string().refine((c) => countryCodes.includes(c), "pays non pris en charge").nullish().transform((v) => v ?? null),
  address: optText(500), taxId: optText(100), contact: optText(200),
}).strict();

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.string(), // décimal en texte, 3 décimales maximum
  unitPrice: z.string(), // décimal en texte, décimales de la devise
  discountPercentBps: z.number().int().min(0).max(10000).optional(),
  discountFixed: z.string().optional(),
  taxRateBps: z.number().int().min(0).max(100000),
}).strict();

const invoiceSchema = z.object({
  clientId: z.string().uuid(),
  currency: z.string().refine((c) => currencyCodes.includes(c), "devise non prise en charge"),
  taxMode: z.enum(["exclusive", "inclusive"]),
  note: optText(1000),
  lines: z.array(lineSchema).min(1).max(100),
}).strict();

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch((e) => {
    if (e instanceof RangeError || e instanceof SyntaxError) { res.status(400).json({ error: e.message }); return; }
    console.error("api: erreur interne", e instanceof Error ? e.name : "inconnue");
    if (!res.headersSent) res.status(500).json({ error: "Erreur interne" });
    next();
  });
};

function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request, res: Response): z.infer<T> | null {
  const r = schema.safeParse(req.body);
  if (!r.success) {
    res.status(400).json({ error: "Données invalides", details: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    return null;
  }
  return r.data;
}

function buildDraft(business: Business, body: z.infer<typeof invoiceSchema>): DraftInput | string {
  if (business.mode === "pi_only" && body.currency !== "PI") return "Le mode Pi uniquement facture en Pi (devise PI)";
  getCurrency(body.currency);
  const lines: LineInput[] = body.lines.map((l) => {
    const l2: LineInput = {
      description: l.description,
      quantityMilli: parseQuantity(l.quantity),
      unitPriceMinor: parseMoney(l.unitPrice, body.currency),
      taxRateBps: l.taxRateBps,
    };
    if (l.discountPercentBps !== undefined && l.discountFixed !== undefined) throw new RangeError("Une seule remise par ligne");
    if (l.discountPercentBps !== undefined) l2.discount = { type: "percent", bps: l.discountPercentBps };
    if (l.discountFixed !== undefined) l2.discount = { type: "fixed", minor: parseMoney(l.discountFixed, body.currency) };
    return l2;
  });
  return { clientId: body.clientId, currency: body.currency, taxMode: body.taxMode, note: body.note, lines,
    totals: computeInvoice(body.currency, body.taxMode, lines) };
}

const PAYABLE = ["issued", "sent", "pending_payment", "partially_paid", "overdue"];

export function publicView(inv: Invoice, biz: Business, clientName: string, paidMinor: number) {
  return {
    number: inv.number, kind: inv.kind, status: inv.status, currency: inv.currency, currencyLabel: getCurrency(inv.currency).label,
    taxMode: inv.taxMode, issueDate: inv.issueDate, dueDate: inv.dueDate, note: inv.note,
    subtotalMinor: inv.subtotalMinor, taxTotalMinor: inv.taxTotalMinor, totalMinor: inv.totalMinor,
    paidMinor, balanceMinor: Math.max(0, inv.totalMinor - paidMinor),
    decimals: getCurrency(inv.currency).decimals,
    lines: inv.lines.map((l) => ({ description: l.description, quantityMilli: l.quantityMilli, unitPriceMinor: l.unitPriceMinor,
      discountMinor: l.discountMinor, taxRateBps: l.taxRateBps, baseMinor: l.baseMinor })),
    seller: { name: biz.name, countryCode: biz.countryCode, address: biz.address, taxId: biz.taxId, contact: biz.contact, legalMentions: biz.legalMentions },
    // Les instructions de paiement hors Pi n'existent qu'en mode web (règle Mainnet : transactions en Pi uniquement).
    paymentInstructions: biz.mode === "web" ? biz.paymentInstructions : null,
    client: { name: clientName },
    payableInPi: inv.currency === "PI" && inv.kind === "invoice" && PAYABLE.includes(inv.status) && inv.totalMinor > paidMinor,
  };
}

export function buildApi(deps: ApiDeps): Router {
  const { config, store, verifyToken } = deps;
  const now = deps.now ?? (() => new Date());
  const r = Router();
  const secret = config.SESSION_SECRET;

  const baseUrl = (req: Request) => config.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get("host")}`;

  const auth = (req: Request, res: Response, next: NextFunction) => {
    const h = req.get("authorization") ?? "";
    const sub = secret && h.startsWith("Bearer ") ? verifySession(secret, h.slice(7)) : null;
    if (!sub) { res.status(401).json({ error: "Session invalide ou expirée" }); return; }
    res.locals.userId = sub;
    next();
  };
  const needBusiness = async (res: Response): Promise<Business | null> => {
    const b = await store.getBusinessByOwner(res.locals.userId as string);
    if (!b) res.status(409).json({ error: "Créez d'abord le profil de l'entreprise" });
    return b;
  };

  // --- Connexion Pi : l'identité vient de GET /v2/me, jamais du navigateur ---
  r.post("/auth/pi", wrap(async (req, res) => {
    const body = z.object({ accessToken: z.string().min(10).max(4096) }).strict().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "accessToken manquant ou invalide" }); return; }
    if (!secret) { res.status(503).json({ error: "Sessions non configurées (SESSION_SECRET)" }); return; }
    let pi: PiUser;
    try { pi = await verifyToken(body.data.accessToken); }
    catch (e) {
      if (e instanceof PiApiError && e.status === 401) res.status(401).json({ error: "Jeton Pi invalide" });
      else res.status(502).json({ error: "Vérification Pi indisponible" });
      return;
    }
    const user = await store.upsertUser(pi.uid, pi.username ?? null);
    res.json({ session: signSession(secret, user.id), user: { username: user.piUsername }, scopes: pi.scopes });
  }));

  r.get("/reference", (_req, res) => {
    res.json({ countries: COUNTRIES, currencies: [...CURRENCIES, getCurrency("PI")] });
  });

  // --- Pages publiques (lien imprévisible) ---
  const resolveLink = async (token: string) => {
    const link = await store.findShareLink(hashToken(token));
    if (!link || link.revokedAt || (link.expiresAt && new Date(link.expiresAt) < now())) return null;
    const inv = await store.getInvoiceById(link.invoiceId);
    if (!inv) return null;
    const biz = await store.getBusinessById(inv.businessId);
    const client = await store.getClientById(inv.clientId);
    if (!biz || !client) return null;
    return { inv, biz, client };
  };
  r.get("/public/invoices/:token", wrap(async (req, res) => {
    const found = await resolveLink(String(req.params.token));
    if (!found) { res.status(404).json({ error: "Lien invalide ou expiré" }); return; }
    const paid = await store.sumCompletedPiMinor(found.inv.id);
    res.json(publicView(found.inv, found.biz, found.client.name, paid));
  }));
  r.get("/public/invoices/:token/pdf", wrap(async (req, res) => {
    const found = await resolveLink(String(req.params.token));
    if (!found) { res.status(404).json({ error: "Lien invalide ou expiré" }); return; }
    const pdf = await renderInvoicePdf(found.inv, found.biz, found.client, await store.sumCompletedPiMinor(found.inv.id));
    res.type("application/pdf").set("Content-Disposition", `inline; filename="facture-${found.inv.number}.pdf"`).send(pdf);
  }));

  // --- Espace du professionnel (session requise) ---
  r.get("/me", auth, wrap(async (_req, res) => {
    const user = await store.getUser(res.locals.userId as string);
    const business = await store.getBusinessByOwner(res.locals.userId as string);
    res.json({ user: { username: user?.piUsername ?? null }, business });
  }));

  r.put("/business", auth, wrap(async (req, res) => {
    const body = parseBody(businessSchema, req, res);
    if (!body) return;
    if (body.mode === "pi_only" && (body.defaultCurrency !== "PI" || body.paymentInstructions)) {
      res.status(400).json({ error: "Le mode Pi uniquement : devise PI et aucune instruction de paiement hors Pi" });
      return;
    }
    res.json(await store.saveBusiness(res.locals.userId as string, body));
  }));

  r.get("/clients", auth, wrap(async (_req, res) => {
    const b = await needBusiness(res); if (!b) return;
    res.json(await store.listClients(b.id));
  }));
  r.post("/clients", auth, wrap(async (req, res) => {
    const b = await needBusiness(res); if (!b) return;
    const body = parseBody(clientSchema, req, res); if (!body) return;
    res.status(201).json(await store.createClient(b.id, body));
  }));

  r.get("/invoices", auth, wrap(async (_req, res) => {
    const b = await needBusiness(res); if (!b) return;
    res.json(await store.listInvoices(b.id));
  }));
  r.post("/invoices", auth, wrap(async (req, res) => {
    const b = await needBusiness(res); if (!b) return;
    const body = parseBody(invoiceSchema, req, res); if (!body) return;
    if (!(await store.getClient(b.id, body.clientId))) { res.status(404).json({ error: "Client introuvable" }); return; }
    const draft = buildDraft(b, body);
    if (typeof draft === "string") { res.status(400).json({ error: draft }); return; }
    res.status(201).json(await store.createDraft(b.id, draft));
  }));
  r.get("/invoices/:id", auth, wrap(async (req, res) => {
    const b = await needBusiness(res); if (!b) return;
    const inv = await store.getInvoice(b.id, String(req.params.id));
    if (!inv) { res.status(404).json({ error: "Facture introuvable" }); return; }
    res.json({ ...inv, paidMinor: await store.sumCompletedPiMinor(inv.id) });
  }));
  r.put("/invoices/:id", auth, wrap(async (req, res) => {
    const b = await needBusiness(res); if (!b) return;
    const body = parseBody(invoiceSchema, req, res); if (!body) return;
    if (!(await store.getClient(b.id, body.clientId))) { res.status(404).json({ error: "Client introuvable" }); return; }
    const draft = buildDraft(b, body);
    if (typeof draft === "string") { res.status(400).json({ error: draft }); return; }
    const inv = await store.updateDraft(b.id, String(req.params.id), draft);
    if (!inv) { res.status(409).json({ error: "Seul un brouillon existant est modifiable" }); return; }
    res.json(inv);
  }));
  r.post("/invoices/:id/issue", auth, wrap(async (req, res) => {
    const b = await needBusiness(res); if (!b) return;
    const d = now();
    const issue = d.toISOString().slice(0, 10);
    const due = new Date(d.getTime() + b.paymentTermsDays * 86_400_000).toISOString().slice(0, 10);
    const inv = await store.issueInvoice(b.id, String(req.params.id), String(d.getUTCFullYear()), issue, due);
    if (!inv) { res.status(409).json({ error: "Seul un brouillon peut être émis" }); return; }
    res.json(inv);
  }));
  r.post("/invoices/:id/cancel", auth, wrap(async (req, res) => {
    const b = await needBusiness(res); if (!b) return;
    const id = String(req.params.id);
    if ((await store.sumCompletedPiMinor(id)) > 0) { res.status(409).json({ error: "Une facture avec paiement ne s'annule pas : émettez un avoir" }); return; }
    const inv = await store.setInvoiceStatus(b.id, id, ["draft", "issued", "sent", "pending_payment", "overdue"], "cancelled");
    if (!inv) { res.status(409).json({ error: "Statut actuel incompatible avec l'annulation" }); return; }
    await store.revokeShareLinks(id);
    res.json(inv);
  }));
  r.get("/invoices/:id/pdf", auth, wrap(async (req, res) => {
    const b = await needBusiness(res); if (!b) return;
    const inv = await store.getInvoice(b.id, String(req.params.id));
    const client = inv ? await store.getClient(b.id, inv.clientId) : null;
    if (!inv || !client) { res.status(404).json({ error: "Facture introuvable" }); return; }
    const pdf = await renderInvoicePdf(inv, b, client, await store.sumCompletedPiMinor(inv.id));
    res.type("application/pdf").set("Content-Disposition", `inline; filename="facture-${inv.number ?? "brouillon"}.pdf"`).send(pdf);
  }));

  // Lien de partage + QR : le QR ne contient qu'une URL HTTPS imprévisible, sans donnée client.
  r.post("/invoices/:id/share", auth, wrap(async (req, res) => {
    const b = await needBusiness(res); if (!b) return;
    const id = String(req.params.id);
    const inv = await store.getInvoice(b.id, id);
    if (!inv) { res.status(404).json({ error: "Facture introuvable" }); return; }
    if (inv.status === "draft" || inv.status === "cancelled") { res.status(409).json({ error: "Émettez la facture avant de la partager" }); return; }
    await store.revokeShareLinks(id); // un seul lien actif : l'ancien est révoqué
    const { token, hash } = newShareToken();
    const expiresAt = new Date(now().getTime() + 90 * 86_400_000).toISOString();
    await store.createShareLink(id, hash, expiresAt);
    const url = `${baseUrl(req)}/i/${token}`;
    res.status(201).json({ url, expiresAt, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 320 }) });
  }));
  r.delete("/invoices/:id/share", auth, wrap(async (req, res) => {
    const b = await needBusiness(res); if (!b) return;
    const id = String(req.params.id);
    if (!(await store.getInvoice(b.id, id))) { res.status(404).json({ error: "Facture introuvable" }); return; }
    await store.revokeShareLinks(id);
    res.status(204).end();
  }));

  // --- Paiement Pi (U2A) : session Pi du payeur requise ---
  r.use("/payments", auth, paymentsRouter({ config, store, platform: deps.platform }));

  return r;
}
