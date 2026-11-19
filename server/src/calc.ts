// Calcul des factures en entiers (unités mineures). Aucun nombre à virgule n'est utilisé pour l'argent.
// Règles (documentées dans le README) :
//  - quantité en millièmes (1,5 -> 1500), prix unitaire en unités mineures de la devise ;
//  - total de ligne = arrondi(quantité × prix) ; remise ligne en % (points de base) ou montant fixe ;
//  - taxe calculée par taux sur la somme des lignes de ce taux, arrondie UNE fois par taux (demi supérieur) ;
//  - mode « exclusive » : les prix saisis sont HT ; mode « inclusive » : les prix saisis sont TTC ;
//  - aucun taux par défaut : chaque ligne porte son taux (0 = exonéré / non applicable).

import { getCurrency } from "./currencies.js";

export type TaxMode = "exclusive" | "inclusive";

export type Discount =
  | { type: "percent"; bps: number } // 1 % = 100 bps
  | { type: "fixed"; minor: number };

export interface LineInput {
  description: string;
  quantityMilli: number; // 1000 = 1,000
  unitPriceMinor: number;
  discount?: Discount;
  taxRateBps: number; // 18 % = 1800
}

export interface LineResult {
  grossMinor: number; // quantité × prix, arrondi
  discountMinor: number;
  baseMinor: number; // après remise (HT si exclusive, TTC si inclusive)
}

export interface TaxGroup {
  rateBps: number;
  netMinor: number;
  taxMinor: number;
}

export interface InvoiceTotals {
  currency: string;
  taxMode: TaxMode;
  lines: LineResult[];
  taxGroups: TaxGroup[];
  subtotalMinor: number; // total HT
  taxTotalMinor: number;
  totalMinor: number; // TTC
}

export interface Balance {
  balanceDueMinor: number;
  overpaidMinor: number;
}

function assertInt(name: string, v: number, min = 0): void {
  if (!Number.isSafeInteger(v) || v < min) {
    throw new RangeError(`${name} doit être un entier ≥ ${min} (reçu ${v})`);
  }
}

// Division entière arrondie au demi supérieur (valeurs ≥ 0).
function divRound(n: bigint, d: bigint): bigint {
  return (2n * n + d) / (2n * d);
}

function toSafe(v: bigint, name: string): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`${name} dépasse la limite`);
  return Number(v);
}

export function computeInvoice(
  currencyCode: string,
  taxMode: TaxMode,
  inputs: readonly LineInput[],
): InvoiceTotals {
  getCurrency(currencyCode); // lève si devise inconnue
  if (inputs.length === 0) throw new RangeError("Une facture doit contenir au moins une ligne");

  const lines: LineResult[] = [];
  const baseByRate = new Map<number, bigint>();

  inputs.forEach((l, i) => {
    assertInt(`ligne ${i + 1} quantité`, l.quantityMilli);
    assertInt(`ligne ${i + 1} prix unitaire`, l.unitPriceMinor);
    assertInt(`ligne ${i + 1} taux de taxe`, l.taxRateBps);
    if (l.taxRateBps > 100_000) throw new RangeError(`ligne ${i + 1} : taux de taxe > 1000 %`);

    const gross = divRound(BigInt(l.quantityMilli) * BigInt(l.unitPriceMinor), 1000n);

    let discount = 0n;
    if (l.discount?.type === "percent") {
      assertInt(`ligne ${i + 1} remise %`, l.discount.bps);
      if (l.discount.bps > 10_000) throw new RangeError(`ligne ${i + 1} : remise > 100 %`);
      discount = divRound(gross * BigInt(l.discount.bps), 10_000n);
    } else if (l.discount?.type === "fixed") {
      assertInt(`ligne ${i + 1} remise fixe`, l.discount.minor);
      const f = BigInt(l.discount.minor);
      discount = f > gross ? gross : f;
    }

    const base = gross - discount;
    lines.push({
      grossMinor: toSafe(gross, "total de ligne"),
      discountMinor: toSafe(discount, "remise"),
      baseMinor: toSafe(base, "base de ligne"),
    });
    baseByRate.set(l.taxRateBps, (baseByRate.get(l.taxRateBps) ?? 0n) + base);
  });

  const taxGroups: TaxGroup[] = [];
  let subtotal = 0n;
  let taxTotal = 0n;
  for (const [rate, sumBase] of [...baseByRate.entries()].sort((a, b) => a[0] - b[0])) {
    const r = BigInt(rate);
    let net: bigint;
    let tax: bigint;
    if (taxMode === "exclusive") {
      net = sumBase;
      tax = divRound(sumBase * r, 10_000n);
    } else {
      net = divRound(sumBase * 10_000n, 10_000n + r);
      tax = sumBase - net;
    }
    subtotal += net;
    taxTotal += tax;
    taxGroups.push({ rateBps: rate, netMinor: toSafe(net, "HT"), taxMinor: toSafe(tax, "taxe") });
  }

  return {
    currency: currencyCode,
    taxMode,
    lines,
    taxGroups,
    subtotalMinor: toSafe(subtotal, "sous-total"),
    taxTotalMinor: toSafe(taxTotal, "taxes"),
    totalMinor: toSafe(subtotal + taxTotal, "total"),
  };
}

// Solde = total − paiements confirmés − avoirs. Jamais négatif : l'excédent est signalé à part.
export function computeBalance(totalMinor: number, confirmedPaymentsMinor: number, creditNotesMinor: number): Balance {
  assertInt("total", totalMinor);
  assertInt("paiements confirmés", confirmedPaymentsMinor);
  assertInt("avoirs", creditNotesMinor);
  const rest = totalMinor - confirmedPaymentsMinor - creditNotesMinor;
  return rest >= 0
    ? { balanceDueMinor: rest, overpaidMinor: 0 }
    : { balanceDueMinor: 0, overpaidMinor: -rest };
}

// "1500.5" avec decimals=3 -> 1500500 ; refuse les chiffres en trop (pas d'arrondi silencieux).
export function parseDecimal(input: string, decimals: number): number {
  if (!/^\d+(\.\d+)?$/.test(input)) throw new SyntaxError(`Nombre invalide : "${input}"`);
  const [intPart, frac = ""] = input.split(".") as [string, string?];
  if (frac.length > decimals) throw new RangeError(`Trop de décimales (max ${decimals}) : "${input}"`);
  const v = BigInt(intPart + frac.padEnd(decimals, "0"));
  return toSafe(v, "montant");
}

export function parseMoney(input: string, currencyCode: string): number {
  return parseDecimal(input, getCurrency(currencyCode).decimals);
}

export function parseQuantity(input: string): number {
  return parseDecimal(input, 3);
}

// 1500500 avec decimals=3 -> "1500.500"
export function formatDecimal(minor: number, decimals: number): string {
  assertInt("montant", minor);
  const s = String(minor).padStart(decimals + 1, "0");
  return decimals === 0 ? s : `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
}

export function formatMoney(minor: number, currencyCode: string): string {
  return formatDecimal(minor, getCurrency(currencyCode).decimals);
}
