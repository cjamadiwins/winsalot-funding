import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenLeadRow } from "@/lib/leadgen-types";
import type { LeadgenOpportunityScoreRow } from "@/lib/opportunity-finder";
import LeadgenMyOpportunitiesClient, { type LeadgenMyOpportunityRow } from "./LeadgenMyOpportunitiesClient";

export default async function LeadgenAgentMyOpportunitiesPage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  // RLS (leadgen_opportunity_scores_agent_select_own, migration 0113)
  // already restricts this to leads assigned to this agent.
  const [{ data: scores }, { data: notes }] = await Promise.all([
    supabase.from("leadgen_opportunity_scores").select("*, leadgen_leads(*)").order("score", { ascending: false }),
    supabase
      .from("leadgen_lead_activities")
      .select("lead_id, notes, occurred_at")
      .not("notes", "is", null)
      .order("occurred_at", { ascending: true }),
  ]);

  const lastNoteByLead = new Map<string, { notes: string; occurred_at: string }>();
  for (const row of notes ?? []) {
    if (row.lead_id && row.notes) lastNoteByLead.set(row.lead_id, { notes: row.notes, occurred_at: row.occurred_at });
  }

  const rows: LeadgenMyOpportunityRow[] = (scores ?? [])
    .map((raw): LeadgenMyOpportunityRow | null => {
      const score = raw as LeadgenOpportunityScoreRow & { leadgen_leads: LeadgenLeadRow | null };
      const lead = score.leadgen_leads;
      if (!lead) return null;
      const lastNote = lastNoteByLead.get(score.lead_id) ?? null;
      const signals = score.signals as { last_call_at?: string | null; last_email_activity_at?: string | null };
      return {
        score,
        businessName: lead.business_name,
        contactName: lead.contact_name,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        nextFollowUpAt: lead.next_follow_up_at,
        lastCallAt: signals.last_call_at ?? null,
        lastEmailAt: signals.last_email_activity_at ?? null,
        lastNote: lastNote?.notes ?? null,
        detailHref: `/leadgen/agent/leads/${lead.id}`,
      };
    })
    .filter((r): r is LeadgenMyOpportunityRow => r !== null);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Opportunities</h1>
        <p className="mt-1 text-sm text-slate-500">
          {agent.full_name || agent.email}, here are your leads ranked by score, with why the CRM flagged each one and what to do next.
        </p>
      </div>
      <LeadgenMyOpportunitiesClient rows={rows} />
    </div>
  );
}
