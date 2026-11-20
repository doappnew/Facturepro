import { useState } from "react";
import { loginWithPi } from "../auth";
import { fullError, hasPi, piDiagnostics } from "../pi";
import { Err } from "../ui";
import { errText } from "../api";

export function Login({ onDone }: { onDone: () => void }) {
  const [err, setErr] = useState("");
  const [diag, setDiag] = useState("");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr(""); setDiag(""); setRaw("");
    try { await loginWithPi(); onDone(); } catch (e) { setErr(e instanceof Error && !("status" in e) ? e.message : errText(e)); setRaw(fullError(e)); setDiag(await piDiagnostics()); }
    setBusy(false);
  };
  return (
    <main className="app">
      <div className="brand"><img className="logo" src="/icon.svg" alt="" />FacturePro</div>
      <h1>Vos factures, partagées en un QR</h1>
      <p className="muted">Créez des factures professionnelles, partagez-les par lien ou QR code et suivez leur paiement. Facturation compatible Pi Network.</p>
      <button className="btn" onClick={go} disabled={busy}>{busy ? "Connexion…" : "Se connecter avec Pi"}</button>
      {!hasPi() && <div className="note warn">Pi Browser n'est pas détecté. La connexion ne fonctionne que dans Pi Browser : ouvrez FacturePro depuis le Developer Portal ou Pi Browser.</div>}
      <Err msg={err} />
      {raw && <pre className="small muted" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{"Erreur complète : " + raw + "\n" + diag}</pre>}
      <p className="legal">FacturePro est une application indépendante, non affiliée à Pi Network. Pi Network is a trademark of PI Community Company. <a href="/confidentialite">Confidentialité</a> · <a href="/conditions">Conditions</a></p>
    </main>
  );
}
