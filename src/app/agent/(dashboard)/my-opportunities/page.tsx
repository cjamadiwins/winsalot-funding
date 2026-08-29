import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { CrmOpportunityRow } from "@/lib/crm-types";
import type { CrmOpportunityScoreRow } from "@/lib/opportunity-finder";
import MyOpportunitiesClient, { type MyOpportunityRow } from "./MyOpportunitiesClient";

export default async function AgentMyOpportunitiesPage() {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (crm_opportunity_scores_agent_select_own, migration 0112) already
  // restricts this to opportunities assigned to this agent - no manual
  // .eq("assigned_agent_id", ...) filter is needed or even possible here
  // since the join target (crm_opportunities) is scoped the same way.
  const [{ data: scores }, { data: notes }] = await Promise.all([
    supabase.from("crm_opportunity_scores").select("*, crm_opportunities(*)").order("score", { ascending: false }),
    supabase
      .from("crm_activities")
      .select("opportunity_id, notes, occurred_at")
      .not("notes", "is", null)
      .not("opportunity_id", "is", null)
      .order("occurred_at", { ascending: true }),
  ]);

  const lastNoteByOpportunity = new Map<string, { notes: string; occurred_at: string }>();
  for (const row of notes ?? []) {
    if (row.opportunity_id && row.notes) {
      lastNoteByOpportunity.set(row.opportunity_id, { notes: row.notes, occurred_at: row.occurred_at });
    }
  }

  const rows: MyOpportunityRow[] = (scores ?? [])
    .map((raw): MyOpportunityRow | null => {
      const score = raw as CrmOpportunityScoreRow & { crm_opportunities: CrmOpportunityRow | null };
      const opp = score.crm_opportunities;
      if (!opp) return null;
      const lastNote = lastNoteByOpportunity.get(score.opportunity_id) ?? null;
      const signals = score.signals as { last_call_at?: string | null; last_email_activity_at?: string | null };
      return {
        score,
        businessName: opp.business_name,
        contactName: opp.contact_name,
        phone: opp.phone,
        email: opp.email,
        stageOrStatus: opp.stage,
        nextFollowUpAt: opp.next_follow_up_at,
        lastCallAt: signals.last_call_at ?? null,
        lastEmailAt: signals.last_email_activity_at ?? null,
        lastNote: lastNote?.notes ?? null,
        detailHref: `/agent/opportunities/${opp.id}`,
      };
    })
    .filter((r): r is MyOpportunityRow => r !== null);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Opportunities</h1>
        <p className="mt-1 text-sm text-slate-500">
          {crmUser.full_name || crmUser.email}, here are your opportunities ranked by score, with why the CRM flagged each one and what to do next.
        </p>
      </div>
      <MyOpportunitiesClient rows={rows} />
    </div>
  );
}
