import "server-only";
import type { createSupabaseServerClient } from "./supabase-server";
import { effectiveInvoiceStatus, type CrmInvoiceAuditRow, type CrmInvoiceLineItemRow, type CrmInvoiceRow, type CrmInvoiceWithClient } from "./crm-invoices-types";
import type { CrmPaymentRow } from "./crm-clients-types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type InvoiceListFilters = {
  search?: string;
  status?: string;
  clientId?: string;
};

// Powers the admin Invoices list. `status` filters against the
// *effective* status (Overdue included) computed client-side after
// fetch, since Overdue is derived from due_date rather than stored.
export async function fetchInvoiceList(supabase: SupabaseClient, filters: InvoiceListFilters): Promise<{ data: CrmInvoiceWithClient[]; error: string | null }> {
  let query = supabase.from("crm_invoices").select("*, crm_clients(id, company_name, email, status)").order("issue_date", { ascending: false });
  if (filters.clientId) query = query.eq("client_id", filters.clientId);
  if (filters.search) query = query.ilike("invoice_number", `%${filters.search}%`);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  let rows = (data ?? []) as unknown as CrmInvoiceWithClient[];

  if (filters.status) {
    rows = rows.filter((inv) => effectiveInvoiceStatus(inv) === filters.status);
  }

  return { data: rows, error: null };
}

export type InvoiceDetail = {
  invoice: CrmInvoiceRow;
  client: { id: string; company_name: string; email: string | null } | null;
  lineItems: CrmInvoiceLineItemRow[];
  payments: CrmPaymentRow[];
  audit: CrmInvoiceAuditRow[];
};

export async function fetchInvoiceDetail(supabase: SupabaseClient, invoiceId: string): Promise<{ data: InvoiceDetail | null; error: string | null }> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("crm_invoices")
    .select("*, crm_clients(id, company_name, email)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceError) return { data: null, error: invoiceError.message };
  if (!invoice) return { data: null, error: "Invoice not found." };

  const { crm_clients, ...invoiceRow } = invoice as CrmInvoiceRow & { crm_clients: { id: string; company_name: string; email: string | null } | null };

  const [{ data: lineItems }, { data: payments }, { data: audit }] = await Promise.all([
    supabase.from("crm_invoice_line_items").select("*").eq("invoice_id", invoiceId).order("sort_order"),
    supabase.from("crm_payments").select("*").eq("invoice_id", invoiceId).order("payment_date", { ascending: false }),
    supabase.from("crm_invoice_audit").select("*").eq("invoice_id", invoiceId).order("occurred_at", { ascending: false }),
  ]);

  return {
    data: {
      invoice: invoiceRow,
      client: crm_clients,
      lineItems: (lineItems ?? []) as CrmInvoiceLineItemRow[],
      payments: (payments ?? []) as CrmPaymentRow[],
      audit: (audit ?? []) as CrmInvoiceAuditRow[],
    },
    error: null,
  };
}

export type InvoiceDashboardSummary = {
  totalInvoicedThisMonth: number;
  totalCollectedThisMonth: number;
  outstandingBalance: number;
  overdueCount: number;
  overdueInvoices: CrmInvoiceWithClient[];
  recentPayments: (CrmPaymentRow & { crm_clients: { company_name: string } | null })[];
};

// "Clean dashboard summaries for total invoiced this month, total
// collected this month, outstanding balance, overdue invoices, recent
// payments." Admin-only by construction - this is only ever called from
// an already-requireCrmAdmin-gated page.
export async function fetchInvoiceDashboardSummary(supabase: SupabaseClient): Promise<InvoiceDashboardSummary> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [{ data: allInvoices }, { data: monthPayments }, { data: recentPayments }] = await Promise.all([
    supabase.from("crm_invoices").select("*, crm_clients(id, company_name, email, status)").neq("status", "Draft"),
    supabase.from("crm_payments").select("amount").is("reversed_at", null).gte("payment_date", monthStart),
    supabase
      .from("crm_payments")
      .select("*, crm_clients(company_name)")
      .is("reversed_at", null)
      .order("payment_date", { ascending: false })
      .limit(10),
  ]);

  const invoices = (allInvoices ?? []) as unknown as CrmInvoiceWithClient[];
  const monthInvoiced = invoices
    .filter((inv) => inv.issue_date >= monthStart && inv.status !== "Cancelled")
    .reduce((sum, inv) => sum + Number(inv.total), 0);
  const outstandingBalance = invoices
    .filter((inv) => inv.status !== "Cancelled" && inv.status !== "Archived")
    .reduce((sum, inv) => sum + Number(inv.balance), 0);
  const overdueInvoices = invoices.filter((inv) => effectiveInvoiceStatus(inv) === "Overdue");
  const totalCollectedThisMonth = ((monthPayments ?? []) as { amount: number }[]).reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    totalInvoicedThisMonth: monthInvoiced,
    totalCollectedThisMonth,
    outstandingBalance,
    overdueCount: overdueInvoices.length,
    overdueInvoices,
    recentPayments: (recentPayments ?? []) as unknown as (CrmPaymentRow & { crm_clients: { company_name: string } | null })[],
  };
}
