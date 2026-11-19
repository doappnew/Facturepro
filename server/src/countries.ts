// 22 pays validés (ISO 3166-1 alpha-2) et leur devise d'usage.
// Le pays du professionnel, le pays du client et la devise de facturation sont trois choix distincts :
// `currency` ne sert qu'à proposer une devise par défaut.

export interface Country {
  code: string;
  name: string;
  currency: string;
}

export const COUNTRIES: readonly Country[] = [
  { code: "BJ", name: "Bénin", currency: "XOF" },
  { code: "TG", name: "Togo", currency: "XOF" },
  { code: "SN", name: "Sénégal", currency: "XOF" },
  { code: "CI", name: "Côte d'Ivoire", currency: "XOF" },
  { code: "ML", name: "Mali", currency: "XOF" },
  { code: "BF", name: "Burkina Faso", currency: "XOF" },
  { code: "NE", name: "Niger", currency: "XOF" },
  { code: "CM", name: "Cameroun", currency: "XAF" },
  { code: "GA", name: "Gabon", currency: "XAF" },
  { code: "GN", name: "Guinée", currency: "GNF" },
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "GH", name: "Ghana", currency: "GHS" },
  { code: "KE", name: "Kenya", currency: "KES" },
  { code: "UG", name: "Ouganda", currency: "UGX" },
  { code: "TZ", name: "Tanzanie", currency: "TZS" },
  { code: "RW", name: "Rwanda", currency: "RWF" },
  { code: "MA", name: "Maroc", currency: "MAD" },
  { code: "TN", name: "Tunisie", currency: "TND" },
  { code: "DZ", name: "Algérie", currency: "DZD" },
  { code: "EG", name: "Égypte", currency: "EGP" },
  { code: "ZA", name: "Afrique du Sud", currency: "ZAR" },
  { code: "FR", name: "France", currency: "EUR" },
];
