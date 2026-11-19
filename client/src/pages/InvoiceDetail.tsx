import { useCallback, useEffect, useState } from "react";
import { api, errText } from "../api";
import { navigate } from "../router";
import { Err, Paper } from "../ui";
import type { Business, Client, Invoice } from "../types";

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function InvoiceDetail({ id, business }: { id: string; business: Business }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [share, setShare] = useState<{ url: string; qrDataUrl: string } | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const i = await api.get<Invoice>(`/api/invoices/${id}`);
      setInv(i);
      setClient((await api.get<Client[]>("/api/clients")).find((c) => c.id === i.clientId) ?? null);
    } catch (e) { setErr(errText(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<void>) => { setBusy(true); setErr(""); try { await fn(); await load(); } catch (e) { setErr(errText(e)); } setBusy(false); };
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  if (!inv) return <><button className="back" onClick={() => navigate("/factures")}>← Factures</button><Err msg={err} />{!err && <p className="muted">Chargement…</p>}</>;

  return (
    <>
      <button className="back" onClick={() => navigate("/factures")}>← Factures</button>
      <Paper d={{ ...inv, seller: business, clientName: client?.name ?? "Client" }} />
      <Err msg={err} />

      {inv.status === "draft" && (
        <>
          <div className="note info">Brouillon : relisez l'aperçu ci-dessus. L'émission attribue le numéro définitif et fige les lignes.</div>
          <button className="btn" disabled={busy} onClick={() => act(async () => { await api.post(`/api/invoices/${id}/issue`); })}>Émettre la facture</button>
        </>
      )}

      {inv.status !== "draft" && inv.status !== "cancelled" && (
        <button className="btn" disabled={busy} onClick={() => act(async () => { setShare(await api.post(`/api/invoices/${id}/share`)); })}>Partager / QR code</button>
      )}
      {share && (
        <section className="card">
          <div className="qr"><img src={share.qrDataUrl} alt="QR code de la facture" /></div>
          <p className="small" style={{ wordBreak: "break-all" }}>{share.url}</p>
          <p className="small muted">Le QR ne contient que ce lien. Un nouveau lien révoque l'ancien.</p>
          <div className="row2">
            <button className="btn sec" onClick={async () => { try { await navigator.clipboard.writeText(share.url); say("Lien copié"); } catch { say("Copiez le lien ci-dessus"); } }}>Copier</button>
            {typeof navigator.share === "function" && <button className="btn sec" onClick={() => navigator.share({ title: "Facture", url: share.url }).catch(() => undefined)}>Partager</button>}
          </div>
          <button className="btn danger" onClick={() => act(async () => { await api.del(`/api/invoices/${id}/share`); setShare(null); })}>Révoquer le lien</button>
        </section>
      )}

      <button className="btn sec" disabled={busy} onClick={() => act(async () => { downloadBlob(await api.blob(`/api/invoices/${id}/pdf`), `facture-${inv.number ?? "brouillon"}.pdf`); })}>Télécharger le PDF</button>
      <p className="small muted">Le téléchargement peut être limité dans Pi Browser : si rien ne se passe, ouvrez le lien de partage dans un autre navigateur.</p>

      {["draft", "issued", "sent", "pending_payment", "overdue"].includes(inv.status) && inv.paidMinor === 0 && (
        <button className="btn danger" disabled={busy} onClick={() => act(async () => { await api.post(`/api/invoices/${id}/cancel`); setShare(null); })}>Annuler la facture</button>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
