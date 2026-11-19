// Implémentation en mémoire : sert aux tests, jamais à la production.
import { randomUUID } from "node:crypto";
import { parseDecimal } from "../calc.js";
import type {
  Business, BusinessInput, Client, ClientInput, DraftInput, Invoice, InvoiceStatus, PiPayment, ShareLink, Store, StoredLine, User,
} from "./types.js";

function toLines(input: DraftInput): StoredLine[] {
  return input.lines.map((l, i) => ({ ...l, position: i + 1, ...input.totals.lines[i]! }));
}

export class MemoryStore implements Store {
  users = new Map<string, User>();
  businesses = new Map<string, Business>();
  clients = new Map<string, Client>();
  invoices = new Map<string, Invoice>();
  counters = new Map<string, number>();
  links = new Map<string, ShareLink>();
  payments = new Map<string, PiPayment>();

  async upsertUser(piUid: string, piUsername: string | null) {
    const found = [...this.users.values()].find((u) => u.piUid === piUid);
    if (found) { found.piUsername = piUsername ?? found.piUsername; return found; }
    const u: User = { id: randomUUID(), piUid, piUsername };
    this.users.set(u.id, u);
    return u;
  }
  async getUser(id: string) { return this.users.get(id) ?? null; }

  async getBusinessByOwner(ownerId: string) {
    return [...this.businesses.values()].find((b) => b.ownerId === ownerId) ?? null;
  }
  async saveBusiness(ownerId: string, input: BusinessInput) {
    const existing = await this.getBusinessByOwner(ownerId);
    const b: Business = { ...input, id: existing?.id ?? randomUUID(), ownerId };
    this.businesses.set(b.id, b);
    return b;
  }
  async getBusinessById(id: string) { return this.businesses.get(id) ?? null; }

  async listClients(businessId: string) { return [...this.clients.values()].filter((c) => c.businessId === businessId); }
  async getClient(businessId: string, id: string) {
    const c = this.clients.get(id);
    return c && c.businessId === businessId ? c : null;
  }
  async getClientById(id: string) { return this.clients.get(id) ?? null; }
  async createClient(businessId: string, input: ClientInput) {
    const c: Client = { ...input, id: randomUUID(), businessId };
    this.clients.set(c.id, c);
    return c;
  }

  async createDraft(businessId: string, input: DraftInput) {
    const inv: Invoice = {
      id: randomUUID(), businessId, clientId: input.clientId, kind: "invoice", originalInvoiceId: null, number: null,
      status: "draft", currency: input.currency, taxMode: input.taxMode, issueDate: null, dueDate: null,
      subtotalMinor: input.totals.subtotalMinor, taxTotalMinor: input.totals.taxTotalMinor, totalMinor: input.totals.totalMinor,
      note: input.note, lines: toLines(input),
    };
    this.invoices.set(inv.id, inv);
    return inv;
  }
  async updateDraft(businessId: string, id: string, input: DraftInput) {
    const inv = this.invoices.get(id);
    if (!inv || inv.businessId !== businessId || inv.status !== "draft") return null;
    Object.assign(inv, {
      clientId: input.clientId, currency: input.currency, taxMode: input.taxMode, note: input.note,
      subtotalMinor: input.totals.subtotalMinor, taxTotalMinor: input.totals.taxTotalMinor, totalMinor: input.totals.totalMinor,
      lines: toLines(input),
    });
    return inv;
  }
  async getInvoice(businessId: string, id: string) {
    const inv = this.invoices.get(id);
    return inv && inv.businessId === businessId ? inv : null;
  }
  async getInvoiceById(id: string) { return this.invoices.get(id) ?? null; }
  async listInvoices(businessId: string) {
    return [...this.invoices.values()].filter((i) => i.businessId === businessId).map(({ lines: _l, ...rest }) => rest);
  }
  async issueInvoice(businessId: string, id: string, series: string, issueDate: string, dueDate: string) {
    const inv = this.invoices.get(id);
    if (!inv || inv.businessId !== businessId || inv.status !== "draft") return null;
    const key = `${businessId}|${series}`;
    const n = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, n);
    inv.number = `${series}-${String(n).padStart(5, "0")}`;
    inv.status = "issued";
    inv.issueDate = issueDate;
    inv.dueDate = dueDate;
    return inv;
  }
  async setInvoiceStatus(businessId: string, id: string, from: InvoiceStatus[], to: InvoiceStatus) {
    const inv = this.invoices.get(id);
    if (!inv || inv.businessId !== businessId || !from.includes(inv.status)) return null;
    inv.status = to;
    return inv;
  }

  async createShareLink(invoiceId: string, tokenHash: string, expiresAt: string | null) {
    const l: ShareLink = { id: randomUUID(), invoiceId, tokenHash, expiresAt, revokedAt: null };
    this.links.set(l.id, l);
    return l;
  }
  async revokeShareLinks(invoiceId: string) {
    for (const l of this.links.values()) if (l.invoiceId === invoiceId && !l.revokedAt) l.revokedAt = new Date().toISOString();
  }
  async findShareLink(tokenHash: string) {
    return [...this.links.values()].find((l) => l.tokenHash === tokenHash) ?? null;
  }

  async insertPiPayment(p: Omit<PiPayment, "id">) {
    if (this.payments.has(p.piPaymentId)) throw new Error("paiement déjà enregistré");
    const row: PiPayment = { ...p, id: randomUUID() };
    this.payments.set(p.piPaymentId, row);
    return row;
  }
  async getPiPayment(piPaymentId: string) { return this.payments.get(piPaymentId) ?? null; }
  async updatePiPayment(piPaymentId: string, patch: Partial<Pick<PiPayment, "status" | "txid">>) {
    const p = this.payments.get(piPaymentId);
    if (!p) return null;
    Object.assign(p, patch);
    return p;
  }
  async sumCompletedPiMinor(invoiceId: string) {
    return [...this.payments.values()]
      .filter((p) => p.invoiceId === invoiceId && p.status === "completed")
      .reduce((a, p) => a + parseDecimal(p.amountPi, 7), 0);
  }
}
