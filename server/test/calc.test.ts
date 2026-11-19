import { describe, expect, it } from "vitest";
import {
  computeBalance,
  computeInvoice,
  formatMoney,
  parseMoney,
  parseQuantity,
  type LineInput,
} from "../src/calc.js";
import { COUNTRIES } from "../src/countries.js";
import { CURRENCIES, getCurrency } from "../src/currencies.js";

const line = (over: Partial<LineInput> = {}): LineInput => ({
  description: "x",
  quantityMilli: 1000,
  unitPriceMinor: 1000,
  taxRateBps: 0,
  ...over,
});

describe("tables validées", () => {
  it("19 devises, 22 pays, codes uniques", () => {
    expect(CURRENCIES).toHaveLength(19);
    expect(COUNTRIES).toHaveLength(22);
    expect(new Set(CURRENCIES.map((x) => x.code)).size).toBe(19);
    expect(new Set(COUNTRIES.map((x) => x.code)).size).toBe(22);
  });
  it("chaque pays pointe vers une devise de la liste", () => {
    for (const c of COUNTRIES) expect(() => getCurrency(c.currency)).not.toThrow();
  });
  it("décimales : FCFA 0, TND 3, EUR 2 ; libellé FCFA pour XOF et XAF", () => {
    expect(getCurrency("XOF").decimals).toBe(0);
    expect(getCurrency("XAF").decimals).toBe(0);
    expect(getCurrency("TND").decimals).toBe(3);
    expect(getCurrency("EUR").decimals).toBe(2);
    expect(getCurrency("XOF").label).toBe("FCFA");
    expect(getCurrency("XAF").label).toBe("FCFA");
  });
});

describe("lignes, remises, taxes (exclusive)", () => {
  it("FCFA : 2 × 12 500 + 18 % = 29 500", () => {
    const r = computeInvoice("XOF", "exclusive", [line({ quantityMilli: 2000, unitPriceMinor: 12500, taxRateBps: 1800 })]);
    expect(r.subtotalMinor).toBe(25000);
    expect(r.taxTotalMinor).toBe(4500);
    expect(r.totalMinor).toBe(29500);
  });
  it("arrondi au demi supérieur sur la ligne (1,5 × 3,33 = 4,995 -> 5,00)", () => {
    const r = computeInvoice("EUR", "exclusive", [line({ quantityMilli: 1500, unitPriceMinor: 333 })]);
    expect(r.lines[0]!.grossMinor).toBe(500);
  });
  it("TND à 3 décimales : 3 × 1,234 + 19 %", () => {
    const r = computeInvoice("TND", "exclusive", [line({ quantityMilli: 3000, unitPriceMinor: 1234, taxRateBps: 1900 })]);
    expect(r.subtotalMinor).toBe(3702);
    expect(r.taxTotalMinor).toBe(703); // 703,38 -> 703
    expect(formatMoney(r.totalMinor, "TND")).toBe("4.405");
  });
  it("remise en % et remise fixe plafonnée au total de ligne", () => {
    const p = computeInvoice("XOF", "exclusive", [line({ unitPriceMinor: 25000, discount: { type: "percent", bps: 1000 } })]);
    expect(p.lines[0]!.discountMinor).toBe(2500);
    expect(p.totalMinor).toBe(22500);
    const f = computeInvoice("XOF", "exclusive", [line({ unitPriceMinor: 25000, discount: { type: "fixed", minor: 99999 } })]);
    expect(f.lines[0]!.baseMinor).toBe(0);
    expect(f.totalMinor).toBe(0);
  });
  it("la taxe est arrondie une fois par taux, pas ligne par ligne", () => {
    const three = [line({ unitPriceMinor: 3, taxRateBps: 1500 }), line({ unitPriceMinor: 3, taxRateBps: 1500 }), line({ unitPriceMinor: 3, taxRateBps: 1500 })];
    const r = computeInvoice("XOF", "exclusive", three);
    expect(r.taxTotalMinor).toBe(1); // 9 × 15 % = 1,35 -> 1 (ligne par ligne donnerait 0)
  });
  it("plusieurs taux, 0 % exonéré, groupes triés", () => {
    const r = computeInvoice("XOF", "exclusive", [
      line({ unitPriceMinor: 10000, taxRateBps: 1800 }),
      line({ unitPriceMinor: 5000, taxRateBps: 0 }),
      line({ unitPriceMinor: 2000, taxRateBps: 1800 }),
    ]);
    expect(r.taxGroups.map((g) => g.rateBps)).toEqual([0, 1800]);
    expect(r.taxGroups[1]).toEqual({ rateBps: 1800, netMinor: 12000, taxMinor: 2160 });
    expect(r.totalMinor).toBe(19160);
  });
});

describe("taxes incluses (inclusive)", () => {
  it("11 800 TTC à 18 % = 10 000 HT + 1 800", () => {
    const r = computeInvoice("XOF", "inclusive", [line({ unitPriceMinor: 11800, taxRateBps: 1800 })]);
    expect(r.subtotalMinor).toBe(10000);
    expect(r.taxTotalMinor).toBe(1800);
    expect(r.totalMinor).toBe(11800);
  });
  it("le total reste égal au prix saisi malgré l'arrondi", () => {
    const r = computeInvoice("XOF", "inclusive", [line({ unitPriceMinor: 1000, taxRateBps: 1800 })]);
    expect(r.subtotalMinor).toBe(847);
    expect(r.taxTotalMinor).toBe(153);
    expect(r.totalMinor).toBe(1000);
  });
});

describe("invariants (aléatoire, graine fixe)", () => {
  it("exclusive : total = HT + taxes ; inclusive : total = somme des bases", () => {
    let s = 12345;
    const rnd = (n: number) => ((s = (s * 1103515245 + 12345) & 0x7fffffff), s % n);
    for (let i = 0; i < 500; i++) {
      const lines = Array.from({ length: 1 + rnd(5) }, () =>
        line({
          quantityMilli: rnd(20000),
          unitPriceMinor: rnd(1_000_000),
          taxRateBps: [0, 500, 1800, 2000][rnd(4)]!,
          discount: rnd(2) ? { type: "percent", bps: rnd(10001) } : undefined,
        }),
      );
      const ex = computeInvoice("TND", "exclusive", lines);
      expect(ex.totalMinor).toBe(ex.subtotalMinor + ex.taxTotalMinor);
      const inc = computeInvoice("TND", "inclusive", lines);
      expect(inc.totalMinor).toBe(inc.lines.reduce((a, l) => a + l.baseMinor, 0));
    }
  });
});

describe("solde", () => {
  it("total − paiements − avoirs, jamais négatif", () => {
    expect(computeBalance(29500, 10000, 0)).toEqual({ balanceDueMinor: 19500, overpaidMinor: 0 });
    expect(computeBalance(29500, 29500, 0)).toEqual({ balanceDueMinor: 0, overpaidMinor: 0 });
    expect(computeBalance(29500, 30000, 1000)).toEqual({ balanceDueMinor: 0, overpaidMinor: 1500 });
  });
});

describe("entrées et formats", () => {
  it("refuse flottants, négatifs, devise inconnue, facture vide, remise > 100 %", () => {
    expect(() => computeInvoice("XOF", "exclusive", [line({ unitPriceMinor: 10.5 })])).toThrow(RangeError);
    expect(() => computeInvoice("XOF", "exclusive", [line({ quantityMilli: -1 })])).toThrow(RangeError);
    expect(() => computeInvoice("JPY", "exclusive", [line()])).toThrow(/non prise en charge/);
    expect(() => computeInvoice("XOF", "exclusive", [])).toThrow(RangeError);
    expect(() => computeInvoice("XOF", "exclusive", [line({ discount: { type: "percent", bps: 10001 } })])).toThrow(RangeError);
  });
  it("parseMoney : décimales selon la devise, pas d'arrondi silencieux", () => {
    expect(parseMoney("1500", "XOF")).toBe(1500);
    expect(() => parseMoney("1500.5", "XOF")).toThrow(RangeError);
    expect(parseMoney("12.34", "EUR")).toBe(1234);
    expect(parseMoney("12.3", "EUR")).toBe(1230);
    expect(parseMoney("1.234", "TND")).toBe(1234);
    expect(() => parseMoney("1.2345", "TND")).toThrow(RangeError);
    expect(() => parseMoney("-5", "EUR")).toThrow(SyntaxError);
    expect(() => parseMoney("1e3", "EUR")).toThrow(SyntaxError);
    expect(parseQuantity("1.5")).toBe(1500);
  });
  it("formatMoney", () => {
    expect(formatMoney(29500, "XOF")).toBe("29500");
    expect(formatMoney(5, "EUR")).toBe("0.05");
    expect(formatMoney(4405, "TND")).toBe("4.405");
  });
});
