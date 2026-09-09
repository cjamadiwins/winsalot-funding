import Link from "next/link";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { OPPORTUNITY_TYPE_LABELS, type CrmOpportunityRow, type CrmUserRow } from "@/lib/crm-types";
import type { CrmOpportunityScoreRow } from "@/lib/opportunity-finder";
import OpportunityFinderClient, { type OpportunityFinderRow } from "./OpportunityFinderClient";
import { addBoardOpportunityNoteAction } from "./actions";
import { completeFollowUpAction, scheduleFollowUpAction } from "../followup-actions";

export default async function AdminOpportunityFinderPage({
  searchParams,
}: {
  // Set by the CRM dashboard's clickable KPI cards (see /admin/crm/page.tsx)
  // to land here pre-filtered - view=board is set by the dashboard's
  // Opportunity Pipeline summary card's "View Board" button.
  searchParams: Promise<{ category?: string; agent?: string; client?: string; followup?: string; industry?: string; view?: string }>;
}) {
  await requireCrmAdmin();
  const admin = getSupabaseAdmin();
  const { category, agent, client, followup, industry, view } = await searchParams;

  const [{ data: scores }, { data: opportunities }, { data: agents }, { data: activities }, { data: agreements }, { data: clients }, { data: appointments }, { data: pendingFollowUps }] =
    await Promise.all([
      admin.from("crm_opportunity_scores").select("*").order("score", { ascending: false }),
      admin.from("crm_opportunities").select("*"),
      admin.from("crm_users").select("id, full_name, email, role, active, scheduled_start_time").eq("role", "agent").eq("active", true).order("full_name"),
      // Every opportunity-linked activity, oldest-first so the reduce below
      // keeps the latest note(s) and the latest call's own outcome text -
      // same source of truth List View's "Last Note" column already reads,
      // just also read here for Board View's card/detail panel.
      admin
        .from("crm_activities")
        .select("opportunity_id, activity_type, notes, occurred_at")
        .not("opportunity_id", "is", null)
        .order("occurred_at", { ascending: true }),
      // Growth CRM has no client_id/campaign_id on crm_opportunities itself
      // (it's Winsalot's own sales pipeline, not a client-owned lead list like
      // the Lead Gen CRM). An opportunity only ever links to a real
      // crm_clients row once onboarding actually started from it (migration
      // 0097) - newest-first so the map below keeps the latest agreement's
      // client when more than one exists.
      admin
        .from("crm_client_agreements")
        .select("opportunity_id, client_id")
        .not("opportunity_id", "is", null)
        .order("created_at", { ascending: false }),
      admin.from("crm_clients").select("id, company_name").order("company_name"),
      // Board View's "Appointment Status" - most recent consultation
      // appointment per opportunity, oldest-first so the reduce below
      // keeps the latest one (same pattern as the Lead Gen CRM's leads
      // list page's own most-recent-appointment lookup).
      admin.from("winsalot_appointments").select("opportunity_id, status, created_at").not("opportunity_id", "is", null).order("created_at", { ascending: true }),
      // "Mark Complete" quick action needs the specific pending callback to
      // complete - the earliest one per opportunity, same row the Overdue
      // panel's own "Completed" button already targets (migration 0011).
      admin.from("crm_followups").select("id, opportunity_id, scheduled_at").eq("status", "pending").order("scheduled_at", { ascending: true }),
    ]);

  const opportunityById = new Map((opportunities ?? []).map((o) => [o.id, o as CrmOpportunityRow]));
  const agentById = new Map((agents ?? []).map((a) => [a.id, a as CrmUserRow]));
  const notesByOpportunity = new Map<string, { notes: string; occurred_at: string }[]>();
  const lastCallOutcomeByOpportunity = new Map<string, string | null>();
  for (const row of activities ?? []) {
    if (!row.opportunity_id) continue;
    if (row.notes) {
      const list = notesByOpportunity.get(row.opportunity_id) ?? [];
      list.push({ notes: row.notes, occurred_at: row.occurred_at });
      notesByOpportunity.set(row.opportunity_id, list);
    }
    if (row.activity_type === "call") {
      lastCallOutcomeByOpportunity.set(row.opportunity_id, row.notes ?? null);
    }
  }
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
  const clientIdByOpportunity = new Map<string, string>();
  for (const row of agreements ?? []) {
    if (row.opportunity_id && !clientIdByOpportunity.has(row.opportunity_id)) {
      clientIdByOpportunity.set(row.opportunity_id, row.client_id);
    }
  }
  const appointmentStatusByOpportunity = new Map<string, string>();
  for (const appt of appointments ?? []) {
    if (appt.opportunity_id) appointmentStatusByOpportunity.set(appt.opportunity_id, appt.status);
  }
  // Earliest pending callback per opportunity - pendingFollowUps is already
  // ordered ascending by scheduled_at, so the first one seen per
  // opportunity is the earliest.
  const earliestFollowUpIdByOpportunity = new Map<string, string>();
  for (const followUp of pendingFollowUps ?? []) {
    if (followUp.opportunity_id && !earliestFollowUpIdByOpportunity.has(followUp.opportunity_id)) {
      earliestFollowUpIdByOpportunity.set(followUp.opportunity_id, followUp.id);
    }
  }
  const industries = Array.from(new Set((opportunities ?? []).map((o) => o.industry).filter((v): v is string => !!v))).sort();

  const rows: OpportunityFinderRow[] = (scores ?? [])
    .map((s): OpportunityFinderRow | null => {
      const score = s as CrmOpportunityScoreRow;
      const opp = opportunityById.get(score.opportunity_id);
      if (!opp) return null;
      const noteHistory = notesByOpportunity.get(score.opportunity_id) ?? [];
      const lastNote = noteHistory.length > 0 ? noteHistory[noteHistory.length - 1] : null;
      const agentRow = opp.assigned_agent_id ? agentById.get(opp.assigned_agent_id) ?? null : null;
      const signals = score.signals as { last_call_at?: string | null; last_email_activity_at?: string | null };
      const clientId = clientIdByOpportunity.get(opp.id) ?? null;
      const clientName = clientId ? clientById.get(clientId)?.company_name ?? null : null;
      return {
        score,
        businessName: opp.business_name,
        contactName: opp.contact_name,
        phone: opp.phone,
        email: opp.email,
        stageOrStatus: opp.stage,
        assignedAgentId: opp.assigned_agent_id,
        assignedAgentName: agentRow?.full_name || agentRow?.email || null,
        clientId,
        clientName,
        clientOrBusiness: clientName || opp.business_name,
        campaignType: opp.opportunity_type,
        campaignName: OPPORTUNITY_TYPE_LABELS[opp.opportunity_type],
        industry: opp.industry ?? null,
        nextFollowUpAt: opp.next_follow_up_at,
        lastContactedAt: opp.last_contacted_at,
        lastCallAt: signals.last_call_at ?? null,
        lastEmailAt: signals.last_email_activity_at ?? null,
        lastNote: lastNote?.notes ?? null,
        lastNoteAt: lastNote?.occurred_at ?? null,
        notes: noteHistory.slice(-2).reverse().map((n) => n.notes),
        lastCallOutcome: lastCallOutcomeByOpportunity.get(opp.id) ?? null,
        appointmentStatus: appointmentStatusByOpportunity.get(opp.id) ?? null,
        followUpId: earliestFollowUpIdByOpportunity.get(opp.id) ?? null,
        detailHref: `/admin/crm/opportunities/${opp.id}`,
      };
    })
    .filter((r): r is OpportunityFinderRow => r !== null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Opportunity Finder</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every opportunity already in the CRM, scored 0-100 from real calls, emails, notes, follow-ups, and appointments on file.
          </p>
        </div>
        <Link href="/admin/crm" className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-400">
          ← Back to Dashboard
        </Link>
      </div>

      <OpportunityFinderClient
        rows={rows}
        agents={(agents ?? []).map((a) => ({ id: a.id, name: a.full_name || a.email }))}
        clients={(clients ?? []).map((c) => ({ id: c.id, name: c.company_name }))}
        industries={industries}
        initialCategory={category}
        initialAgentFilter={agent}
        initialClientFilter={client}
        initialFollowUpFilter={followup}
        initialIndustryFilter={industry}
        initialView={view === "board" ? "board" : "list"}
        onAddNote={addBoardOpportunityNoteAction}
        onScheduleCallback={scheduleFollowUpAction}
        onCompleteFollowUp={completeFollowUpAction}
      />
    </div>
  );
}
