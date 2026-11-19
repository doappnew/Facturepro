import type { ReactNode } from "react";
import { navigate } from "./router";
import { formatMinor, formatQty } from "./money";
import { STATUS_LABEL, type InvoiceLine, type Status } from "./types";

const I = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const icons = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  plus: "M12 5v14M5 12h14",
  users: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  building: "M4 21V5l8-3v19M20 21V9l-8 3M8 8h.01M8 12h.01M8 16h.01",
};

const NAV: { path: string; label: string; icon: keyof typeof icons }[] = [
  { path: "/", label: "Accueil", icon: "home" },
  { path: "/factures", label: "Factures", icon: "list" },
  { path: "/nouvelle", label: "Nouvelle", icon: "plus" },
  { path: "/clients", label: "Clients", icon: "users" },
  { path: "/entreprise", label: "Entreprise", icon: "building" },
];

export function Layout({ path, children, nav = true }: { path: string; children: ReactNode; nav?: boolean }) {
  return (
    <>
      <main className="app">
        {children}
        <footer className="legal">
          FacturePro est une application indépendante, non affiliée à Pi Network. Pi Network is a trademark of PI Community Company.
          {" "}<a href="/confidentialite" onClick={(e) => { e.preventDefault(); navigate("/confidentialite"); }}>Confidentialité</a>
          {" · "}<a href="/conditions" onClick={(e) => { e.preventDefault(); navigate("/conditions"); }}>Conditions</a>
        </footer>
      </main>
      {nav && (
        <nav className="bnav" aria-label="Navigation principale">
          {NAV.map((n) => (
            <button key={n.path} onClick={() => navigate(n.path)} aria-current={path === n.path || (n.path !== "/" && path.startsWith(n.path + "/")) ? "page" : undefined}>
              <I d={icons[n.icon]} /><span>{n.label}</span>
            </button>
          ))}
        </nav>
      )}
    </>
  );
}

export const Chip = ({ status }: { status: Status }) => {
  const cls = status === "paid" ? "paid" : status === "overdue" || status === "cancelled" ? "late" : status === "draft" ? "" : "wait";
  return <span className={`chip ${cls}`}><i />{STATUS_LABEL[status]}</span>;
};

export const Err = ({ msg }: { msg: string }) => (msg ? <p className="err" role="alert">{msg}</p> : null);

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="field"><label>{label}{children}</label>{hint && <small className="muted">{hint}</small>}</div>;
}

export interface PaperData {
  number: string | null; kind: string; status: Status; currency: string; taxMode: "exclusive" | "inclusive";
  issueDate: string | null; dueDate: string | null; note: string | null;
  subtotalMinor: number; taxTotalMinor: number; totalMinor: number; paidMinor: number;
  lines: InvoiceLine[]; seller: { name: string; address: string | null; taxId: string | null; contact: string | null; legalMentions: string | null };
  clientName: string;
}

export function Paper({ d }: { d: PaperData }) {
  const f = (n: number) => formatMinor(n, d.currency);
  return (
    <section className="paper" aria-label="Aperçu de la facture">
      <div className="ptop">
        <h2>{d.kind === "credit_note" ? "Avoir" : "Facture"} {d.number ?? "(brouillon)"}</h2>
        <Chip status={d.status} />
      </div>
      <div className="small muted">Émise le {d.issueDate ?? "—"} · Échéance {d.dueDate ?? "—"}</div>
      <div className="two">
        <div><b>Émetteur</b><br />{d.seller.name}{d.seller.address && <><br />{d.seller.address}</>}{d.seller.taxId && <><br />N° fiscal : {d.seller.taxId}</>}{d.seller.contact && <><br />{d.seller.contact}</>}</div>
        <div><b>Client</b><br />{d.clientName}</div>
      </div>
      <table>
        <thead><tr><th>Description</th><th className="r">Qté</th><th className="r">Total</th></tr></thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}<br /><span className="muted small">{f(l.unitPriceMinor)}{l.discountMinor ? ` · remise −${f(l.discountMinor)}` : ""}{l.taxRateBps ? ` · taxe ${(l.taxRateBps / 100).toString().replace(".", ",")} %` : ""}</span></td>
              <td className="r">{formatQty(l.quantityMilli)}</td>
              <td className="r">{f(l.baseMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tot"><span>Total HT</span><span>{f(d.subtotalMinor)}</span></div>
      <div className="tot"><span>Taxes</span><span>{f(d.taxTotalMinor)}</span></div>
      <div className="tot b"><span>Total</span><span>{f(d.totalMinor)}</span></div>
      {d.paidMinor > 0 && <div className="tot"><span>Déjà payé</span><span>{f(d.paidMinor)}</span></div>}
      <div className="small muted">{d.taxMode === "inclusive" ? "Taxes incluses dans les prix saisis." : "Prix saisis hors taxes."}</div>
      {d.note && <p className="small">Note : {d.note}</p>}
      {d.seller.legalMentions && <p className="small muted">{d.seller.legalMentions}</p>}
    </section>
  );
}
