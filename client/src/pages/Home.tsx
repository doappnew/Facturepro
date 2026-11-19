import { useEffect, useState } from "react";
import { api } from "../api";
import { formatMinor } from "../money";
import { navigate } from "../router";
import { Chip } from "../ui";
import type { Business, Client, InvoiceSummary } from "../types";
import { TestnetSend } from "./Testnet";

export function Home({ business }: { business: Business }) {
  const [inv, setInv] = useState<InvoiceSummary[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => {
    api.get<InvoiceSummary[]>("/api/invoices").then(setInv).catch(() => undefined);
    api.get<Client[]>("/api/clients").then(setClients).catch(() => undefined);
  }, []);
  const cur = business.defaultCurrency;
  const mine = inv.filter((i) => i.currency === cur && i.kind === "invoice");
  const active = mine.filter((i) => i.status !== "draft" && i.status !== "cancelled");
  const billed = active.reduce((a, i) => a + i.totalMinor, 0);
  const paid = active.filter((i) => i.status === "paid").reduce((a, i) => a + i.totalMinor, 0);
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? "Client";
  return (
    <>
      <div className="top"><div className="brand"><span className="logo">F</span>FacturePro</div></div>
      <section className="hero"><span>Bonjour, {business.name}</span><b>{formatMinor(billed - paid, cur)}</b><span>à encaisser</span></section>
      <div className="grid2">
        <div className="stat"><b>{formatMinor(billed, cur)}</b><span>Facturé</span></div>
        <div className="stat"><b>{formatMinor(paid, cur)}</b><span>Encaissé</span></div>
        <div className="stat"><b>{active.length}</b><span>Factures émises</span></div>
        <div className="stat"><b>{inv.filter((i) => i.status === "draft").length}</b><span>Brouillons</span></div>
      </div>
      <button className="btn" onClick={() => navigate("/nouvelle")}>Nouvelle facture</button>
      <h2>Dernières factures</h2>
      <div className="list">
        {inv.slice(0, 5).map((i) => (
          <button key={i.id} className="item" onClick={() => navigate(`/factures/${i.id}`)}>
            <span className="l"><span className="ini">{name(i.clientId)[0]?.toUpperCase()}</span><span><span className="n">{name(i.clientId)}</span><br /><span className="small muted">{i.number ?? "Brouillon"}</span></span></span>
            <span className="r"><b>{formatMinor(i.totalMinor, i.currency)}</b><br /><Chip status={i.status} /></span>
          </button>
        ))}
        {inv.length === 0 && <p className="muted">Aucune facture pour le moment.</p>}
      </div>
      <TestnetSend />
    </>
  );
}
