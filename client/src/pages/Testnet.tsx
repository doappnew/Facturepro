// Boutons de test Testnet exigés par la core team. Ils n'apparaissent que si le serveur les active
// (TESTNET_PAYOUT / TESTNET_RECEIVE = 1) et sont à retirer avant le Mainnet.
import { useEffect, useState } from "react";
import { api, errText } from "../api";
import { loginWithPi } from "../auth";
import { piPay } from "../pi";
import { Err } from "../ui";

interface Status { payoutEnabled: boolean; receiveEnabled: boolean; amount: number; payoutDone: boolean; receiveDone: boolean; distinctPayoutAccounts: number }
const useStatus = (reload: number) => {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => { api.get<Status>("/api/testnet/status").then(setS).catch(() => setS(null)); }, [reload]);
  return s;
};

export function TestnetSend() {
  const [n, setN] = useState(0);
  const s = useStatus(n);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [ok, setOk] = useState("");
  if (!s?.payoutEnabled) return null;
  const go = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      await loginWithPi(["username", "payments", "wallet_address"]); // autorisation demandée AU MOMENT DU CLIC
      const r = await api.post<{ txid: string }>("/api/testnet/payout");
      setOk(`Envoyé (transaction ${r.txid.slice(0, 10)}…).`); setN((x) => x + 1);
    } catch (e) { setErr(e instanceof Error && !("status" in e) ? e.message : errText(e)); }
    setBusy(false);
  };
  return (
    <section className="card">
      <h3>Test Testnet : envoi (A2U)</h3>
      <p className="small muted">L'application vous envoie {s.amount} Pi (Testnet). Une seule fois par compte. Comptes testés : {s.distinctPayoutAccounts}/5.</p>
      <button className="btn warn" onClick={go} disabled={busy || s.payoutDone}>{s.payoutDone ? "Déjà testé" : busy ? "Envoi…" : "Lancer le test d'envoi"}</button>
      {ok && <div className="note info">{ok}</div>}<Err msg={err} />
    </section>
  );
}

export function TestnetReceive() {
  const [n, setN] = useState(0);
  const s = useStatus(n);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [ok, setOk] = useState("");
  if (!s?.receiveEnabled) return null;
  const go = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      await piPay({ amount: s.amount, memo: "Test Testnet FacturePro", metadata: { testnet: "receive" } },
        { approve: "/api/testnet/receive/approve", complete: "/api/testnet/receive/complete" }, (p, b) => api.post(p, b));
      setOk("Paiement de test reçu."); setN((x) => x + 1);
    } catch (e) { setErr(e instanceof Error && !("status" in e) ? e.message : errText(e)); }
    setBusy(false);
  };
  return (
    <section className="card">
      <h3>Test Testnet : réception (U2A)</h3>
      <p className="small muted">Vous payez {s.amount} Pi (Testnet) à l'application. Une seule fois par compte.</p>
      <button className="btn warn" onClick={go} disabled={busy || s.receiveDone}>{s.receiveDone ? "Déjà testé" : busy ? "Paiement…" : "Lancer le test de réception"}</button>
      {ok && <div className="note info">{ok}</div>}<Err msg={err} />
    </section>
  );
}
