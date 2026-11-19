import { useState } from "react";
import { api, errText } from "../api";
import type { Country, Currency } from "../money";
import { Err, Field } from "../ui";
import type { Business } from "../types";
import { TestnetReceive } from "./Testnet";

export function BusinessPage({ business, countries, currencies, onSaved }: { business: Business | null; countries: Country[]; currencies: Currency[]; onSaved: () => void }) {
  const [f, setF] = useState({
    name: business?.name ?? "", countryCode: business?.countryCode ?? "BJ", mode: business?.mode ?? "pi_only",
    defaultCurrency: business?.defaultCurrency ?? "PI", address: business?.address ?? "", taxId: business?.taxId ?? "",
    contact: business?.contact ?? "", paymentTermsDays: String(business?.paymentTermsDays ?? 30),
    paymentInstructions: business?.paymentInstructions ?? "", legalMentions: business?.legalMentions ?? "",
  });
  const [err, setErr] = useState(""); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setOk(false); };
  const piOnly = f.mode === "pi_only";

  const save = async () => {
    setBusy(true); setErr("");
    try {
      await api.put("/api/business", {
        name: f.name.trim(), countryCode: f.countryCode, mode: f.mode,
        defaultCurrency: piOnly ? "PI" : f.defaultCurrency,
        address: f.address || null, taxId: f.taxId || null, contact: f.contact || null,
        paymentTermsDays: parseInt(f.paymentTermsDays, 10) || 0,
        paymentInstructions: piOnly ? null : f.paymentInstructions || null, legalMentions: f.legalMentions || null,
      });
      setOk(true); onSaved();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <>
      <h1>Entreprise</h1>
      {!business && <div className="note info">Bienvenue ! Renseignez votre profil pour créer votre première facture.</div>}
      <section className="card">
        <Field label="Nom de l'entreprise"><input value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={200} /></Field>
        <Field label="Pays du professionnel"><select value={f.countryCode} onChange={(e) => set({ countryCode: e.target.value })}>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
        <Field label="Mode de facturation" hint={piOnly ? "Facturation et paiement en Pi, sans conversion. Seul mode candidat au listing Mainnet de Pi." : "Devises fiat et instructions de paiement hors Pi. Ce mode ne peut pas être listé sur le Mainnet de Pi."}>
          <select value={f.mode} onChange={(e) => set({ mode: e.target.value as "pi_only" | "web", defaultCurrency: e.target.value === "pi_only" ? "PI" : countries.find((c) => c.code === f.countryCode)?.currency ?? "XOF" })}>
            <option value="pi_only">Pi uniquement (recommandé)</option>
            <option value="web">Web (devises fiat, hors Pi)</option>
          </select>
        </Field>
        {!piOnly && <Field label="Devise habituelle"><select value={f.defaultCurrency} onChange={(e) => set({ defaultCurrency: e.target.value })}>{currencies.filter((c) => c.code !== "PI").map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select></Field>}
        <Field label="Adresse (facultatif)"><input value={f.address} onChange={(e) => set({ address: e.target.value })} maxLength={500} /></Field>
        <Field label="Numéro fiscal ou d'entreprise (si applicable)" hint="Ne saisissez que votre vrai numéro."><input value={f.taxId} onChange={(e) => set({ taxId: e.target.value })} maxLength={100} /></Field>
        <Field label="Contact affiché sur la facture (facultatif)"><input value={f.contact} onChange={(e) => set({ contact: e.target.value })} maxLength={200} /></Field>
        <Field label="Délai de paiement (jours)"><input inputMode="numeric" value={f.paymentTermsDays} onChange={(e) => set({ paymentTermsDays: e.target.value })} /></Field>
        {!piOnly && <Field label="Instructions de paiement hors Pi" hint="Affichées sur la facture avec la mention « hors Pi, non vérifié automatiquement »."><textarea value={f.paymentInstructions} onChange={(e) => set({ paymentInstructions: e.target.value })} maxLength={1000} /></Field>}
        <Field label="Mentions légales de votre pays" hint="À renseigner vous-même : FacturePro ne garantit pas la conformité fiscale d'un pays."><textarea value={f.legalMentions} onChange={(e) => set({ legalMentions: e.target.value })} maxLength={2000} /></Field>
        <Err msg={err} />
        {ok && <div className="note info">Profil enregistré.</div>}
        <button className="btn" onClick={save} disabled={busy || !f.name.trim()}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </section>
      <TestnetReceive />
    </>
  );
}
