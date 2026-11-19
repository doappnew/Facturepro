// 19 devises validées (ISO 4217). `decimals` = nombre de décimales de l'unité mineure.
// `label` = libellé affiché ; le code ISO reste celui stocké et imprimé sur la facture.

export interface Currency {
  code: string;
  decimals: 0 | 2 | 3;
  name: string;
  label: string;
}

const c = (code: string, decimals: 0 | 2 | 3, name: string, label = code): Currency => ({
  code,
  decimals,
  name,
  label,
});

export const CURRENCIES: readonly Currency[] = [
  c("XOF", 0, "Franc CFA BCEAO", "FCFA"),
  c("XAF", 0, "Franc CFA BEAC", "FCFA"),
  c("GNF", 0, "Franc guinéen"),
  c("RWF", 0, "Franc rwandais"),
  c("UGX", 0, "Shilling ougandais"),
  c("NGN", 2, "Naira nigérian"),
  c("GHS", 2, "Cedi ghanéen"),
  c("KES", 2, "Shilling kényan"),
  c("TZS", 2, "Shilling tanzanien"),
  c("MAD", 2, "Dirham marocain"),
  c("DZD", 2, "Dinar algérien"),
  c("EGP", 2, "Livre égyptienne"),
  c("ZAR", 2, "Rand sud-africain"),
  c("EUR", 2, "Euro"),
  c("USD", 2, "Dollar américain"),
  c("GBP", 2, "Livre sterling"),
  c("CAD", 2, "Dollar canadien"),
  c("CHF", 2, "Franc suisse"),
  c("TND", 3, "Dinar tunisien"),
];

const BY_CODE = new Map(CURRENCIES.map((x) => [x.code, x]));

export function getCurrency(code: string): Currency {
  const cur = BY_CODE.get(code);
  if (!cur) throw new Error(`Devise non prise en charge : ${code}`);
  return cur;
}
