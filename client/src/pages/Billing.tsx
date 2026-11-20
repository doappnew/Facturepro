import { useCallback, useEffect, useState } from "react";
import { api, errText } from "../api";
import { piPay } from "../pi";
import { Err } from "../ui";

export interface BillingStatus {
  enabled: boolean; needsBusiness?: boolean; network?: string;
  invoiceFeePi: string; subscriptionPi: string; subscriptionDays: number;
  activeUntil: string | null; subscriptionActive: boolean; invoiceFeePaid: boolean;
}

export function useBilling(invoiceId?: string) {
  const [st, setSt] = useState<BillingStatus | null>(null);
  const reload = useCallback(async () => {
    try { setSt(await api.get<BillingStatus>(`/api/billing/status${invoiceId ? `?invoiceId=${invoiceId}` : ""}`)); } catch { setSt(null); }
  }, [invoiceId]);
  useEffect(() => { void reload(); }, [reload]);
  return { st, reload };
}

const EP = { approve: "/api/billing/approve", complete: "/api/billing/complete", cancel: "/api/billing/cancel" };
const post = (p: string, b: unknown) => api.post(p, b);
const fmt = (n: string) => (n.includes(".") ? n.replace(/0+$/, "").replace(/\.$/, "") : n);
const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

async function payFee(st: BillingStatus, invoiceId: string) {
  await piPay({ amount: Number(st.invoiceFeePi), memo: "Frais de service facture", metadata: { service: "invoice_fee", invoiceId } }, EP, post);
}
async function paySubscription(st: BillingStatus) {
  await piPay({ amount: Number(st.subscriptionPi), memo: `Abonnement ${st.subscriptionDays} jours`, metadata: { service: "subscription" } }, EP, post);
}

// Affiché sous un brouillon : l'émission exige soit les frais de cette facture, soit un abonnement actif.
export function ServiceFeeBox({ invoiceId, st, onPaid }: { invoiceId: string; st: BillingStatus; onPaid: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr("");
    try { await fn(); await onPaid(); } catch (e) { setErr(e instanceof Error && !("status" in e) ? e.message : errText(e)); }
    setBusy(false);
  };
  return (
    <section className="card">
      <h3>Frais de service</h3>
      <p className="small">Pour émettre cette facture, réglez d'abord les frais de service en Pi. Votre facture est ensuite émise automatiquement.</p>
      <button className="btn" disabled={busy} onClick={() => run(async () => { await payFee(st, invoiceId); await api.post(`/api/invoices/${invoiceId}/issue`); })}>
        {busy ? "Paiement en cours…" : `Payer ${fmt(st.invoiceFeePi)} Pi et émettre`}
      </button>
      <p className="small muted">Ou illimité pendant {st.subscriptionDays} jours :</p>
      <button className="btn sec" disabled={busy} onClick={() => run(async () => { await paySubscription(st); await api.post(`/api/invoices/${invoiceId}/issue`); })}>
        {`S'abonner : ${fmt(st.subscriptionPi)} Pi / ${st.subscriptionDays} jours, puis émettre`}
      </button>
      <Err msg={err} />
    </section>
  );
}

// Carte « Abonnement » de la page Entreprise.
export function SubscriptionCard() {
  const { st, reload } = useBilling();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  if (!st || !st.enabled || st.needsBusiness) return null;
  return (
    <section className="card">
      <h3>Abonnement</h3>
      {st.subscriptionActive && st.activeUntil
        ? <p className="small">Actif jusqu'au <b>{dateFr(st.activeUntil)}</b> : émission de factures illimitée.</p>
        : <p className="small">Sans abonnement, chaque facture émise coûte {fmt(st.invoiceFeePi)} Pi de frais de service. Avec l'abonnement, l'émission est illimitée pendant {st.subscriptionDays} jours.</p>}
      <button className="btn" disabled={busy} onClick={async () => {
        setBusy(true); setErr("");
        try { await paySubscription(st); await reload(); } catch (e) { setErr(e instanceof Error && !("status" in e) ? e.message : errText(e)); }
        setBusy(false);
      }}>{busy ? "Paiement en cours…" : st.subscriptionActive ? `Prolonger de ${st.subscriptionDays} jours : ${fmt(st.subscriptionPi)} Pi` : `S'abonner : ${fmt(st.subscriptionPi)} Pi / ${st.subscriptionDays} jours`}</button>
      <Err msg={err} />
    </section>
  );
}
