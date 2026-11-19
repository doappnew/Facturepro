import { useEffect, useState } from "react";
import { api, errText } from "../api";
import type { Country } from "../money";
import { Err, Field } from "../ui";
import type { Client } from "../types";

export function Clients({ countries }: { countries: Country[] }) {
  const [list, setList] = useState<Client[]>([]);
  const [name, setName] = useState(""); const [country, setCountry] = useState(""); const [address, setAddress] = useState("");
  const [err, setErr] = useState("");
  const load = () => api.get<Client[]>("/api/clients").then(setList).catch(() => undefined);
  useEffect(() => { void load(); }, []);
  const add = async () => {
    setErr("");
    try { await api.post("/api/clients", { name, countryCode: country || null, address: address || null }); setName(""); setAddress(""); setCountry(""); await load(); }
    catch (e) { setErr(errText(e)); }
  };
  return (
    <>
      <h1>Clients</h1>
      <section className="card">
        <h3>Ajouter un client</h3>
        <Field label="Nom"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></Field>
        <Field label="Pays (facultatif)"><select value={country} onChange={(e) => setCountry(e.target.value)}><option value="">—</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
        <Field label="Adresse (facultatif)" hint="Collectez le strict nécessaire."><input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} /></Field>
        <Err msg={err} />
        <button className="btn" onClick={add} disabled={!name.trim()}>Enregistrer</button>
      </section>
      <div className="list">
        {list.map((c) => <div key={c.id} className="item"><span className="l"><span className="ini">{c.name[0]?.toUpperCase()}</span><span><span className="n">{c.name}</span><br /><span className="small muted">{countries.find((k) => k.code === c.countryCode)?.name ?? ""}</span></span></span></div>)}
        {list.length === 0 && <p className="muted">Aucun client pour le moment.</p>}
      </div>
    </>
  );
}
