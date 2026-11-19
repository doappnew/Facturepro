import { useEffect, useState } from "react";
import { api, errText } from "../api";
import type { Currency } from "../money";
import { navigate } from "../router";
import { Err, Field } from "../ui";
import type { Business, Client, Invoice } from "../types";

interface Line { description: string; quantity: string; unitPrice: string; discountPct: string; taxPct: string }
const emptyLine = (): Line => ({ description: "", quantity: "1", unitPrice: "", discountPct: "", taxPct: "0" });
const num = (s: string) => s.trim().replace(",", ".");

export function NewInvoice({ business, currencies }: { business: Business; currencies: Currency[] }) {
  const [step, setStep] = useState(1);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [newName, setNewName] = useState("");
  const [currency, setCurrency] = useState(business.mode === "pi_only" ? "PI" : business.defaultCurrency);
  const [taxMode, setTaxMode] = useState<"exclusive" | "inclusive">("exclusive");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<Client[]>("/api/clients").then(setClients).catch(() => undefined); }, []);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const options = business.mode === "pi_only" ? currencies.filter((c) => c.code === "PI") : currencies.filter((c) => c.code !== "PI");

  const next = async () => {
    setErr("");
    if (step === 1) {
      if (!clientId && !newName.trim()) { setErr("Choisissez un client ou saisissez son nom."); return; }
      if (!clientId) {
        try { const c = await api.post<Client>("/api/clients", { name: newName.trim() }); setClients((x) => [...x, c]); setClientId(c.id); }
        catch (e) { setErr(errText(e)); return; }
      }
    }
    if (step === 2) {
      const bad = lines.findIndex((l) => !l.description.trim() || !num(l.unitPrice));
      if (bad >= 0) { setErr(`Ligne ${bad + 1} : description et prix unitaire requis.`); return; }
    }
    setStep((s) => s + 1);
  };

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const body = {
        clientId, currency, taxMode, note: note.trim() || null,
        lines: lines.map((l) => ({
          description: l.description.trim(), quantity: num(l.quantity) || "1", unitPrice: num(l.unitPrice),
          ...(num(l.discountPct) ? { discountPercentBps: Math.round(parseFloat(num(l.discountPct)) * 100) } : {}),
          taxRateBps: Math.round((parseFloat(num(l.taxPct)) || 0) * 100),
        })),
      };
      const inv = await api.post<Invoice>("/api/invoices", body);
      navigate(`/factures/${inv.id}`);
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <>
      <h1>Nouvelle facture</h1>
      <div className="steps">{["Client", "Lignes", "Vérifier"].map((l, i) => <button key={l} className="step" aria-current={step === i + 1 ? "step" : undefined} onClick={() => i + 1 < step && setStep(i + 1)}>{i + 1}. {l}</button>)}</div>

      {step === 1 && (
        <section className="card">
          <Field label="Client existant">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— Choisir —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {!clientId && <Field label="Ou nouveau client"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom du client" maxLength={200} /></Field>}
          <Field label="Devise de facturation" hint={business.mode === "pi_only" ? "Mode Pi uniquement : la facture est en Pi, sans conversion." : "Distincte du pays du professionnel et de celui du client."}>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={business.mode === "pi_only"}>
              {options.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </Field>
        </section>
      )}

      {step === 2 && (
        <>
          {lines.map((l, i) => (
            <section key={i} className="line">
              <Field label={`Ligne ${i + 1} : description`}><input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} maxLength={500} /></Field>
              <div className="row2">
                <Field label="Quantité"><input inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></Field>
                <Field label={`Prix unitaire (${currency})`}><input inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></Field>
              </div>
              <div className="row2">
                <Field label="Remise (%)"><input inputMode="decimal" value={l.discountPct} onChange={(e) => setLine(i, { discountPct: e.target.value })} /></Field>
                <Field label="Taxe (%)" hint="Aucun taux par défaut."><input inputMode="decimal" value={l.taxPct} onChange={(e) => setLine(i, { taxPct: e.target.value })} /></Field>
              </div>
              {lines.length > 1 && <button className="btn danger" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}>Retirer la ligne</button>}
            </section>
          ))}
          <button className="btn sec" onClick={() => setLines((ls) => [...ls, emptyLine()])} disabled={lines.length >= 100}>Ajouter une ligne</button>
          <Field label="Les prix saisis sont">
            <select value={taxMode} onChange={(e) => setTaxMode(e.target.value as "exclusive" | "inclusive")}>
              <option value="exclusive">Hors taxes (la taxe s'ajoute)</option>
              <option value="inclusive">Taxes incluses</option>
            </select>
          </Field>
          <Field label="Note (facultatif)"><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Field>
        </>
      )}

      {step === 3 && (
        <section className="card">
          <h3>Vérifiez avant d'enregistrer</h3>
          <p className="small">Client : <b>{clients.find((c) => c.id === clientId)?.name}</b> · Devise : <b>{currency}</b></p>
          {lines.map((l, i) => <p key={i} className="small">{i + 1}. {l.description} — {l.quantity} × {l.unitPrice} {currency}{l.discountPct ? ` (remise ${l.discountPct} %)` : ""} · taxe {l.taxPct || 0} %</p>)}
          <div className="note info">Les totaux sont calculés par le serveur. Vous les verrez, avec l'aperçu de la facture, avant de l'émettre : le brouillon reste modifiable.</div>
        </section>
      )}

      <Err msg={err} />
      {step < 3 ? <button className="btn" onClick={next}>Continuer</button> : <button className="btn" onClick={save} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer le brouillon"}</button>}
      {step > 1 && <button className="btn sec" onClick={() => setStep((s) => s - 1)}>Retour</button>}
    </>
  );
}
