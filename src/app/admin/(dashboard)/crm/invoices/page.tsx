import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchInvoiceDashboardSummary, fetchInvoiceList } from "@/lib/crm-invoices-data";
import AdminInvoicesClient from "@/components/crm-invoices/AdminInvoicesClient";
import {
  createInvoiceAction,
  archiveInvoiceAction,
  cancelInvoiceAction,
  deleteInvoiceAction,
  deleteTestInvoiceAction,
  updatePaymentAction,
  reversePaymentAction,
  deleteTestPaymentAction,
} from "./actions";

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; client?: string; create?: string; deleted?: string }>;
}) {
  await requireCrmAdmin();
  const { search, status, client, create, deleted } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: invoices, error }, summary, { data: clients }] = await Promise.all([
    fetchInvoiceList(supabase, { search, status, clientId: client }),
    fetchInvoiceDashboardSummary(supabase),
    supabase.from("crm_clients").select("id, company_name, email, billing_address, currency").neq("status", "Archived").order("company_name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
      <p className="mt-1 text-sm text-slate-500">
        Create, send, and track invoices for Winsalot Corp&apos;s clients. Wave remains the official accounting record - this is for
        creating, emailing, and tracking invoices only. Admin-only.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load invoices: {error}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <AdminInvoicesClient
            invoices={invoices}
            summary={summary}
            clients={(clients ?? []).map((c) => ({ id: c.id, company_name: c.company_name, email: c.email, billing_address: c.billing_address, currency: c.currency }))}
            createAction={createInvoiceAction}
            archiveAction={archiveInvoiceAction}
            cancelAction={cancelInvoiceAction}
            deleteAction={deleteInvoiceAction}
            deleteTestInvoiceAction={deleteTestInvoiceAction}
            updatePaymentAction={updatePaymentAction}
            reversePaymentAction={reversePaymentAction}
            deleteTestPaymentAction={deleteTestPaymentAction}
            initialFilters={{ search: search ?? "", status: status ?? "", client: client ?? "" }}
            autoOpenCreateForClientId={create}
            justDeleted={deleted === "1"}
          />
        </div>
      )}
    </div>
  );
}
