export interface Currency { code: string; decimals: number; name: string; label: string }
export interface Country { code: string; name: string; currency: string }

let currencies: Currency[] = [];
export const setCurrencies = (c: Currency[]) => { currencies = c; };
export const decimalsOf = (code: string) => currencies.find((c) => c.code === code)?.decimals ?? 2;
export const labelOf = (code: string) => currencies.find((c) => c.code === code)?.label ?? code;

// Montant en unités mineures (entier) -> texte, sans passer par un nombre à virgule.
export function formatMinor(minor: number, code: string, withLabel = true): string {
  const d = decimalsOf(code);
  const s = String(Math.abs(minor)).padStart(d + 1, "0");
  const int = d === 0 ? s : s.slice(0, -d);
  let frac = d === 0 ? "" : s.slice(-d);
  if (code === "PI") frac = frac.replace(/0+$/, "").padEnd(2, "0"); // Pi : zéros inutiles retirés, 2 décimales minimum
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${minor < 0 ? "-" : ""}${grouped}${frac ? "," + frac : ""}${withLabel ? " " + labelOf(code) : ""}`;
}

export const formatQty = (milli: number) => (milli % 1000 === 0 ? String(milli / 1000) : String(milli / 1000).replace(".", ","));

// Montant Pi (7 décimales) en nombre pour le SDK : le serveur revérifie de toute façon.
export const piNumber = (minor: number) => Number((minor / 1e7).toFixed(7));
