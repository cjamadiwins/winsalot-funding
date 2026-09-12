import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmOpportunityRow } from "@/lib/crm-types";
import type { CrmOpportunityScoreRow } from "@/lib/opportunity-finder";
import type { MyOpportunityRow } from "@/app/agent/(dashboard)/my-opportunities/MyOpportunitiesClient";

// Growth CRM agent's own scored opportunities (My Opportunities) - RLS
// (crm_opportunity_scores_agent_select_own, migration 0112) already
// restricts this to opportunities assigned to the signed-in agent. Shared
// by the standalone /agent/my-opportunities page and the agent dashboard's
// Opportunity Finder modal so both read the exact same query.
export async function loadAgentMyOpportunities(supabase: SupabaseClient, agentDisplayName: string): Promise<MyOpportunityRow[]> {
  const [{ data: scores }, { data: activities }, { data: appointments }, { data: pendingFollowUps }] = await Promise.all([
    supabase.from("crm_opportunity_scores").select("*, crm_opportunities(*)").order("score", { ascending: false }),
    supabase
      .from("crm_activities")
      .select("opportunity_id, activity_type, notes, occurred_at")
      .not("opportunity_id", "is", null)
      .order("occurred_at", { ascending: true }),
    supabase.from("winsalot_appointments").select("opportunity_id, status, created_at").not("opportunity_id", "is", null).order("created_at", { ascending: true }),
    supabase.from("crm_followups").select("id, opportunity_id, scheduled_at").eq("status", "pending").order("scheduled_at", { ascending: true }),
  ]);

  const notesByOpportunity = new Map<string, { notes: string; occurred_at: string }[]>();
  const lastCallOutcomeByOpportunity = new Map<string, string | null>();
  for (const row of activities ?? []) {
    if (!row.opportunity_id) continue;
    if (row.notes) {
      const list = notesByOpportunity.get(row.opportunity_id) ?? [];
      list.push({ notes: row.notes, occurred_at: row.occurred_at });
      notesByOpportunity.set(row.opportunity_id, list);
    }
    if (row.activity_type === "call") lastCallOutcomeByOpportunity.set(row.opportunity_id, row.notes ?? null);
  }
  const appointmentStatusByOpportunity = new Map<string, string>();
  for (const appt of appointments ?? []) {
    if (appt.opportunity_id) appointmentStatusByOpportunity.set(appt.opportunity_id, appt.status);
  }
  const earliestFollowUpIdByOpportunity = new Map<string, string>();
  for (const followUp of pendingFollowUps ?? []) {
    if (followUp.opportunity_id && !earliestFollowUpIdByOpportunity.has(followUp.opportunity_id)) {
      earliestFollowUpIdByOpportunity.set(followUp.opportunity_id, followUp.id);
    }
  }

  return (scores ?? [])
    .map((raw): MyOpportunityRow | null => {
      const score = raw as CrmOpportunityScoreRow & { crm_opportunities: CrmOpportunityRow | null };
      const opp = score.crm_opportunities;
      if (!opp) return null;
      const noteHistory = notesByOpportunity.get(opp.id) ?? [];
      const lastNote = noteHistory.length > 0 ? noteHistory[noteHistory.length - 1] : null;
      const signals = score.signals as { last_call_at?: string | null; last_email_activity_at?: string | null };
      return {
        score,
        businessName: opp.business_name,
        contactName: opp.contact_name,
        phone: opp.phone,
        email: opp.email,
        stageOrStatus: opp.stage,
        assignedAgentName: agentDisplayName,
        nextFollowUpAt: opp.next_follow_up_at,
        lastCallAt: signals.last_call_at ?? null,
        lastEmailAt: signals.last_email_activity_at ?? null,
        lastNote: lastNote?.notes ?? null,
        notes: noteHistory.slice(-2).reverse().map((n) => n.notes),
        lastCallOutcome: lastCallOutcomeByOpportunity.get(opp.id) ?? null,
        appointmentStatus: appointmentStatusByOpportunity.get(opp.id) ?? null,
        followUpId: earliestFollowUpIdByOpportunity.get(opp.id) ?? null,
        detailHref: `/agent/opportunities/${opp.id}`,
      };
    })
    .filter((r): r is MyOpportunityRow => r !== null);
}
