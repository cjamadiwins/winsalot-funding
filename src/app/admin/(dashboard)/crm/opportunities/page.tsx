import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { ActiveCleaningOpportunityRow, OpportunityCollectionRunRow } from "@/lib/opportunities/types";
import type { CrmUserRow } from "@/lib/crm-types";
import OpportunitiesAdminClient from "./OpportunitiesAdminClient";

export default async function AdminCrmOpportunitiesPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  // RLS (active_cleaning_opportunities_admin_all / crm_users_admin_select_all /
  // opportunity_collection_runs_admin_select) permits a full read here,
  // archived rows included, because this page is already gated by
  // requireCrmAdmin(). The run-log query is best-effort - it only exists
  // from migration 0017 onward, so a missing table there shouldn't break
  // the rest of the page.
  const [
    { data: opportunities, error: opportunitiesError },
    { data: agents, error: agentsError },
    { data: prospectRuns },
  ] = await Promise.all([
    supabase
      .from("active_cleaning_opportunities")
      .select("*")
      .order("date_discovered", { ascending: false }),
    supabase.from("crm_users").select("*").order("full_name"),
    supabase
      .from("opportunity_collection_runs")
      .select("*")
      .order("ran_at", { ascending: false })
      .limit(1),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Cleaning Opportunities</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Publicly available businesses and organizations showing recent intent to purchase commercial
        cleaning, janitorial, custodial, or building-maintenance services across Metro Vancouver and
        the Greater Toronto Area. Every record is a potential opportunity surfaced from a public
        source, not a guaranteed buyer.
      </p>

      {(opportunitiesError || agentsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load opportunities: {(opportunitiesError ?? agentsError)?.message}
        </p>
      )}

      {!opportunitiesError && !agentsError && (
        <div className="mt-6">
          <OpportunitiesAdminClient
            opportunities={(opportunities ?? []) as ActiveCleaningOpportunityRow[]}
            agents={(agents ?? []) as CrmUserRow[]}
            latestProspectRun={(prospectRuns?.[0] as OpportunityCollectionRunRow | undefined) ?? null}
          />
        </div>
      )}
    </div>
  );
}
