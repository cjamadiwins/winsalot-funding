import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import type {
  ProviderFinancialSummary,
  ProviderInvoiceLineItemRow,
  ProviderInvoiceRow,
  ProviderInvoiceWithRelations,
  ProviderPaymentRow,
} from "./provider-invoice-types";

const RECEIPT_BUCKET = "provider-files";
const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

// Promotes eligible invoices to Overdue, and demotes any that no longer
// qualify (e.g. the due date was edited into the future), so the stored
// `status` column is always correct the moment it's read - no cron/queue
// infra exists in this app, so every invoice list/dashboard fetch calls
// this first instead. Never touches Paid or Cancelled (brief: "A paid
// invoice must never be marked overdue"), and only ever promotes a
// Draft/Sent/Partially Paid invoice once its due date has passed *and* it
// still has a remaining balance.
export async function syncOverdueInvoices(
  supabase: SupabaseClient,
  cleaningProviderId?: string
): Promise<void> {
  let promote = supabase
    .from("provider_invoices")
    .update({ status: "overdue", updated_at: new Date().toISOString() })
    .in("status", ["draft", "sent", "partially_paid"])
    .lt("due_date", new Date().toISOString().slice(0, 10))
    .gt("balance", 0);
  if (cleaningProviderId) promote = promote.eq("cleaning_provider_id", cleaningProviderId);
  await promote;

  let demote = supabase
    .from("provider_invoices")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("status", "overdue")
    .gte("due_date", new Date().toISOString().slice(0, 10));
  if (cleaningProviderId) demote = demote.eq("cleaning_provider_id", cleaningProviderId);
  await demote;
}

export async function getProviderFinancialSummary(
  supabase: SupabaseClient,
  cleaningProviderId: string
): Promise<ProviderFinancialSummary> {
  await syncOverdueInvoices(supabase, cleaningProviderId);

  const { data: invoices } = await supabase
    .from("provider_invoices")
    .select("total, amount_paid, balance, status")
    .eq("cleaning_provider_id", cleaningProviderId)
    .neq("status", "cancelled");

  const rows = (invoices ?? []) as Pick<ProviderInvoiceRow, "total" | "amount_paid" | "balance" | "status">[];

  const totalInvoiced = rows.reduce((sum, r) => sum + r.total, 0);
  const totalPaid = rows.reduce((sum, r) => sum + r.amount_paid, 0);
  const outstandingBalance = rows.reduce((sum, r) => sum + Math.max(0, r.balance), 0);
  const overdueBalance = rows.filter((r) => r.status === "overdue").reduce((sum, r) => sum + Math.max(0, r.balance), 0);
  const unpaidInvoiceCount = rows.filter((r) => r.balance > 0 && r.status !== "draft").length;

  const { data: lastPayment } = await supabase
    .from("provider_payments")
    .select("payment_date")
    .eq("cleaning_provider_id", cleaningProviderId)
    .is("reversed_at", null)
    .order("payment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    totalInvoiced,
    totalPaid,
    outstandingBalance,
    overdueBalance,
    unpaidInvoiceCount,
    lastPaymentDate: (lastPayment as Pick<ProviderPaymentRow, "payment_date"> | null)?.payment_date ?? null,
  };
}

// Assembles each invoice with its line items and payments for the
// Provider Profile's Invoices & Payments section (brief sections 2-5) -
// two bulk fetches (not N+1) joined in memory, same shape the admin
// dashboard (getAllProviderInvoicesWithRelations below) also uses.
export async function getProviderInvoicesWithRelations(
  supabase: SupabaseClient,
  cleaningProviderId: string
): Promise<ProviderInvoiceWithRelations[]> {
  await syncOverdueInvoices(supabase, cleaningProviderId);

  const { data: invoices } = await supabase
    .from("provider_invoices")
    .select("*")
    .eq("cleaning_provider_id", cleaningProviderId)
    .order("invoice_date", { ascending: false });

  return attachLineItemsAndPayments(supabase, (invoices ?? []) as ProviderInvoiceRow[]);
}

// Admin Invoices dashboard (brief section 6) - every invoice across every
// provider, with the provider's display name joined in for the table.
export async function getAllProviderInvoicesWithRelations(
  supabase: SupabaseClient
): Promise<(ProviderInvoiceWithRelations & { providerName: string })[]> {
  await syncOverdueInvoices(supabase);

  const { data: invoices } = await supabase
    .from("provider_invoices")
    .select("*")
    .order("invoice_date", { ascending: false });

  const rows = (invoices ?? []) as ProviderInvoiceRow[];
  const withRelations = await attachLineItemsAndPayments(supabase, rows);

  const providerIds = Array.from(new Set(rows.map((r) => r.cleaning_provider_id)));
  const { data: providers } = providerIds.length
    ? await supabase.from("cleaning_providers").select("id, company_name").in("id", providerIds)
    : { data: [] };
  const nameById = new Map((providers ?? []).map((p) => [p.id as string, p.company_name as string]));

  return withRelations.map((invoice) => ({ ...invoice, providerName: nameById.get(invoice.cleaning_provider_id) ?? "Unknown Provider" }));
}

async function attachLineItemsAndPayments(
  supabase: SupabaseClient,
  invoices: ProviderInvoiceRow[]
): Promise<ProviderInvoiceWithRelations[]> {
  if (invoices.length === 0) return [];
  const ids = invoices.map((i) => i.id);

  const [{ data: lineItems }, { data: payments }] = await Promise.all([
    supabase.from("provider_invoice_line_items").select("*").in("invoice_id", ids).order("sort_order", { ascending: true }),
    supabase.from("provider_payments").select("*").in("invoice_id", ids).order("payment_date", { ascending: false }),
  ]);

  const lineItemsByInvoice = new Map<string, ProviderInvoiceLineItemRow[]>();
  for (const li of (lineItems ?? []) as ProviderInvoiceLineItemRow[]) {
    const list = lineItemsByInvoice.get(li.invoice_id) ?? [];
    list.push(li);
    lineItemsByInvoice.set(li.invoice_id, list);
  }

  const paymentsByInvoice = new Map<string, ProviderPaymentRow[]>();
  for (const p of (payments ?? []) as ProviderPaymentRow[]) {
    const list = paymentsByInvoice.get(p.invoice_id) ?? [];
    list.push(p);
    paymentsByInvoice.set(p.invoice_id, list);
  }

  return invoices.map((invoice) => ({
    ...invoice,
    lineItems: lineItemsByInvoice.get(invoice.id) ?? [],
    payments: paymentsByInvoice.get(invoice.id) ?? [],
  }));
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140);
}

// Optional payment receipt attachment, reusing the existing private
// provider-files bucket (migration 0028) rather than a new one - same
// service-role-only convention as lib/provider-documents.ts.
export async function uploadPaymentReceipt(input: {
  cleaningProviderId: string;
  file: File;
}): Promise<{ path?: string; error?: string }> {
  if (input.file.size === 0) return { error: "The selected file is empty." };
  if (input.file.size > MAX_RECEIPT_BYTES) return { error: "Receipts must be 15MB or smaller." };

  const admin = getSupabaseAdmin();
  const path = `receipts/${input.cleaningProviderId}/${Date.now()}-${safeFileName(input.file.name)}`;
  const buffer = await input.file.arrayBuffer();

  const { error } = await admin.storage.from(RECEIPT_BUCKET).upload(path, buffer, {
    contentType: input.file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return { error: "Failed to upload the receipt." };
  return { path };
}

export async function getReceiptSignedUrl(attachmentPath: string | null): Promise<string | null> {
  if (!attachmentPath) return null;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from(RECEIPT_BUCKET).createSignedUrl(attachmentPath, 600);
  if (error || !data) return null;
  return data.signedUrl;
}
