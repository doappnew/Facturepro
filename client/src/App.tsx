import { useCallback, useEffect, useState } from "react";
import { api, hasSession } from "./api";
import { setCurrencies, type Country, type Currency } from "./money";
import { usePath } from "./router";
import { Layout } from "./ui";
import type { Business } from "./types";
import { BusinessPage } from "./pages/BusinessPage";
import { Clients } from "./pages/Clients";
import { Home } from "./pages/Home";
import { InvoiceDetail } from "./pages/InvoiceDetail";
import { Invoices } from "./pages/Invoices";
import { Legal } from "./pages/Legal";
import { Login } from "./pages/Login";
import { NewInvoice } from "./pages/NewInvoice";
import { PublicInvoice } from "./pages/PublicInvoice";

export function App() {
  const path = usePath();
  const [ref, setRef] = useState<{ countries: Country[]; currencies: Currency[] } | null>(null);
  const [logged, setLogged] = useState(hasSession());
  const [business, setBusiness] = useState<Business | null | undefined>(undefined);

  useEffect(() => {
    api.get<{ countries: Country[]; currencies: Currency[] }>("/api/reference").then((r) => { setCurrencies(r.currencies); setRef(r); }).catch(() => undefined);
  }, []);

  const loadMe = useCallback(async () => {
    try { setBusiness((await api.get<{ business: Business | null }>("/api/me")).business); }
    catch { setLogged(false); }
  }, []);
  useEffect(() => { if (logged) void loadMe(); }, [logged, loadMe]);

  // Pages publiques : aucune connexion requise.
  const pub = path.match(/^\/i\/([^/]+)$/);
  if (!ref) return <main className="app"><p className="muted">Chargement…</p></main>;
  if (pub) return <PublicInvoice token={decodeURIComponent(pub[1]!)} />;
  if (path === "/confidentialite") return <Legal kind="confidentialite" />;
  if (path === "/conditions") return <Legal kind="conditions" />;

  if (!logged) return <Login onDone={() => setLogged(true)} />;
  if (business === undefined) return <main className="app"><p className="muted">Chargement…</p></main>;

  // Sans profil d'entreprise, on ne propose que sa création.
  if (!business) return <Layout path="/entreprise" nav={false}><BusinessPage business={null} countries={ref.countries} currencies={ref.currencies} onSaved={loadMe} /></Layout>;

  const detail = path.match(/^\/factures\/([^/]+)$/);
  let page;
  if (detail) page = <InvoiceDetail id={detail[1]!} business={business} />;
  else if (path === "/factures") page = <Invoices />;
  else if (path === "/nouvelle") page = <NewInvoice business={business} currencies={ref.currencies} />;
  else if (path === "/clients") page = <Clients countries={ref.countries} />;
  else if (path === "/entreprise") page = <BusinessPage business={business} countries={ref.countries} currencies={ref.currencies} onSaved={loadMe} />;
  else page = <Home business={business} />;
  return <Layout path={detail ? "/factures" : path}>{page}</Layout>;
}
