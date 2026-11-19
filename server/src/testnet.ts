// Tests Testnet exigés par la core team : un bouton d'ENVOI (A2U) et un bouton de RÉCEPTION (U2A).
// Fermés par défaut (TESTNET_PAYOUT / TESTNET_RECEIVE = 0) et jamais montés en Mainnet.
// Montant fixé par le serveur, plafond 20 Pi, une seule fois par compte, réseau « Pi Testnet » vérifié.
import { Router, type Response } from "express";
import { z } from "zod";
import type { Config } from "./config.js";
import type { PiPlatform } from "./pi/client.js";
import type { Store } from "./store/types.js";

export const TEST_AMOUNT = 0.1;
export const TEST_CAP = 20;

export interface PayoutClient {
  createPayment(args: { amount: number; memo: string; metadata: object; uid: string }): Promise<string>;
  submitPayment(paymentId: string): Promise<string>;
  completePayment(paymentId: string, txid: string): Promise<unknown>;
}

// Bibliothèque officielle pi-backend 0.1.3 : exige la clé API ET la clé du portefeuille de l'app.
export async function createPayoutClient(apiKey: string, walletSeed: string): Promise<PayoutClient> {
  const mod = await import("pi-backend");
  const PiNetwork = (mod as unknown as { default: new (k: string, s: string) => PayoutClient }).default;
  return new PiNetwork(apiKey, walletSeed);
}

const idSchema = z.object({ paymentId: z.string().min(1).max(200) });
const completeSchema = idSchema.extend({ txid: z.string().min(1).max(200) });

export function testnetRouter(deps: {
  config: Config; store: Store; platform?: PiPlatform; payoutFactory?: () => Promise<PayoutClient>;
}): Router {
  const { config, store } = deps;
  const r = Router();
  const net = "Pi Testnet";

  const user = async (res: Response) => {
    const u = await store.getUser(res.locals.userId as string);
    if (!u) res.status(401).json({ error: "Utilisateur inconnu" });
    return u;
  };
  const err = (res: Response, e: unknown) => {
    console.error("testnet: erreur", e instanceof Error ? e.name : "inconnue"); // jamais de clé ni de graine
    if (!res.headersSent) res.status(502).json({ error: "Le test a échoué côté Pi" });
  };

  r.get("/status", async (_req, res) => {
    const u = await user(res); if (!u) return;
    const mine = await store.listTestnet(u.piUid);
    res.json({
      payoutEnabled: config.TESTNET_PAYOUT === "1" && !!config.PI_WALLET_SEED && !!config.PI_API_KEY,
      receiveEnabled: config.TESTNET_RECEIVE === "1" && !!deps.platform,
      amount: TEST_AMOUNT,
      payoutDone: mine.some((t) => t.kind === "payout" && t.status === "done"),
      receiveDone: mine.some((t) => t.kind === "receive" && t.status === "done"),
      distinctPayoutAccounts: await store.countTestnetDone("payout"),
    });
  });

  // ENVOI (A2U) : l'app envoie 0,1 Pi au compte connecté.
  r.post("/payout", async (_req, res) => {
    if (config.TESTNET_PAYOUT !== "1") { res.status(404).json({ error: "Introuvable" }); return; }
    const u = await user(res); if (!u) return;
    if (!config.PI_API_KEY || !config.PI_WALLET_SEED || !deps.platform) { res.status(503).json({ error: "Portefeuille de l'app non configuré" }); return; }
    if (TEST_AMOUNT > TEST_CAP) { res.status(500).json({ error: "Plafond dépassé" }); return; }
    if (!(await store.claimTestnet(u.piUid, "payout"))) { res.status(409).json({ error: "Déjà testé avec ce compte" }); return; }
    let paymentId: string | null = null;
    try {
      const client = await (deps.payoutFactory ?? (() => createPayoutClient(config.PI_API_KEY!, config.PI_WALLET_SEED!)))();
      paymentId = await client.createPayment({ amount: TEST_AMOUNT, memo: "Test Testnet FacturePro", metadata: { testnet: "payout" }, uid: u.piUid });
      const dto = await deps.platform.getPayment(paymentId);
      if (dto.network !== net) throw new Error("réseau inattendu"); // on n'envoie jamais hors Testnet
      const txid = await client.submitPayment(paymentId);
      await client.completePayment(paymentId, txid);
      await store.finishTestnet(u.piUid, "payout", { paymentId, txid, status: "done" });
      res.json({ done: true, txid, amount: TEST_AMOUNT, distinctPayoutAccounts: await store.countTestnetDone("payout") });
    } catch (e) {
      await store.finishTestnet(u.piUid, "payout", { paymentId, status: "failed" });
      err(res, e);
    }
  });

  // RÉCEPTION (U2A) : l'utilisateur paie 0,1 Pi à l'app ; le montant et le réseau sont revérifiés ici.
  const checkReceive = async (res: Response, paymentId: string, piUid: string) => {
    const dto = await deps.platform!.getPayment(paymentId);
    const meta = dto.metadata as { testnet?: unknown } | null;
    const ok = dto.direction === "user_to_app" && dto.network === net && dto.user_uid === piUid
      && meta?.testnet === "receive" && dto.amount === TEST_AMOUNT;
    if (!ok) { res.status(422).json({ error: "Paiement de test incohérent" }); return null; }
    return dto;
  };
  r.post("/receive/approve", async (req, res) => {
    try {
      if (config.TESTNET_RECEIVE !== "1") { res.status(404).json({ error: "Introuvable" }); return; }
      if (!deps.platform) { res.status(503).json({ error: "Paiements Pi non configurés" }); return; }
      const u = await user(res); if (!u) return;
      const b = idSchema.safeParse(req.body);
      if (!b.success) { res.status(400).json({ error: "paymentId manquant" }); return; }
      const dto = await checkReceive(res, b.data.paymentId, u.piUid); if (!dto) return;
      if (!(await store.claimTestnet(u.piUid, "receive")) && !dto.status.developer_approved) {
        res.status(409).json({ error: "Déjà testé avec ce compte" }); return;
      }
      if (!dto.status.developer_approved) await deps.platform.approvePayment(dto.identifier);
      res.json({ approved: true });
    } catch (e) { err(res, e); }
  });
  r.post("/receive/complete", async (req, res) => {
    try {
      if (config.TESTNET_RECEIVE !== "1") { res.status(404).json({ error: "Introuvable" }); return; }
      if (!deps.platform) { res.status(503).json({ error: "Paiements Pi non configurés" }); return; }
      const u = await user(res); if (!u) return;
      const b = completeSchema.safeParse(req.body);
      if (!b.success) { res.status(400).json({ error: "paymentId et txid requis" }); return; }
      const dto = await checkReceive(res, b.data.paymentId, u.piUid); if (!dto) return;
      if (!dto.status.developer_completed) await deps.platform.completePayment(dto.identifier, dto.transaction?.txid ?? b.data.txid);
      await store.finishTestnet(u.piUid, "receive", { paymentId: dto.identifier, txid: dto.transaction?.txid ?? b.data.txid, status: "done" });
      res.json({ completed: true });
    } catch (e) { err(res, e); }
  });
  return r;
}
