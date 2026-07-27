import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getAllProviderInvoicesWithRelations } from "@/lib/provider-invoices";
import InvoicesDashboardClient from "./InvoicesDashboardClient";

// Admin Invoices dashboard (brief section 6) - every provider invoice
// across the whole directory, admin-only (requireCrmAdmin, same gate as
// the Provider Profile's own Invoices & Payments section). Reuses the
// same cleaning_providers-anchored data - no separate invoice-tracking
// system, no exposure to agents or the public quote-submission flow.
export default async function AdminInvoicesPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [invoices, { data: providers }] = await Promise.all([
    getAllProviderInvoicesWithRelations(supabase),
    supabase.from("cleaning_providers").select("id, company_name").order("company_name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every invoice billed to a provider, across the whole Providers directory. Open a row&apos;s provider profile
        to create invoices, record payments, or manage payment history.
      </p>

      <InvoicesDashboardClient
        invoices={invoices}
        providers={(providers ?? []) as { id: string; company_name: string }[]}
      />
    </div>
  );
}
