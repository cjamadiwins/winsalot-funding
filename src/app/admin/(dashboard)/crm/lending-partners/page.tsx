import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchLendingPartnerList } from "@/lib/crm-lending-partners-data";
import type { CrmUserRow } from "@/lib/crm-types";
import AdminLendingPartnersClient from "@/components/crm-lending-partners/AdminLendingPartnersClient";
import { createLendingPartnerAction } from "./actions";

export default async function AdminLendingPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string; agent?: string }>;
}) {
  await requireCrmAdmin();
  const { search, type, agent } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: partners, error }, { data: agents }] = await Promise.all([
    fetchLendingPartnerList(supabase, { search, contactType: type, assignedAgentId: agent }),
    supabase.from("crm_users").select("*").eq("role", "agent").order("full_name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Lending &amp; Referral Partners</h1>
      <p className="mt-1 text-sm text-slate-500">
        The supply side of Business Financing — lenders, brokers, and referral/reseller partners Winsalot places deals
        with. Distinct from Business Finance Prospects/Clients (see the CRM dashboard), which is the demand side.
        Admin-only.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load lending partners: {error}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <AdminLendingPartnersClient
            partners={partners}
            agents={((agents ?? []) as CrmUserRow[]).map((a) => ({ id: a.id, full_name: a.full_name, email: a.email }))}
            createAction={createLendingPartnerAction}
            initialFilters={{ search: search ?? "", type: type ?? "", agent: agent ?? "" }}
          />
        </div>
      )}
    </div>
  );
}
