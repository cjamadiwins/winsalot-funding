import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireAdminUser } from "@/lib/admin-auth";
import type { ActiveCleaningOpportunityRow } from "@/lib/opportunities/types";
import type { CrmUserRow } from "@/lib/crm-types";
import OpportunitiesClient from "./OpportunitiesClient";

export default async function OpportunitiesPage() {
  await requireAdminUser();
  const supabase = await createSupabaseServerClient();

  // RLS (active_cleaning_opportunities_admin_all / crm_users_admin_select_all)
  // permits a full read here because this page is already gated by
  // requireAdminUser().
  const [
    { data: opportunities, error: opportunitiesError },
    { data: agents, error: agentsError },
  ] = await Promise.all([
    supabase
      .from("active_cleaning_opportunities")
      .select("*")
      .order("date_discovered", { ascending: false }),
    supabase.from("crm_users").select("*").order("full_name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Active Cleaning Opportunities</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Publicly available businesses and organizations showing recent intent to purchase commercial
        cleaning, janitorial, custodial, or building-maintenance services across Metro Vancouver and
        the Greater Toronto Area. Every record below is a potential opportunity surfaced from a public
        source, not a guaranteed buyer.
      </p>

      {(opportunitiesError || agentsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load opportunities: {(opportunitiesError ?? agentsError)?.message}
        </p>
      )}

      {!opportunitiesError && !agentsError && (
        <div className="mt-6">
          <OpportunitiesClient
            opportunities={(opportunities ?? []) as ActiveCleaningOpportunityRow[]}
            agents={(agents ?? []) as CrmUserRow[]}
          />
        </div>
      )}
    </div>
  );
}
