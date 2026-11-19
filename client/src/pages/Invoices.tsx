import { useEffect, useState } from "react";
import { api } from "../api";
import { formatMinor } from "../money";
import { navigate } from "../router";
import { Chip } from "../ui";
import type { Client, InvoiceSummary } from "../types";

const FILTERS: [string, string, (i: InvoiceSummary) => boolean][] = [
  ["all", "Toutes", () => true],
  ["draft", "Brouillons", (i) => i.status === "draft"],
  ["wait", "En attente", (i) => ["issued", "sent", "pending_payment", "partially_paid", "overdue"].includes(i.status)],
  ["paid", "Payées", (i) => i.status === "paid"],
];

export function Invoices() {
  const [inv, setInv] = useState<InvoiceSummary[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [f, setF] = useState("all");
  useEffect(() => {
    api.get<InvoiceSummary[]>("/api/invoices").then(setInv).catch(() => undefined);
    api.get<Client[]>("/api/clients").then(setClients).catch(() => undefined);
  }, []);
  const pred = FILTERS.find((x) => x[0] === f)![2];
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? "Client";
  return (
    <>
      <h1>Factures</h1>
      <div className="pills">{FILTERS.map(([k, label]) => <button key={k} className="pill" aria-pressed={f === k} onClick={() => setF(k)}>{label}</button>)}</div>
      <div className="list">
        {inv.filter(pred).map((i) => (
          <button key={i.id} className="item" onClick={() => navigate(`/factures/${i.id}`)}>
            <span className="l"><span className="ini">{name(i.clientId)[0]?.toUpperCase()}</span><span><span className="n">{name(i.clientId)}</span><br /><span className="small muted">{i.number ?? "Brouillon"} · échéance {i.dueDate ?? "—"}</span></span></span>
            <span className="r"><b>{formatMinor(i.totalMinor, i.currency)}</b><br /><Chip status={i.status} /></span>
          </button>
        ))}
        {inv.filter(pred).length === 0 && <p className="muted">Aucune facture dans cette vue.</p>}
      </div>
    </>
  );
}
