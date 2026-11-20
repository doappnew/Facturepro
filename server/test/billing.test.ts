import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { PiPaymentDTO, PiPlatform } from "../src/pi/client.js";
import { MemoryStore } from "../src/store/memory.js";

function setup(env: Record<string, string> = {}) {
  const store = new MemoryStore();
  const dtos = new Map<string, PiPaymentDTO>();
  const calls: string[] = [];
  const platform: PiPlatform = {
    getPayment: async (id) => { const d = dtos.get(id); if (!d) throw new Error("404"); return d; },
    approvePayment: async (id) => { calls.push(`approve:${id}`); dtos.get(id)!.status.developer_approved = true; },
    completePayment: async (id, tx) => { calls.push(`complete:${id}:${tx}`); dtos.get(id)!.status.developer_completed = true; },
  };
  const verifyToken = vi.fn(async (t: string) => { const n = t.replace("-token-long", ""); return { uid: `uid-${n}`, username: n, scopes: ["username", "payments"] }; });
  let clock = new Date("2026-11-20T10:00:00Z");
  const app = createApp({
    store, platform, verifyToken, now: () => clock,
    config: loadConfig({ SESSION_SECRET: "s".repeat(40), PUBLIC_BASE_URL: "https://facture.test", PI_NETWORK: "testnet", BILLING_ENABLED: "1", ...env } as NodeJS.ProcessEnv),
  });
  return { app, store, dtos, calls, setClock: (d: Date) => { clock = d; },
    login: async (n: string) => ({ Authorization: `Bearer ${(await request(app).post("/api/auth/pi").send({ accessToken: `${n}-token-long` })).body.session as string}` }) };
}

async function withDraft(env: Record<string, string> = {}) {
  const s = setup(env);
  const h = await s.login("vendeur");
  await request(s.app).put("/api/business").set(h).send({ name: "Atelier", countryCode: "BJ", defaultCurrency: "PI", mode: "pi_only", paymentTermsDays: 14 }).expect(200);
  const client = (await request(s.app).post("/api/clients").set(h).send({ name: "Client" })).body;
  const mk = async () => (await request(s.app).post("/api/invoices").set(h).send({ clientId: client.id, currency: "PI", taxMode: "exclusive",
    lines: [{ description: "Service", quantity: "1", unitPrice: "5", taxRateBps: 0 }] }).expect(201)).body.id as string;
  const id = await mk();
  const dto = (over: Partial<PiPaymentDTO> = {}): PiPaymentDTO => ({
    identifier: "fee-1", user_uid: "uid-vendeur", amount: 0.5, memo: "Frais", metadata: { service: "invoice_fee", invoiceId: id },
    direction: "user_to_app", network: "Pi Testnet",
    status: { developer_approved: false, transaction_verified: false, developer_completed: false, cancelled: false, user_cancelled: false },
    transaction: null, ...over,
  });
  const pay = async (identifier: string, d: PiPaymentDTO) => {
    s.dtos.set(identifier, d);
    await request(s.app).post("/api/billing/approve").set(h).send({ paymentId: identifier }).expect(200);
    d.transaction = { txid: `tx-${identifier}`, verified: true };
    await request(s.app).post("/api/billing/complete").set(h).send({ paymentId: identifier, txid: `tx-${identifier}` }).expect(200);
  };
  return { ...s, h, id, mk, dto, pay };
}

describe("frais de service (Pi)", () => {
  it("refuse l'émission (402) tant que les frais ne sont pas réglés, puis l'accepte après paiement", async () => {
    const { app, h, id, dto, pay } = await withDraft();
    const r = await request(app).post(`/api/invoices/${id}/issue`).set(h);
    expect(r.status).toBe(402);
    expect(r.body.code).toBe("payment_required");
    expect(r.body.invoiceFeePi).toBe("0.5");
    await pay("fee-1", dto());
    expect((await request(app).post(`/api/invoices/${id}/issue`).set(h)).status).toBe(200);
  });
  it("les frais d'une facture ne couvrent pas une autre facture", async () => {
    const { app, h, id, mk, dto, pay } = await withDraft();
    await pay("fee-1", dto());
    await request(app).post(`/api/invoices/${id}/issue`).set(h).expect(200);
    const other = await mk();
    expect((await request(app).post(`/api/invoices/${other}/issue`).set(h)).status).toBe(402);
  });
  it("l'abonnement débloque toutes les émissions pendant 30 jours, puis expire", async () => {
    const { app, h, id, mk, pay, dto, setClock } = await withDraft();
    await pay("sub-1", dto({ identifier: "sub-1", amount: 10, metadata: { service: "subscription" } }));
    const st = (await request(app).get("/api/billing/status").set(h)).body;
    expect(st.subscriptionActive).toBe(true);
    expect(st.activeUntil).toBe("2026-12-20T10:00:00.000Z");
    await request(app).post(`/api/invoices/${id}/issue`).set(h).expect(200);
    await request(app).post(`/api/invoices/${await mk()}/issue`).set(h).expect(200);
    setClock(new Date("2026-12-21T10:00:00Z"));
    expect((await request(app).post(`/api/invoices/${await mk()}/issue`).set(h)).status).toBe(402);
  });
  it("un rappel en double de Pi ne prolonge pas l'abonnement deux fois", async () => {
    const { app, h, pay, dto } = await withDraft();
    await pay("sub-1", dto({ identifier: "sub-1", amount: 10, metadata: { service: "subscription" } }));
    await request(app).post("/api/billing/complete").set(h).send({ paymentId: "sub-1", txid: "tx-sub-1" }).expect(200);
    expect((await request(app).get("/api/billing/status").set(h)).body.activeUntil).toBe("2026-12-20T10:00:00.000Z");
  });
  it("refuse un mauvais montant, un autre réseau, le paiement d'un autre compte et une facture déjà émise", async () => {
    const { app, h, dtos, dto, login, id } = await withDraft();
    dtos.set("a", dto({ identifier: "a", amount: 0.1 }));
    expect((await request(app).post("/api/billing/approve").set(h).send({ paymentId: "a" })).status).toBe(422);
    dtos.set("b", dto({ identifier: "b", network: "Pi Network" }));
    expect((await request(app).post("/api/billing/approve").set(h).send({ paymentId: "b" })).status).toBe(422);
    dtos.set("c", dto({ identifier: "c" }));
    const intrus = await login("intrus");
    await request(app).put("/api/business").set(intrus).send({ name: "X", countryCode: "BJ", defaultCurrency: "PI", mode: "pi_only", paymentTermsDays: 14 }).expect(200);
    expect((await request(app).post("/api/billing/approve").set(intrus).send({ paymentId: "c" })).status).toBe(422);
    dtos.set("d", dto({ identifier: "d", metadata: { service: "invoice_fee", invoiceId: "00000000-0000-0000-0000-000000000000" } }));
    expect((await request(app).post("/api/billing/approve").set(h).send({ paymentId: "d" })).status).toBe(422);
    expect(id).toBeTruthy();
  });
  it("désactivé (BILLING_ENABLED=0) : l'émission reste libre et les routes sont absentes", async () => {
    const { app, h, id } = await withDraft({ BILLING_ENABLED: "0" });
    await request(app).post(`/api/invoices/${id}/issue`).set(h).expect(200);
    expect((await request(app).post("/api/billing/approve").set(h).send({ paymentId: "x" })).status).toBe(404);
  });
  it("les prix viennent de la configuration", async () => {
    const { app, h } = await withDraft({ FEE_INVOICE_PI: "1.25", SUBSCRIPTION_PI: "7", SUBSCRIPTION_DAYS: "10" });
    const st = (await request(app).get("/api/billing/status").set(h)).body;
    expect([st.invoiceFeePi, st.subscriptionPi, st.subscriptionDays]).toEqual(["1.25", "7", 10]);
  });
});
