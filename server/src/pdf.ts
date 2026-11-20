import PDFDocument from "pdfkit";
import { formatMoney } from "./calc.js";
import { getCurrency } from "./currencies.js";
import type { Business, Client, Invoice } from "./store/types.js";

export const money = (minor: number, cur: string) => {
  let v = formatMoney(minor, cur);
  if (cur === "PI") { // Pi : zéros inutiles retirés, 2 décimales minimum
    const [int, frac = ""] = v.split(".");
    v = `${int}.${frac.replace(/0+$/, "").padEnd(2, "0")}`;
  }
  return `${v} ${getCurrency(cur).label}`;
};
const qty = (milli: number) => (milli % 1000 === 0 ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, ""));

// PDF simple et lisible. Les montants viennent de la base (calculés par le serveur), jamais du navigateur.
export function renderInvoicePdf(inv: Invoice, biz: Business, client: Client, paidMinor = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Facture ${inv.number ?? "(brouillon)"}`, Producer: "FacturePro" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ink = "#1F2A33", accent = "#1B7FD6";
    doc.fillColor(accent).fontSize(20).text(inv.kind === "credit_note" ? "AVOIR" : "FACTURE", { continued: true })
      .fillColor(ink).fontSize(12).text(`   ${inv.number ?? "BROUILLON"}`);
    doc.moveDown(0.5).fontSize(10).fillColor(ink);
    doc.text(`Date d'émission : ${inv.issueDate ?? "—"}    Échéance : ${inv.dueDate ?? "—"}`);
    doc.moveDown();

    doc.fontSize(11).fillColor(accent).text("Émetteur");
    doc.fontSize(10).fillColor(ink).text(biz.name);
    if (biz.address) doc.text(biz.address);
    if (biz.taxId) doc.text(`N° fiscal : ${biz.taxId}`);
    if (biz.contact) doc.text(biz.contact);
    doc.moveDown();
    doc.fontSize(11).fillColor(accent).text("Client");
    doc.fontSize(10).fillColor(ink).text(client.name);
    if (client.address) doc.text(client.address);
    if (client.taxId) doc.text(`N° fiscal : ${client.taxId}`);
    doc.moveDown();

    const x = [48, 290, 350, 430, 495];
    const header = ["Description", "Qté", "Prix unit.", "Remise", "Total"];
    let y = doc.y;
    doc.fontSize(9).fillColor(accent);
    header.forEach((h, i) => doc.text(h, x[i]!, y, { width: (x[i + 1] ?? 547) - x[i]! - 4, align: i === 0 ? "left" : "right" }));
    doc.moveTo(48, y + 13).lineTo(547, y + 13).strokeColor(accent).stroke();
    y += 18;
    doc.fillColor(ink);
    for (const l of inv.lines) {
      const cells = [l.description, qty(l.quantityMilli), money(l.unitPriceMinor, inv.currency),
        l.discountMinor ? `-${money(l.discountMinor, inv.currency)}` : "", money(l.baseMinor, inv.currency)];
      const h = doc.heightOfString(cells[0]!, { width: 236 });
      if (y + h > 740) { doc.addPage(); y = 48; }
      cells.forEach((c, i) => doc.text(c, x[i]!, y, { width: (x[i + 1] ?? 547) - x[i]! - 4, align: i === 0 ? "left" : "right" }));
      y += Math.max(h, 12) + 6;
    }
    doc.moveTo(48, y).lineTo(547, y).strokeColor("#C9D1D6").stroke();
    y += 8;
    const right = (label: string, value: string, bold = false) => {
      doc.fontSize(bold ? 11 : 10).fillColor(ink);
      doc.text(label, 330, y, { width: 100, align: "right" });
      doc.text(value, 430, y, { width: 117, align: "right" });
      y += bold ? 18 : 14;
    };
    const mode = inv.taxMode === "inclusive" ? "taxes incluses dans les prix" : "prix hors taxes";
    right("Total HT", money(inv.subtotalMinor, inv.currency));
    right("Taxes", money(inv.taxTotalMinor, inv.currency));
    right("Total", money(inv.totalMinor, inv.currency), true);
    if (paidMinor > 0) right("Déjà payé", money(paidMinor, inv.currency));
    if (paidMinor > 0) right("Solde", money(Math.max(0, inv.totalMinor - paidMinor), inv.currency), true);
    doc.fontSize(8).fillColor("#5B6770").text(`(${mode})`, 330, y, { width: 217, align: "right" });
    doc.y = y + 20;

    doc.x = 48;
    doc.fontSize(9).fillColor(ink);
    if (inv.note) doc.text(`Note : ${inv.note}`, 48, doc.y, { width: 499 });
    if (biz.legalMentions) doc.moveDown(0.5).text(biz.legalMentions, 48, doc.y, { width: 499 });
    if (biz.mode === "web" && biz.paymentInstructions) {
      doc.moveDown(0.5).fillColor(accent).text("Instructions de paiement (hors Pi, non vérifiées automatiquement)", 48, doc.y);
      doc.fillColor(ink).text(biz.paymentInstructions, 48, doc.y, { width: 499 });
    }
    doc.fontSize(7).fillColor("#5B6770").text(
      "Facture créée avec FacturePro, application indépendante, non affiliée à Pi Network. Pi Network is a trademark of PI Community Company.",
      48, 765, { width: 499, align: "center", lineBreak: true },
    );
    doc.end();
  });
}
