import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isHiddenLeadgenCampaignName, type LeadgenLeadRow } from "@/lib/leadgen-types";
import type { LeadgenOpportunityScoreRow } from "@/lib/opportunity-finder";
import LeadgenOpportunityFinderClient, { type LeadgenOpportunityFinderRow } from "./LeadgenOpportunityFinderClient";
import { addBoardLeadNoteAction } from "./actions";
import { completeFollowUpAction, scheduleFollowUpAction } from "../leads/[id]/actions";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export default async function LeadgenAdminOpportunityFinderPage({
  searchParams,
}: {
  // view=board is set by the dashboard's Opportunity Pipeline summary
  // card's "View Board" button.
  searchParams: Promise<{ category?: string; agent?: string; client?: string; followup?: string; industry?: string; view?: string }>;
}) {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const { category, agent, client, followup, industry, view } = await searchParams;

  const [{ data: scores }, { data: leads }, { data: agents }, { data: clients }, { data: campaigns }, { data: activities }, { data: appointments }, { data: pendingFollowUps }] = await Promise.all([
    admin.from("leadgen_opportunity_scores").select("*").order("score", { ascending: false }),
    admin.from("leadgen_leads").select("*"),
    admin.from("leadgen_users").select("id, full_name, email").eq("role", "agent").eq("active", true).neq("email", DEACTIVATED_TEST_AGENT_EMAIL).order("full_name"),
    admin.from("leadgen_clients").select("id, name").order("name"),
    admin.from("leadgen_campaigns").select("id, name, client_id").order("name"),
    admin
      .from("leadgen_lead_activities")
      .select("lead_id, activity_type, notes, occurred_at, call_outcome")
      .order("occurred_at", { ascending: true }),
    // Board View's "Appointment Status" - most recent appointment per
    // lead, oldest-first so the reduce below keeps the latest one (same
    // pattern the Leads page already uses for its own Appointment Status
    // column).
    admin.from("leadgen_appointments").select("lead_id, status, created_at").order("created_at", { ascending: true }),
    // "Mark Complete" quick action needs the specific pending callback to
    // complete - the earliest one per lead.
    admin.from("leadgen_followups").select("id, lead_id, scheduled_at").eq("status", "pending").order("scheduled_at", { ascending: true }),
  ]);

  const leadById = new Map((leads ?? []).map((l) => [l.id, l as LeadgenLeadRow]));
  const agentById = new Map((agents ?? []).map((a) => [a.id, a]));
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));
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
  const earliestFollowUpIdByLead = new Map<string, string>();
  for (const followUp of pendingFollowUps ?? []) {
    if (followUp.lead_id && !earliestFollowUpIdByLead.has(followUp.lead_id)) {
      earliestFollowUpIdByLead.set(followUp.lead_id, followUp.id);
    }
  }
  const industries = Array.from(new Set((leads ?? []).map((l) => l.industry).filter((v): v is string => !!v))).sort();

  const rows: LeadgenOpportunityFinderRow[] = (scores ?? [])
    .map((s): LeadgenOpportunityFinderRow | null => {
      const score = s as LeadgenOpportunityScoreRow;
      const lead = leadById.get(score.lead_id);
      if (!lead) return null;
      const noteHistory = notesByLead.get(score.lead_id) ?? [];
      const lastNote = noteHistory.length > 0 ? noteHistory[noteHistory.length - 1] : null;
      const agentRow = lead.assigned_agent_id ? agentById.get(lead.assigned_agent_id) ?? null : null;
      const signals = score.signals as { last_call_at?: string | null; last_email_activity_at?: string | null };
      const clientName = clientById.get(lead.client_id)?.name ?? null;
      return {
        score,
        businessName: lead.business_name,
        contactName: lead.contact_name,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        assignedAgentId: lead.assigned_agent_id,
        assignedAgentName: agentRow?.full_name || agentRow?.email || null,
        clientId: lead.client_id,
        clientName,
        clientOrBusiness: clientName || lead.business_name,
        campaignId: lead.campaign_id,
        campaignName: lead.campaign_id ? campaignById.get(lead.campaign_id)?.name ?? null : null,
        industry: lead.industry ?? null,
        nextFollowUpAt: lead.next_follow_up_at,
        lastCallAt: signals.last_call_at ?? null,
        lastEmailAt: signals.last_email_activity_at ?? null,
        lastNote: lastNote?.notes ?? null,
        notes: noteHistory.slice(-2).reverse().map((n) => n.notes),
        lastCallOutcome: lastCallOutcomeByLead.get(lead.id) ?? null,
        appointmentStatus: appointmentStatusByLead.get(lead.id) ?? null,
        followUpId: earliestFollowUpIdByLead.get(lead.id) ?? null,
        detailHref: `/leadgen/admin/leads/${lead.id}`,
      };
    })
    .filter((r): r is LeadgenOpportunityFinderRow => r !== null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Opportunity Finder</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every lead already in the CRM, scored 0-100 from real calls, emails, notes, follow-ups, and appointments on file.
          </p>
        </div>
        <Link href="/leadgen/admin" className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-400">
          ← Back to Dashboard
        </Link>
      </div>

      <LeadgenOpportunityFinderClient
        rows={rows}
        agents={(agents ?? []).map((a) => ({ id: a.id, name: a.full_name || a.email }))}
        clients={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))}
        campaigns={(campaigns ?? []).filter((c) => !isHiddenLeadgenCampaignName(c.name)).map((c) => ({ id: c.id, name: c.name, clientId: c.client_id }))}
        industries={industries}
        initialCategory={category}
        initialAgentFilter={agent}
        initialClientFilter={client}
        initialFollowUpFilter={followup}
        initialIndustryFilter={industry}
        initialView={view === "board" ? "board" : "list"}
        onAddNote={addBoardLeadNoteAction}
        onScheduleCallback={scheduleFollowUpAction}
        onCompleteFollowUp={completeFollowUpAction}
      />
    </div>
  );
}
