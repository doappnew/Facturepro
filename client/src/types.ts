export interface Business {
  id: string; name: string; countryCode: string; defaultCurrency: string; mode: "pi_only" | "web";
  address: string | null; taxId: string | null; contact: string | null; paymentTermsDays: number;
  paymentInstructions: string | null; legalMentions: string | null;
}
export interface Client { id: string; name: string; countryCode: string | null; address: string | null; taxId: string | null; contact: string | null }
export type Status = "draft" | "issued" | "sent" | "pending_payment" | "partially_paid" | "paid" | "overdue" | "cancelled" | "credit_issued";
export interface InvoiceLine { description: string; quantityMilli: number; unitPriceMinor: number; discountMinor: number; taxRateBps: number; baseMinor: number }
export interface InvoiceSummary {
  id: string; clientId: string; kind: "invoice" | "credit_note"; number: string | null; status: Status; currency: string;
  issueDate: string | null; dueDate: string | null; totalMinor: number;
}
export interface Invoice extends InvoiceSummary {
  taxMode: "exclusive" | "inclusive"; subtotalMinor: number; taxTotalMinor: number; note: string | null; lines: InvoiceLine[]; paidMinor: number;
}
export interface PublicInvoice {
  number: string | null; kind: string; status: Status; currency: string; taxMode: "exclusive" | "inclusive";
  issueDate: string | null; dueDate: string | null; note: string | null;
  subtotalMinor: number; taxTotalMinor: number; totalMinor: number; paidMinor: number; balanceMinor: number;
  lines: InvoiceLine[];
  seller: { name: string; address: string | null; taxId: string | null; contact: string | null; legalMentions: string | null };
  paymentInstructions: string | null; client: { name: string }; payRef: string | null; payableInPi: boolean;
}
export const STATUS_LABEL: Record<Status, string> = {
  draft: "Brouillon", issued: "Émise", sent: "Envoyée", pending_payment: "En attente de paiement", partially_paid: "Partiellement payée",
  paid: "Payée", overdue: "En retard", cancelled: "Annulée", credit_issued: "Avoir émis",
};
