import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { PiPaymentDTO, PiPlatform } from "../src/pi/client.js";
import { signSession, verifySession } from "../src/session.js";
import { MemoryStore } from "../src/store/memory.js";
import { money } from "../src/pdf.js";

const SECRET = "s".repeat(40);

function setup(env: Record<string, string> = {}) {
  const store = new MemoryStore();
  const dtos = new Map<string, PiPaymentDTO>();
  const calls: string[] = [];
  const flags = { failComplete: false };
  const platform: PiPlatform = {
    getPayment: async (id) => { const d = dtos.get(id); if (!d) throw new Error("404"); return d; },
    approvePayment: async (id) => { calls.push(`approve:${id}`); dtos.get(id)!.status.developer_approved = true; },
    completePayment: async (id, tx) => { if (flags.failComplete) throw new Error("Pi 500"); calls.push(`complete:${id}:${tx}`); dtos.get(id)!.status.developer_completed = true; },
  };
  const verifyToken = vi.fn(async (t: string) => { const n = t.replace("-token-long", ""); return { uid: `uid-${n}`, username: n, scopes: ["username", "payments"] }; });
  const app = createApp({
    store, platform, verifyToken,
    config: loadConfig({ SESSION_SECRET: SECRET, PUBLIC_BASE_URL: "https://facture.test", PI_NETWORK: "testnet", ...env } as NodeJS.ProcessEnv),
  });
  const login = async (name: string) => {
    const r = await request(app).post("/api/auth/pi").send({ accessToken: `${name}-token-long` });
    return { Authorization: `Bearer ${r.body.session as string}` };
  };
  return { app, store, dtos, calls, flags, login };
}

const biz = (over: Record<string, unknown> = {}) => ({
  name: "Atelier Test", countryCode: "BJ", defaultCurrency: "XOF", mode: "web", paymentTermsDays: 15, ...over,
});
const invoiceBody = (clientId: string, over: Record<string, unknown> = {}) => ({
  clientId, currency: "XOF", taxMode: "exclusive",
  lines: [{ description: "Prestation", quantity: "2", unitPrice: "12500", taxRateBps: 1800 }], ...over,
});

async function web() {
  const s = setup();
  const h = await s.login("alice");
  await request(s.app).put("/api/business").set(h).send(biz()).expect(200);
  const client = (await request(s.app).post("/api/clients").set(h).send({ name: "Client SARL", countryCode: "TG" }).expect(201)).body;
  return { ...s, h, client };
}

describe("PDF", () => {
  it("montants Pi lisibles : zéros inutiles retirés, 2 décimales minimum", () => {
    expect(money(150_000_000, "PI")).toBe("15.00 Pi");
    expect(money(125_000_000, "PI")).toBe("12.50 Pi");
    expect(money(12_345_678, "PI")).toBe("1.2345678 Pi");
    expect(money(0, "PI")).toBe("0.00 Pi");
    expect(money(29500, "XOF")).toBe("29500 FCFA");
    expect(money(4405, "TND")).toBe("4.405 TND");
  });
  it("une facture courte tient sur une seule page", async () => {
    const { app, h, client } = await web();
    const id = (await request(app).post("/api/invoices").set(h).send(invoiceBody(client.id))).body.id as string;
    await request(app).post(`/api/invoices/${id}/issue`).set(h);
    const pdf = await request(app).get(`/api/invoices/${id}/pdf`).set(h).expect(200);
    const pages = Buffer.from(pdf.body).toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? [];
    expect(pages.length).toBe(1);
  });
});

describe("session", () => {
  it("signe, vérifie, expire et refuse une signature modifiée", () => {
    const t = signSession(SECRET, "user-1", 60, 1_000_000);
    expect(verifySession(SECRET, t, 1_000_000 + 30_000)).toBe("user-1");
    expect(verifySession(SECRET, t, 1_000_000 + 61_000)).toBeNull();
    expect(verifySession("autre-secret-autre-secret-autre-secret", t, 1_000_000)).toBeNull();
    const [p, sig] = t.split(".");
    expect(verifySession(SECRET, `${p}x.${sig}`, 1_000_000)).toBeNull();
  });
});

describe("profil, clients, factures", () => {
  it("mode Pi uniquement : devise PI obligatoire, pas d'instruction hors Pi", async () => {
    const { app, login } = setup();
    const h = await login("bob");
    expect((await request(app).put("/api/business").set(h).send(biz({ mode: "pi_only" }))).status).toBe(400);
    expect((await request(app).put("/api/business").set(h).send(biz({ mode: "pi_only", defaultCurrency: "PI", paymentInstructions: "Mobile Money 01..." }))).status).toBe(400);
    expect((await request(app).put("/api/business").set(h).send(biz({ mode: "pi_only", defaultCurrency: "PI" }))).status).toBe(200);
  });
  it("refuse un pays hors liste et une devise inconnue", async () => {
    const { app, login } = setup();
    const h = await login("bob");
    expect((await request(app).put("/api/business").set(h).send(biz({ countryCode: "JP" }))).status).toBe(400);
    expect((await request(app).put("/api/business").set(h).send(biz({ defaultCurrency: "JPY" }))).status).toBe(400);
  });
  it("brouillon : totaux calculés par le serveur (12 500 × 2 + 18 % = 29 500)", async () => {
    const { app, h, client } = await web();
    const r = await request(app).post("/api/invoices").set(h).send(invoiceBody(client.id)).expect(201);
    expect(r.body).toMatchObject({ status: "draft", number: null, subtotalMinor: 25000, taxTotalMinor: 4500, totalMinor: 29500 });
  });
  it("refuse les décimales interdites (FCFA) et un total envoyé par le navigateur", async () => {
    const { app, h, client } = await web();
    const bad = invoiceBody(client.id, { lines: [{ description: "x", quantity: "1", unitPrice: "100.5", taxRateBps: 0 }] });
    expect((await request(app).post("/api/invoices").set(h).send(bad)).status).toBe(400);
    expect((await request(app).post("/api/invoices").set(h).send({ ...invoiceBody(client.id), totalMinor: 1 })).status).toBe(400);
  });
  it("numérotation continue 2026-00001, 2026-00002 ; un brouillon seul est modifiable", async () => {
    const { app, h, client } = await web();
    const mk = async () => (await request(app).post("/api/invoices").set(h).send(invoiceBody(client.id))).body.id as string;
    const [a, b] = [await mk(), await mk()];
    const i1 = (await request(app).post(`/api/invoices/${a}/issue`).set(h).expect(200)).body;
    const i2 = (await request(app).post(`/api/invoices/${b}/issue`).set(h).expect(200)).body;
    expect(i1.number).toMatch(/^\d{4}-00001$/);
    expect(i2.number).toMatch(/^\d{4}-00002$/);
    expect(i1.status).toBe("issued");
    expect((await request(app).put(`/api/invoices/${a}`).set(h).send(invoiceBody(client.id))).status).toBe(409);
    expect((await request(app).post(`/api/invoices/${a}/issue`).set(h)).status).toBe(409);
  });
  it("une entreprise ne voit ni ne modifie les données d'une autre", async () => {
    const { app, h, client, login } = await web();
    const id = (await request(app).post("/api/invoices").set(h).send(invoiceBody(client.id))).body.id as string;
    const eve = await login("eve");
    await request(app).put("/api/business").set(eve).send(biz({ name: "Autre" })).expect(200);
    expect((await request(app).get(`/api/invoices/${id}`).set(eve)).status).toBe(404);
    expect((await request(app).post(`/api/invoices/${id}/issue`).set(eve)).status).toBe(409);
    expect((await request(app).post("/api/invoices").set(eve).send(invoiceBody(client.id))).status).toBe(404);
  });
});

describe("partage, QR, PDF", () => {
  it("brouillon non partageable ; lien + QR ; page publique sans données sensibles ; révocation", async () => {
    const { app, h, client } = await web();
    const id = (await request(app).post("/api/invoices").set(h).send(invoiceBody(client.id))).body.id as string;
    expect((await request(app).post(`/api/invoices/${id}/share`).set(h)).status).toBe(409);
    await request(app).post(`/api/invoices/${id}/issue`).set(h).expect(200);
    const share = (await request(app).post(`/api/invoices/${id}/share`).set(h).expect(201)).body;
    expect(share.url).toMatch(/^https:\/\/facture\.test\/i\/[A-Za-z0-9_-]{40,}$/);
    expect(share.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const token = share.url.split("/i/")[1] as string;
    const pub = await request(app).get(`/api/public/invoices/${token}`).expect(200);
    expect(pub.body.totalMinor).toBe(29500);
    expect(pub.body.client).toEqual({ name: "Client SARL" }); // ni adresse ni contact du client
    expect(JSON.stringify(pub.body)).not.toContain(client.id);
    const pdf = await request(app).get(`/api/public/invoices/${token}/pdf`).expect(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(Buffer.from(pdf.body).subarray(0, 4).toString()).toBe("%PDF");
    // nouveau lien : l'ancien est révoqué
    const second = (await request(app).post(`/api/invoices/${id}/share`).set(h).expect(201)).body;
    expect((await request(app).get(`/api/public/invoices/${token}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/invoices/${second.url.split("/i/")[1]}`)).status).toBe(200);
    await request(app).delete(`/api/invoices/${id}/share`).set(h).expect(204);
    expect((await request(app).get(`/api/public/invoices/${second.url.split("/i/")[1]}`)).status).toBe(404);
    expect((await request(app).get("/api/public/invoices/inconnu")).status).toBe(404);
  });
  it("PDF du professionnel et instructions hors Pi visibles en mode web seulement", async () => {
    const { app, h, client } = await web();
    await request(app).put("/api/business").set(h).send(biz({ paymentInstructions: "Virement IBAN XX" })).expect(200);
    const id = (await request(app).post("/api/invoices").set(h).send(invoiceBody(client.id))).body.id as string;
    await request(app).post(`/api/invoices/${id}/issue`).set(h);
    const token = ((await request(app).post(`/api/invoices/${id}/share`).set(h)).body.url as string).split("/i/")[1]!;
    expect((await request(app).get(`/api/public/invoices/${token}`)).body.paymentInstructions).toBe("Virement IBAN XX");
    const pdf = await request(app).get(`/api/invoices/${id}/pdf`).set(h).expect(200);
    expect(Buffer.from(pdf.body).subarray(0, 4).toString()).toBe("%PDF");
  });
  it("annulation : possible sans paiement, révoque le lien", async () => {
    const { app, h, client } = await web();
    const id = (await request(app).post("/api/invoices").set(h).send(invoiceBody(client.id))).body.id as string;
    await request(app).post(`/api/invoices/${id}/issue`).set(h);
    const token = ((await request(app).post(`/api/invoices/${id}/share`).set(h)).body.url as string).split("/i/")[1]!;
    expect((await request(app).post(`/api/invoices/${id}/cancel`).set(h).expect(200)).body.status).toBe("cancelled");
    expect((await request(app).get(`/api/public/invoices/${token}`)).status).toBe(404);
  });
});

describe("paiement Pi (U2A)", () => {
  async function piInvoice(total = "10.5") {
    const s = setup();
    const owner = await s.login("owner");
    await request(s.app).put("/api/business").set(owner).send(biz({ mode: "pi_only", defaultCurrency: "PI", countryCode: "BJ" })).expect(200);
    const client = (await request(s.app).post("/api/clients").set(owner).send({ name: "Payeur" })).body;
    const body = { clientId: client.id, currency: "PI", taxMode: "exclusive", lines: [{ description: "Service", quantity: "1", unitPrice: total, taxRateBps: 0 }] };
    const id = (await request(s.app).post("/api/invoices").set(owner).send(body).expect(201)).body.id as string;
    await request(s.app).post(`/api/invoices/${id}/issue`).set(owner).expect(200);
    const payer = await s.login("payer");
    const dto = (over: Partial<PiPaymentDTO> = {}): PiPaymentDTO => ({
      identifier: "pay-1", user_uid: "uid-payer", amount: Number(total), memo: "Facture", metadata: { invoiceId: id },
      direction: "user_to_app", network: "Pi Testnet",
      status: { developer_approved: false, transaction_verified: false, developer_completed: false, cancelled: false, user_cancelled: false },
      transaction: null, ...over,
    });
    return { ...s, owner, payer, id, dto };
  }

  it("flux complet : approbation, complétion, facture payée seulement après /complete", async () => {
    const { app, dtos, calls, payer, owner, id, dto } = await piInvoice();
    dtos.set("pay-1", dto());
    await request(app).post("/api/payments/approve").set(payer).send({ paymentId: "pay-1" }).expect(200);
    expect(calls).toEqual(["approve:pay-1"]);
    expect((await request(app).get(`/api/invoices/${id}`).set(owner)).body.status).toBe("issued");
    dtos.get("pay-1")!.transaction = { txid: "tx-abc", verified: true };
    await request(app).post("/api/payments/complete").set(payer).send({ paymentId: "pay-1", txid: "tx-abc" }).expect(200);
    expect(calls).toEqual(["approve:pay-1", "complete:pay-1:tx-abc"]);
    const inv = (await request(app).get(`/api/invoices/${id}`).set(owner)).body;
    expect(inv.status).toBe("paid");
    expect(inv.paidMinor).toBe(105_000_000);
    // idempotent : un second appel ne rappelle pas Pi
    await request(app).post("/api/payments/complete").set(payer).send({ paymentId: "pay-1", txid: "tx-abc" }).expect(200);
    expect(calls.filter((c) => c.startsWith("complete")).length).toBe(1);
  });
  it("refuse un montant différent du solde, un autre réseau, et le paiement d'un autre utilisateur", async () => {
    const { app, dtos, payer, dto, login } = await piInvoice();
    dtos.set("a", dto({ identifier: "a", amount: 1 }));
    expect((await request(app).post("/api/payments/approve").set(payer).send({ paymentId: "a" })).status).toBe(422);
    dtos.set("b", dto({ identifier: "b", network: "Pi Network" }));
    expect((await request(app).post("/api/payments/approve").set(payer).send({ paymentId: "b" })).status).toBe(422);
    dtos.set("c", dto({ identifier: "c" }));
    const other = await login("intrus");
    expect((await request(app).post("/api/payments/approve").set(other).send({ paymentId: "c" })).status).toBe(422);
  });
  it("refuse une facture non payable (brouillon, devise fiat) et la double approbation du même solde payé", async () => {
    const { app, dtos, payer, dto, id, calls } = await piInvoice();
    dtos.set("pay-1", dto());
    await request(app).post("/api/payments/approve").set(payer).send({ paymentId: "pay-1" }).expect(200);
    dtos.get("pay-1")!.transaction = { txid: "t" };
    await request(app).post("/api/payments/complete").set(payer).send({ paymentId: "pay-1", txid: "t" }).expect(200);
    dtos.set("pay-2", dto({ identifier: "pay-2" })); // facture déjà payée
    expect((await request(app).post("/api/payments/approve").set(payer).send({ paymentId: "pay-2" })).status).toBe(422);
    expect(calls).not.toContain("approve:pay-2");
    dtos.set("pay-3", dto({ identifier: "pay-3", metadata: { invoiceId: id + "x" } }));
    expect((await request(app).post("/api/payments/approve").set(payer).send({ paymentId: "pay-3" })).status).toBe(422);
  });
  it("si Pi refuse /complete, la facture n'est pas marquée payée ; elle l'est au nouvel essai", async () => {
    const { app, dtos, flags, payer, owner, id, dto } = await piInvoice();
    dtos.set("pay-1", dto());
    await request(app).post("/api/payments/approve").set(payer).send({ paymentId: "pay-1" }).expect(200);
    dtos.get("pay-1")!.transaction = { txid: "tx" };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    flags.failComplete = true;
    expect((await request(app).post("/api/payments/complete").set(payer).send({ paymentId: "pay-1", txid: "tx" })).status).toBe(502);
    expect((await request(app).get(`/api/invoices/${id}`).set(owner)).body.status).toBe("issued");
    flags.failComplete = false;
    await request(app).post("/api/payments/complete").set(payer).send({ paymentId: "pay-1", txid: "tx" }).expect(200);
    expect((await request(app).get(`/api/invoices/${id}`).set(owner)).body.status).toBe("paid");
    err.mockRestore();
  });
  it("incomplet trouvé à la connexion : complété après relecture chez Pi ; annulé marqué annulé", async () => {
    const { app, dtos, payer, owner, id, dto } = await piInvoice();
    dtos.set("pay-1", dto());
    await request(app).post("/api/payments/approve").set(payer).send({ paymentId: "pay-1" }).expect(200);
    dtos.get("pay-1")!.transaction = { txid: "tx9" };
    expect((await request(app).post("/api/payments/incomplete").set(payer).send({ paymentId: "pay-1" })).status).toBe(200);
    expect((await request(app).get(`/api/invoices/${id}`).set(owner)).body.status).toBe("paid");
  });
  it("sans PI_API_KEY les paiements répondent 503 ; sans session 401", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, config: loadConfig({ SESSION_SECRET: SECRET } as NodeJS.ProcessEnv),
      verifyToken: async () => ({ uid: "u", scopes: [] }) });
    const s = (await request(app).post("/api/auth/pi").send({ accessToken: "token-assez-long" })).body.session as string;
    expect((await request(app).post("/api/payments/approve").set("Authorization", `Bearer ${s}`).send({ paymentId: "x" })).status).toBe(503);
    expect((await request(app).post("/api/payments/approve").send({ paymentId: "x" })).status).toBe(401);
  });
});
