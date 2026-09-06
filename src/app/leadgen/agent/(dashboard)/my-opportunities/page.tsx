import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenLeadRow } from "@/lib/leadgen-types";
import type { LeadgenOpportunityScoreRow } from "@/lib/opportunity-finder";
import LeadgenMyOpportunitiesClient, { type LeadgenMyOpportunityRow } from "./LeadgenMyOpportunitiesClient";
import { addBoardLeadNoteAction } from "./actions";

export default async function LeadgenAgentMyOpportunitiesPage({
  searchParams,
}: {
  // view=board is set by the agent dashboard's Opportunity Pipeline
  // summary card's "View Board" button.
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  // RLS (leadgen_opportunity_scores_agent_select_own, migration 0113)
  // already restricts this to leads assigned to this agent.
  const [{ data: scores }, { data: activities }, { data: appointments }, { data: clients }] = await Promise.all([
    supabase.from("leadgen_opportunity_scores").select("*, leadgen_leads(*)").order("score", { ascending: false }),
    supabase
      .from("leadgen_lead_activities")
      .select("lead_id, activity_type, notes, occurred_at, call_outcome")
      .order("occurred_at", { ascending: true }),
    // Board View's "Appointment Status" - RLS already scopes this to the
    // signed-in agent's own leads' appointments.
    supabase.from("leadgen_appointments").select("lead_id, status, created_at").order("created_at", { ascending: true }),
    // Board View's "Client / Current Business" - agents can already read
    // every client's name (see leads/new/page.tsx); only their own leads
    // are actually RLS-scoped.
    supabase.from("leadgen_clients").select("id, name"),
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

  const agentDisplayName = agent.full_name || agent.email;
  const rows: LeadgenMyOpportunityRow[] = (scores ?? [])
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
      <LeadgenMyOpportunitiesClient rows={rows} initialView={view === "board" ? "board" : "list"} onAddNote={addBoardLeadNoteAction} />
    </div>
  );
}
