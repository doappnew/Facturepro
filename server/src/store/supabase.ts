// Implémentation Supabase. Utilise la clé de service, uniquement côté serveur (RLS activée, sans politique publique).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseDecimal } from "../calc.js";
import type {
  Business, BusinessInput, Client, ClientInput, DraftInput, Invoice, InvoiceStatus, PiPayment, ShareLink, Store, StoredLine, User,
} from "./types.js";

type Row = Record<string, any>;

function fail(op: string, error: { message: string; code?: string } | null): never {
  // On journalise l'opération et le code d'erreur, jamais de données.
  console.error(`db: ${op} ${error?.code ?? ""}`);
  throw new Error(`Erreur base de données (${op})`);
}

const toUser = (r: Row): User => ({ id: r.id, piUid: r.pi_uid, piUsername: r.pi_username });
const toBusiness = (r: Row): Business => ({
  id: r.id, ownerId: r.owner_id, name: r.name, countryCode: r.country_code, defaultCurrency: r.default_currency, mode: r.mode,
  address: r.address, taxId: r.tax_id, contact: r.contact, paymentTermsDays: r.payment_terms_days,
  paymentInstructions: r.payment_instructions, legalMentions: r.legal_mentions,
});
const toClient = (r: Row): Client => ({
  id: r.id, businessId: r.business_id, name: r.name, countryCode: r.country_code, address: r.address, taxId: r.tax_id, contact: r.contact,
});
const toLine = (r: Row): StoredLine => ({
  position: r.position, description: r.description, quantityMilli: Number(r.quantity_milli), unitPriceMinor: Number(r.unit_price_minor),
  discount: r.discount_type === "percent" ? { type: "percent", bps: Number(r.discount_value) }
    : r.discount_type === "fixed" ? { type: "fixed", minor: Number(r.discount_value) } : undefined,
  taxRateBps: r.tax_rate_bps, grossMinor: Number(r.gross_minor), discountMinor: Number(r.discount_minor), baseMinor: Number(r.base_minor),
});
const toInvoice = (r: Row, lines: StoredLine[] = []): Invoice => ({
  id: r.id, businessId: r.business_id, clientId: r.client_id, kind: r.kind, originalInvoiceId: r.original_invoice_id, number: r.number,
  status: r.status, currency: r.currency_code, taxMode: r.tax_mode, issueDate: r.issue_date, dueDate: r.due_date,
  subtotalMinor: Number(r.subtotal_minor), taxTotalMinor: Number(r.tax_total_minor), totalMinor: Number(r.total_minor), note: r.note, lines,
});
const toLink = (r: Row): ShareLink => ({
  id: r.id, invoiceId: r.invoice_id, tokenHash: r.token_hash, expiresAt: r.expires_at, revokedAt: r.revoked_at,
});
const amt = (v: unknown): string => (typeof v === "number" ? v.toFixed(7) : String(v));
const toPayment = (r: Row): PiPayment => ({
  id: r.id, invoiceId: r.invoice_id, piPaymentId: r.pi_payment_id, network: r.network, amountPi: amt(r.amount_pi),
  payerPiUid: r.payer_pi_uid, status: r.status, txid: r.txid,
});

function lineRows(invoiceId: string, input: DraftInput) {
  return input.lines.map((l, i) => ({
    invoice_id: invoiceId, position: i + 1, description: l.description, quantity_milli: l.quantityMilli,
    unit_price_minor: l.unitPriceMinor, discount_type: l.discount?.type ?? null,
    discount_value: l.discount ? (l.discount.type === "percent" ? l.discount.bps : l.discount.minor) : null,
    tax_rate_bps: l.taxRateBps, gross_minor: input.totals.lines[i]!.grossMinor,
    discount_minor: input.totals.lines[i]!.discountMinor, base_minor: input.totals.lines[i]!.baseMinor,
  }));
}

export class SupabaseStore implements Store {
  private db: SupabaseClient;
  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async upsertUser(piUid: string, piUsername: string | null) {
    const { data, error } = await this.db.from("users")
      .upsert({ pi_uid: piUid, pi_username: piUsername }, { onConflict: "pi_uid" }).select().single();
    if (error) fail("upsertUser", error);
    return toUser(data);
  }
  async getUser(id: string) {
    const { data, error } = await this.db.from("users").select().eq("id", id).maybeSingle();
    if (error) fail("getUser", error);
    return data ? toUser(data) : null;
  }

  async getBusinessByOwner(ownerId: string) {
    const { data, error } = await this.db.from("businesses").select().eq("owner_id", ownerId).limit(1).maybeSingle();
    if (error) fail("getBusinessByOwner", error);
    return data ? toBusiness(data) : null;
  }
  async getBusinessById(id: string) {
    const { data, error } = await this.db.from("businesses").select().eq("id", id).maybeSingle();
    if (error) fail("getBusinessById", error);
    return data ? toBusiness(data) : null;
  }
  async saveBusiness(ownerId: string, i: BusinessInput) {
    const row = {
      owner_id: ownerId, name: i.name, country_code: i.countryCode, default_currency: i.defaultCurrency, mode: i.mode,
      address: i.address, tax_id: i.taxId, contact: i.contact, payment_terms_days: i.paymentTermsDays,
      payment_instructions: i.paymentInstructions, legal_mentions: i.legalMentions,
    };
    const existing = await this.getBusinessByOwner(ownerId);
    const q = existing
      ? this.db.from("businesses").update(row).eq("id", existing.id)
      : this.db.from("businesses").insert(row);
    const { data, error } = await q.select().single();
    if (error) fail("saveBusiness", error);
    return toBusiness(data);
  }

  async listClients(businessId: string) {
    const { data, error } = await this.db.from("clients").select().eq("business_id", businessId).order("name");
    if (error) fail("listClients", error);
    return (data ?? []).map(toClient);
  }
  async getClient(businessId: string, id: string) {
    const { data, error } = await this.db.from("clients").select().eq("id", id).eq("business_id", businessId).maybeSingle();
    if (error) fail("getClient", error);
    return data ? toClient(data) : null;
  }
  async getClientById(id: string) {
    const { data, error } = await this.db.from("clients").select().eq("id", id).maybeSingle();
    if (error) fail("getClientById", error);
    return data ? toClient(data) : null;
  }
  async createClient(businessId: string, i: ClientInput) {
    const { data, error } = await this.db.from("clients").insert({
      business_id: businessId, name: i.name, country_code: i.countryCode, address: i.address, tax_id: i.taxId, contact: i.contact,
    }).select().single();
    if (error) fail("createClient", error);
    return toClient(data);
  }

  private async withLines(r: Row): Promise<Invoice> {
    const { data, error } = await this.db.from("invoice_lines").select().eq("invoice_id", r.id).order("position");
    if (error) fail("lines", error);
    return toInvoice(r, (data ?? []).map(toLine));
  }

  async createDraft(businessId: string, input: DraftInput) {
    const { data, error } = await this.db.from("invoices").insert({
      business_id: businessId, client_id: input.clientId, currency_code: input.currency, tax_mode: input.taxMode, note: input.note,
      subtotal_minor: input.totals.subtotalMinor, tax_total_minor: input.totals.taxTotalMinor, total_minor: input.totals.totalMinor,
    }).select().single();
    if (error) fail("createDraft", error);
    const { error: e2 } = await this.db.from("invoice_lines").insert(lineRows(data.id, input));
    if (e2) {
      await this.db.from("invoices").delete().eq("id", data.id); // pas de brouillon sans lignes
      fail("createDraftLines", e2);
    }
    return this.withLines(data);
  }
  async updateDraft(businessId: string, id: string, input: DraftInput) {
    const { data, error } = await this.db.from("invoices").update({
      client_id: input.clientId, currency_code: input.currency, tax_mode: input.taxMode, note: input.note,
      subtotal_minor: input.totals.subtotalMinor, tax_total_minor: input.totals.taxTotalMinor, total_minor: input.totals.totalMinor,
    }).eq("id", id).eq("business_id", businessId).eq("status", "draft").select().maybeSingle();
    if (error) fail("updateDraft", error);
    if (!data) return null;
    const del = await this.db.from("invoice_lines").delete().eq("invoice_id", id);
    if (del.error) fail("updateDraftDelete", del.error);
    const ins = await this.db.from("invoice_lines").insert(lineRows(id, input));
    if (ins.error) fail("updateDraftLines", ins.error);
    return this.withLines(data);
  }
  async getInvoice(businessId: string, id: string) {
    const { data, error } = await this.db.from("invoices").select().eq("id", id).eq("business_id", businessId).maybeSingle();
    if (error) fail("getInvoice", error);
    return data ? this.withLines(data) : null;
  }
  async getInvoiceById(id: string) {
    const { data, error } = await this.db.from("invoices").select().eq("id", id).maybeSingle();
    if (error) fail("getInvoiceById", error);
    return data ? this.withLines(data) : null;
  }
  async listInvoices(businessId: string) {
    const { data, error } = await this.db.from("invoices").select().eq("business_id", businessId).order("created_at", { ascending: false });
    if (error) fail("listInvoices", error);
    return (data ?? []).map((r) => toInvoice(r));
  }
  async issueInvoice(businessId: string, id: string, series: string, issueDate: string, dueDate: string) {
    const current = await this.getInvoice(businessId, id);
    if (!current || current.status !== "draft") return null;
    const { data: n, error: e1 } = await this.db.rpc("next_invoice_number", { p_business: businessId, p_series: series });
    if (e1) fail("nextNumber", e1);
    const number = `${series}-${String(n).padStart(5, "0")}`;
    const { data, error } = await this.db.from("invoices").update({
      number, status: "issued", issue_date: issueDate, due_date: dueDate,
    }).eq("id", id).eq("business_id", businessId).eq("status", "draft").select().maybeSingle();
    if (error) fail("issueInvoice", error);
    return data ? this.withLines(data) : null;
  }
  async setInvoiceStatus(businessId: string, id: string, from: InvoiceStatus[], to: InvoiceStatus) {
    const { data, error } = await this.db.from("invoices").update({ status: to })
      .eq("id", id).eq("business_id", businessId).in("status", from).select().maybeSingle();
    if (error) fail("setInvoiceStatus", error);
    return data ? this.withLines(data) : null;
  }

  async createShareLink(invoiceId: string, tokenHash: string, expiresAt: string | null) {
    const { data, error } = await this.db.from("share_links").insert({ invoice_id: invoiceId, token_hash: tokenHash, expires_at: expiresAt }).select().single();
    if (error) fail("createShareLink", error);
    return toLink(data);
  }
  async revokeShareLinks(invoiceId: string) {
    const { error } = await this.db.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("invoice_id", invoiceId).is("revoked_at", null);
    if (error) fail("revokeShareLinks", error);
  }
  async findShareLink(tokenHash: string) {
    const { data, error } = await this.db.from("share_links").select().eq("token_hash", tokenHash).maybeSingle();
    if (error) fail("findShareLink", error);
    return data ? toLink(data) : null;
  }

  async insertPiPayment(p: Omit<PiPayment, "id">) {
    const { data, error } = await this.db.from("pi_payments").insert({
      invoice_id: p.invoiceId, pi_payment_id: p.piPaymentId, network: p.network, amount_pi: p.amountPi,
      payer_pi_uid: p.payerPiUid, status: p.status, txid: p.txid,
    }).select().single();
    if (error) fail("insertPiPayment", error);
    return toPayment(data);
  }
  async getPiPayment(piPaymentId: string) {
    const { data, error } = await this.db.from("pi_payments").select().eq("pi_payment_id", piPaymentId).maybeSingle();
    if (error) fail("getPiPayment", error);
    return data ? toPayment(data) : null;
  }
  async updatePiPayment(piPaymentId: string, patch: Partial<Pick<PiPayment, "status" | "txid">>) {
    const upd: Row = { ...patch };
    if (patch.status === "completed") upd.completed_at = new Date().toISOString();
    const { data, error } = await this.db.from("pi_payments").update(upd).eq("pi_payment_id", piPaymentId).select().maybeSingle();
    if (error) fail("updatePiPayment", error);
    return data ? toPayment(data) : null;
  }
  async sumCompletedPiMinor(invoiceId: string) {
    const { data, error } = await this.db.from("pi_payments").select("amount_pi").eq("invoice_id", invoiceId).eq("status", "completed");
    if (error) fail("sumCompletedPiMinor", error);
    return (data ?? []).reduce((a, r) => a + parseDecimal(amt(r.amount_pi), 7), 0);
  }
}
