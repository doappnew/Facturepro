// Interface d'accès aux données. Deux implémentations : Supabase (production) et mémoire (tests).
import type { InvoiceTotals, LineInput } from "../calc.js";

export interface User {
  id: string;
  piUid: string;
  piUsername: string | null;
}

export interface Business {
  id: string;
  ownerId: string;
  name: string;
  countryCode: string;
  defaultCurrency: string;
  mode: "pi_only" | "web";
  address: string | null;
  taxId: string | null;
  contact: string | null;
  paymentTermsDays: number;
  paymentInstructions: string | null;
  legalMentions: string | null;
}

export type BusinessInput = Omit<Business, "id" | "ownerId">;

export interface Client {
  id: string;
  businessId: string;
  name: string;
  countryCode: string | null;
  address: string | null;
  taxId: string | null;
  contact: string | null;
}
export type ClientInput = Omit<Client, "id" | "businessId">;

export type InvoiceStatus =
  | "draft" | "issued" | "sent" | "pending_payment" | "partially_paid" | "paid" | "overdue" | "cancelled" | "credit_issued";

export interface StoredLine extends LineInput {
  position: number;
  grossMinor: number;
  discountMinor: number;
  baseMinor: number;
}

export interface Invoice {
  id: string;
  businessId: string;
  clientId: string;
  kind: "invoice" | "credit_note";
  originalInvoiceId: string | null;
  number: string | null;
  status: InvoiceStatus;
  currency: string;
  taxMode: "exclusive" | "inclusive";
  issueDate: string | null;
  dueDate: string | null;
  subtotalMinor: number;
  taxTotalMinor: number;
  totalMinor: number;
  note: string | null;
  lines: StoredLine[];
}

export interface DraftInput {
  clientId: string;
  currency: string;
  taxMode: "exclusive" | "inclusive";
  note: string | null;
  lines: LineInput[];
  totals: InvoiceTotals;
  creditOf?: string; // identifiant de la facture d'origine : crée un avoir
}

export interface ShareLink {
  id: string;
  invoiceId: string;
  tokenHash: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface PiPayment {
  id: string;
  invoiceId: string;
  piPaymentId: string;
  network: "Pi Network" | "Pi Testnet";
  amountPi: string; // décimal exact en texte
  payerPiUid: string | null;
  status: "created" | "approved" | "completed" | "cancelled" | "failed";
  txid: string | null;
}

export type ServiceKind = "invoice_fee" | "subscription";
export interface ServicePayment {
  id: string;
  piPaymentId: string;
  kind: ServiceKind;
  businessId: string;
  invoiceId: string | null;
  network: "Pi Network" | "Pi Testnet";
  amountPi: string;
  payerPiUid: string;
  status: "created" | "approved" | "completed" | "cancelled" | "failed";
  txid: string | null;
}

export type TestnetKind = "payout" | "receive";
export interface TestnetTest { piUid: string; kind: TestnetKind; paymentId: string | null; txid: string | null; status: "started" | "done" | "failed" }

export interface Store {
  upsertUser(piUid: string, piUsername: string | null): Promise<User>;
  getUser(id: string): Promise<User | null>;

  getBusinessByOwner(ownerId: string): Promise<Business | null>;
  saveBusiness(ownerId: string, input: BusinessInput): Promise<Business>;

  listClients(businessId: string): Promise<Client[]>;
  getClient(businessId: string, id: string): Promise<Client | null>;
  createClient(businessId: string, input: ClientInput): Promise<Client>;

  createDraft(businessId: string, input: DraftInput): Promise<Invoice>;
  updateDraft(businessId: string, id: string, input: DraftInput): Promise<Invoice | null>; // null si introuvable ou non brouillon
  getInvoice(businessId: string, id: string): Promise<Invoice | null>;
  getInvoiceById(id: string): Promise<Invoice | null>;
  listInvoices(businessId: string): Promise<Omit<Invoice, "lines">[]>;
  issueInvoice(businessId: string, id: string, series: string, issueDate: string, dueDate: string): Promise<Invoice | null>;
  setInvoiceStatus(businessId: string, id: string, from: InvoiceStatus[], to: InvoiceStatus): Promise<Invoice | null>;

  createShareLink(invoiceId: string, tokenHash: string, expiresAt: string | null): Promise<ShareLink>;
  revokeShareLinks(invoiceId: string): Promise<void>;
  findShareLink(tokenHash: string): Promise<ShareLink | null>;

  getBusinessById(id: string): Promise<Business | null>;
  getClientById(id: string): Promise<Client | null>;

  insertPiPayment(p: Omit<PiPayment, "id">): Promise<PiPayment>;
  getPiPayment(piPaymentId: string): Promise<PiPayment | null>;
  updatePiPayment(piPaymentId: string, patch: Partial<Pick<PiPayment, "status" | "txid">>): Promise<PiPayment | null>;
  sumCompletedPiMinor(invoiceId: string): Promise<number>;

  // Frais de service (payés en Pi par l'entreprise qui facture).
  insertServicePayment(p: Omit<ServicePayment, "id">): Promise<ServicePayment>;
  getServicePayment(piPaymentId: string): Promise<ServicePayment | null>;
  updateServicePayment(piPaymentId: string, patch: Partial<Pick<ServicePayment, "status">>): Promise<void>;
  /** Passe le paiement à « completed » une seule fois : renvoie la ligne si la transition a eu lieu, sinon null. */
  completeServicePayment(piPaymentId: string, txid: string): Promise<ServicePayment | null>;
  hasCompletedInvoiceFee(invoiceId: string): Promise<boolean>;
  getSubscriptionUntil(businessId: string): Promise<string | null>;
  extendSubscription(businessId: string, days: number, nowIso: string): Promise<string>;

  // Tests Testnet exigés par la core team : une seule fois par compte et par type.
  claimTestnet(piUid: string, kind: TestnetKind): Promise<boolean>; // false si déjà tenté
  finishTestnet(piUid: string, kind: TestnetKind, patch: { paymentId?: string | null; txid?: string | null; status: "done" | "failed" }): Promise<void>;
  listTestnet(piUid: string): Promise<TestnetTest[]>;
  countTestnetDone(kind: TestnetKind): Promise<number>;
}
