import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { ActiveCleaningOpportunityRow } from "@/lib/opportunities/types";
import OpportunitiesAgentClient from "./OpportunitiesAgentClient";

export default async function AgentOpportunitiesPage() {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (active_cleaning_opportunities_agent_select_own) already restricts
  // this to opportunities currently assigned to the signed-in agent, with
  // archived ones excluded entirely - no application-level filter needed.
  const { data: opportunities, error } = await supabase
    .from("active_cleaning_opportunities")
    .select("*")
    .order("date_discovered", { ascending: false });

  return (
    <div>
      <h1 className="font-heading text-[22px] font-bold text-[var(--color-ink-strong)]">
        Cleaning Opportunities
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Opportunities assigned to you. Every record is a potential opportunity from a public source,
        not a guaranteed buyer.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load opportunities: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-4">
          <OpportunitiesAgentClient opportunities={(opportunities ?? []) as ActiveCleaningOpportunityRow[]} />
        </div>
      )}
    </div>
  );
}
