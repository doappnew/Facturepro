import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { PiPaymentDTO, PiPlatform } from "../src/pi/client.js";
import { MemoryStore } from "../src/store/memory.js";
import type { PayoutClient } from "../src/testnet.js";

const base = { SESSION_SECRET: "s".repeat(40), PI_API_KEY: "cle-api", PI_WALLET_SEED: "SECRET-SEED-NE-PAS-LOGUER" };

function setup(env: Record<string, string> = {}) {
  const dtos = new Map<string, PiPaymentDTO>();
  const calls: string[] = [];
  const platform: PiPlatform = {
    getPayment: async (id) => dtos.get(id)!,
    approvePayment: async (id) => { calls.push(`approve:${id}`); dtos.get(id)!.status.developer_approved = true; },
    completePayment: async (id, tx) => { calls.push(`complete:${id}:${tx}`); dtos.get(id)!.status.developer_completed = true; },
  };
  const dto = (over: Partial<PiPaymentDTO> = {}): PiPaymentDTO => ({
    identifier: "p1", user_uid: "uid-alice", amount: 0.1, memo: "t", metadata: { testnet: "receive" },
    direction: "user_to_app", network: "Pi Testnet",
    status: { developer_approved: false, transaction_verified: false, developer_completed: false, cancelled: false, user_cancelled: false },
    transaction: null, ...over,
  });
  const payout: PayoutClient & { log: string[] } = {
    log: [],
    createPayment: async (a) => { payout.log.push(`create:${a.amount}:${a.uid}`); dtos.set("out1", dto({ identifier: "out1", direction: "app_to_user", user_uid: a.uid })); return "out1"; },
    submitPayment: async (id) => { payout.log.push(`submit:${id}`); return "txout"; },
    completePayment: async (id, tx) => { payout.log.push(`complete:${id}:${tx}`); },
  };
  const cfgEnv = { ...base, PI_NETWORK: "testnet", ...env } as Record<string, string | undefined>;
  if (cfgEnv.PI_WALLET_SEED === "__absent__") delete cfgEnv.PI_WALLET_SEED;
  const app = createApp({
    store: new MemoryStore(), platform, payoutFactory: async () => payout,
    verifyToken: async (t) => ({ uid: `uid-${t.replace("-token-long", "")}`, username: t, scopes: [] }),
    config: loadConfig(cfgEnv as NodeJS.ProcessEnv),
  });
  const login = async (n: string) => ({ Authorization: `Bearer ${(await request(app).post("/api/auth/pi").send({ accessToken: `${n}-token-long` })).body.session as string}` });
  return { app, dtos, dto, calls, payout, login };
}

describe("tests Testnet : fermés par défaut", () => {
  it("drapeaux à 0 : statut désactivé, routes 404", async () => {
    const { app, login } = setup();
    const h = await login("alice");
    expect((await request(app).get("/api/testnet/status").set(h)).body).toMatchObject({ payoutEnabled: false, receiveEnabled: false });
    expect((await request(app).post("/api/testnet/payout").set(h)).status).toBe(404);
    expect((await request(app).post("/api/testnet/receive/approve").set(h).send({ paymentId: "p1" })).status).toBe(404);
  });
  it("Mainnet : les routes de test n'existent pas, même avec les drapeaux à 1", async () => {
    const { app, login } = setup({ PI_NETWORK: "mainnet", TESTNET_PAYOUT: "1", TESTNET_RECEIVE: "1" });
    const h = await login("alice");
    expect((await request(app).get("/api/testnet/status").set(h)).status).toBe(404);
    expect((await request(app).post("/api/testnet/payout").set(h)).status).toBe(404);
  });
});

describe("envoi A2U", () => {
  it("envoie 0,1 Pi une seule fois par compte ; 5 comptes distincts comptés", async () => {
    const { app, login, payout } = setup({ TESTNET_PAYOUT: "1" });
    for (const n of ["a", "b", "c", "d", "e"]) {
      const h = await login(n);
      const r = await request(app).post("/api/testnet/payout").set(h).expect(200);
      expect(r.body.amount).toBe(0.1);
    }
    const a = await login("a");
    expect((await request(app).post("/api/testnet/payout").set(a)).status).toBe(409);
    expect((await request(app).get("/api/testnet/status").set(a)).body).toMatchObject({ payoutDone: true, distinctPayoutAccounts: 5 });
    expect(payout.log.filter((l) => l.startsWith("submit")).length).toBe(5);
  });
  it("n'envoie rien si le réseau n'est pas Pi Testnet ; nouvel essai possible après échec", async () => {
    const { app, login, payout, dtos } = setup({ TESTNET_PAYOUT: "1" });
    const h = await login("alice");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const orig = payout.createPayment;
    payout.createPayment = async (a) => { const id = await orig(a); dtos.get(id)!.network = "Pi Network"; return id; };
    expect((await request(app).post("/api/testnet/payout").set(h)).status).toBe(502);
    expect(payout.log.some((l) => l.startsWith("submit"))).toBe(false);
    payout.createPayment = orig;
    expect((await request(app).post("/api/testnet/payout").set(h)).status).toBe(200);
    spy.mockRestore();
  });
  it("ne journalise jamais la clé du portefeuille", async () => {
    const { app, login, payout } = setup({ TESTNET_PAYOUT: "1" });
    const h = await login("alice");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    payout.submitPayment = async () => { throw new Error(`échec avec ${base.PI_WALLET_SEED}`); };
    await request(app).post("/api/testnet/payout").set(h);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("SECRET-SEED");
    spy.mockRestore();
  });
  it("sans clé de portefeuille : bouton désactivé et envoi 503", async () => {
    const { app, login } = setup({ TESTNET_PAYOUT: "1", PI_WALLET_SEED: "__absent__" });
    const h = await login("alice");
    expect((await request(app).get("/api/testnet/status").set(h)).body.payoutEnabled).toBe(false);
    expect((await request(app).post("/api/testnet/payout").set(h)).status).toBe(503);
  });
});

describe("réception U2A", () => {
  it("approuve puis complète un paiement de 0,1 Pi ; second essai refusé", async () => {
    const { app, login, dtos, dto, calls } = setup({ TESTNET_RECEIVE: "1" });
    const h = await login("alice");
    dtos.set("p1", dto());
    await request(app).post("/api/testnet/receive/approve").set(h).send({ paymentId: "p1" }).expect(200);
    dtos.get("p1")!.transaction = { txid: "tx1", verified: true };
    await request(app).post("/api/testnet/receive/complete").set(h).send({ paymentId: "p1", txid: "tx1" }).expect(200);
    expect(calls).toEqual(["approve:p1", "complete:p1:tx1"]);
    expect((await request(app).get("/api/testnet/status").set(h)).body.receiveDone).toBe(true);
    dtos.set("p2", dto({ identifier: "p2" }));
    expect((await request(app).post("/api/testnet/receive/approve").set(h).send({ paymentId: "p2" })).status).toBe(409);
  });
  it("refuse un montant choisi par le navigateur, un autre réseau, un autre utilisateur", async () => {
    const { app, login, dtos, dto } = setup({ TESTNET_RECEIVE: "1" });
    const h = await login("alice");
    dtos.set("x", dto({ identifier: "x", amount: 5 }));
    expect((await request(app).post("/api/testnet/receive/approve").set(h).send({ paymentId: "x" })).status).toBe(422);
    dtos.set("y", dto({ identifier: "y", network: "Pi Network" }));
    expect((await request(app).post("/api/testnet/receive/approve").set(h).send({ paymentId: "y" })).status).toBe(422);
    dtos.set("z", dto({ identifier: "z", user_uid: "uid-autre" }));
    expect((await request(app).post("/api/testnet/receive/approve").set(h).send({ paymentId: "z" })).status).toBe(422);
  });
});

describe("createPayoutClient (vraie bibliothèque pi-backend)", () => {
  it("construit le client sans réseau avec une clé jetable et expose les 3 méthodes", async () => {
    const { Keypair } = await import("stellar-base");
    const { createPayoutClient } = await import("../src/testnet.js");
    const c = await createPayoutClient("cle-api-de-test", Keypair.random().secret());
    expect(typeof c.createPayment).toBe("function");
    expect(typeof c.submitPayment).toBe("function");
    expect(typeof c.completePayment).toBe("function");
  });
});
