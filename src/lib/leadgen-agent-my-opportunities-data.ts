import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadgenLeadRow } from "@/lib/leadgen-types";
import type { LeadgenOpportunityScoreRow } from "@/lib/opportunity-finder";
import type { LeadgenMyOpportunityRow } from "@/app/leadgen/agent/(dashboard)/my-opportunities/LeadgenMyOpportunitiesClient";

// Lead Gen CRM agent's own scored leads (My Opportunities) - RLS
// (leadgen_opportunity_scores_agent_select_own, migration 0113) already
// restricts this to leads assigned to the signed-in agent. Shared by the
// standalone /leadgen/agent/my-opportunities page and the agent
// dashboard's Opportunity Finder modal so both read the exact same query.
export async function loadLeadgenAgentMyOpportunities(supabase: SupabaseClient, agentDisplayName: string): Promise<LeadgenMyOpportunityRow[]> {
  const [{ data: scores }, { data: activities }, { data: appointments }, { data: clients }, { data: pendingFollowUps }] = await Promise.all([
    supabase.from("leadgen_opportunity_scores").select("*, leadgen_leads(*)").order("score", { ascending: false }),
    supabase
      .from("leadgen_lead_activities")
      .select("lead_id, activity_type, notes, occurred_at, call_outcome")
      .order("occurred_at", { ascending: true }),
    supabase.from("leadgen_appointments").select("lead_id, status, created_at").order("created_at", { ascending: true }),
    supabase.from("leadgen_clients").select("id, name"),
    supabase.from("leadgen_followups").select("id, lead_id, scheduled_at").eq("status", "pending").order("scheduled_at", { ascending: true }),
  ]);

  const notesByLead = new Map<string, { notes: string; occurred_at: string }[]>();
  const lastCallOutcomeByLead = new Map<string, string | null>();
  for (const row of activities ?? []) {
    if (!row.lead_id) continue;
    if (row.notes) {
      const list = notesByLead.get(row.lead_id) ?? [];
      list.push({ notes: row.notes, occurred_at: row.occurred_at });
      notesByLead.set(row.lead_id, list);
    }
    if (row.activity_type === "call") lastCallOutcomeByLead.set(row.lead_id, row.call_outcome ?? null);
  }
  const appointmentStatusByLead = new Map<string, string>();
  for (const appt of appointments ?? []) {
    if (appt.lead_id) appointmentStatusByLead.set(appt.lead_id, appt.status);
  }
  const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.name] as const));
  const earliestFollowUpIdByLead = new Map<string, string>();
  for (const followUp of pendingFollowUps ?? []) {
    if (followUp.lead_id && !earliestFollowUpIdByLead.has(followUp.lead_id)) {
      earliestFollowUpIdByLead.set(followUp.lead_id, followUp.id);
    }
  }

  return (scores ?? [])
    .map((raw): LeadgenMyOpportunityRow | null => {
      const score = raw as LeadgenOpportunityScoreRow & { leadgen_leads: LeadgenLeadRow | null };
      const lead = score.leadgen_leads;
      if (!lead) return null;
      const noteHistory = notesByLead.get(score.lead_id) ?? [];
      const lastNote = noteHistory.length > 0 ? noteHistory[noteHistory.length - 1] : null;
      const signals = score.signals as { last_call_at?: string | null; last_email_activity_at?: string | null };
      const clientName = clientNameById.get(lead.client_id) ?? null;
      return {
        score,
        businessName: lead.business_name,
        contactName: lead.contact_name,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        assignedAgentName: agentDisplayName,
        clientOrBusiness: clientName || lead.business_name,
        nextFollowUpAt: lead.next_follow_up_at,
        lastCallAt: signals.last_call_at ?? null,
        lastEmailAt: signals.last_email_activity_at ?? null,
        lastNote: lastNote?.notes ?? null,
        notes: noteHistory.slice(-2).reverse().map((n) => n.notes),
        lastCallOutcome: lastCallOutcomeByLead.get(lead.id) ?? null,
        appointmentStatus: appointmentStatusByLead.get(lead.id) ?? null,
        followUpId: earliestFollowUpIdByLead.get(lead.id) ?? null,
        detailHref: `/leadgen/agent/leads/${lead.id}`,
      };
    })
    .filter((r): r is LeadgenMyOpportunityRow => r !== null);
}
