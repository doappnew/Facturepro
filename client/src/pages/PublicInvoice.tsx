import { useEffect, useState } from "react";
import { api, errText, hasSession } from "../api";
import { loginWithPi } from "../auth";
import { piNumber } from "../money";
import { hasPi, piPay } from "../pi";
import { Err, Paper } from "../ui";
import type { PublicInvoice as PI } from "../types";
import { downloadBlob } from "./InvoiceDetail";

// Page de facture lisible dans N'IMPORTE QUEL navigateur. Le paiement Pi n'est possible que dans Pi Browser.
export function PublicInvoice({ token }: { token: string }) {
  const [v, setV] = useState<PI | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const load = () => api.get<PI>(`/api/public/invoices/${encodeURIComponent(token)}`).then(setV).catch((e) => setErr(errText(e)));
  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!v) return <main className="app"><div className="brand"><span className="logo">F</span>FacturePro</div>{err ? <><Err msg={err} /><p className="muted">Ce lien est invalide, expiré ou a été révoqué.</p></> : <p className="muted">Chargement…</p>}</main>;

  const pay = async () => {
    setBusy(true); setErr("");
    try {
      if (!hasSession()) await loginWithPi();
      await piPay(
        { amount: piNumber(v.balanceMinor), memo: `Facture ${v.number ?? ""}`.trim().slice(0, 28), metadata: { invoiceId: v.payRef } },
        { approve: "/api/payments/approve", complete: "/api/payments/complete", cancel: "/api/payments/cancel" },
        (p, b) => api.post(p, b),
      );
      setDone(true); await load();
    } catch (e) { setErr(e instanceof Error && !("status" in e) ? e.message : errText(e)); }
    setBusy(false);
  };

  return (
    <main className="app">
      <div className="brand"><span className="logo">F</span>FacturePro</div>
      <Paper d={{ ...v, clientName: v.client.name }} />
      {done && <div className="note info">Paiement reçu. Merci !</div>}
      {v.payableInPi && (
        <>
          <button className="btn" onClick={pay} disabled={busy}>{busy ? "Paiement en cours…" : "Payer en Pi"}</button>
          {!hasPi() && <div className="note warn">Le paiement en Pi se fait dans Pi Browser. Ouvrez cette facture dans Pi Browser pour la payer.</div>}
        </>
      )}
      {v.paymentInstructions && (
        <section className="card"><h3>Instructions de paiement du professionnel</h3><p className="small" style={{ whiteSpace: "pre-wrap" }}>{v.paymentInstructions}</p>
          <div className="note warn">Paiement hors Pi : non vérifié automatiquement. La facture n'est marquée payée qu'après vérification par le professionnel.</div></section>
      )}
      <Err msg={err} />
      <button className="btn sec" onClick={async () => { try { downloadBlob(await api.blob(`/api/public/invoices/${encodeURIComponent(token)}/pdf`), `facture-${v.number}.pdf`); } catch (e) { setErr(errText(e)); } }}>Télécharger le PDF</button>
      <p className="legal">FacturePro est une application indépendante, non affiliée à Pi Network. Pi Network is a trademark of PI Community Company. <a href="/confidentialite">Confidentialité</a> · <a href="/conditions">Conditions</a></p>
    </main>
  );
}
