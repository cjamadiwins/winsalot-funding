import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  computeLeadgenAgentPerformance,
  leadgenCreditedAppointmentsInWeek,
  leadgenDateKey,
  leadgenMondayOf,
  addDays,
  LEADGEN_WEEKLY_APPOINTMENT_TARGET,
  type LeadgenPerformanceAppointment,
} from "@/lib/leadgen-performance";
import { computeLeadgenAgentActivityKpis } from "@/lib/leadgen-agent-kpi";
import {
  buildCallLogCardRecords,
  buildEmailCardRecords,
  buildFollowUpCompletedCardRecords,
  filterEmailsSentThisWeek,
  filterEmailsSentToday,
  filterFollowUpsCompletedThisWeek,
  filterRecordsThisWeek,
  filterRecordsToday,
  sortCallLogsMostRecentFirst,
  sortEmailsMostRecentFirst,
  sortFollowUpsCompletedMostRecentFirst,
  type CallLogCardSource,
  type EmailCardSource,
  type FollowUpCompletedCardSource,
} from "@/lib/leadgen-activity-records";
import {
  buildAppointmentCardRecords,
  buildLeadCardRecords,
  latestLeadgenEmailByLeadId,
  sortAppointmentsUpcomingFirst,
  type AppointmentCardSource,
} from "@/lib/leadgen-dashboard-records";
import type { LeadgenOpportunityScoreRow } from "@/lib/opportunity-finder";
import type { LeadgenLeadRow } from "@/lib/leadgen-types";
import AgentPerformanceCard from "@/components/leadgen/AgentPerformanceCard";
import AgentActivityKpiSection from "@/components/leadgen/AgentActivityKpiSection";
import { addBoardLeadNoteAction } from "../my-opportunities/actions";
import { completeFollowUpAction, scheduleFollowUpAction } from "../leads/[id]/actions";

// See the admin Performance page's identical alias for why.
type AppointmentSourceRow = LeadgenPerformanceAppointment & AppointmentCardSource;

// Agent's own view of the Agent Performance Report - just their own
// card. Reads through the session-scoped client, so RLS
// (leadgen_appointments_agent_select_own etc.) is what actually keeps this to
// records this agent is allowed to see; the admin's equivalent page
// (/leadgen/admin/performance) shows every agent.
export default async function LeadgenAgentPerformancePage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const [
    { data: appointments },
    { data: callLogs },
    { data: emails },
    { data: completedFollowUps },
    { data: pendingFollowUps },
    { data: leads },
    { data: clients },
    { data: opportunityScores },
  ] = await Promise.all([
    supabase
      .from("leadgen_appointments")
      .select(
        "id, lead_id, business_name, contact_name, phone, email, appointment_date, appointment_time, timezone, meeting_type, appointment_notes, status, created_at, booking_agent_id, assigned_specialist_id"
      )
      .order("appointment_date", { ascending: false }),
    // Calls KPI + "Calls Today/This Week" drill-down source of truth - RLS
    // (leadgen_call_logs_agent_select_own) already scopes this to the
    // signed-in agent's own rows.
    supabase.from("leadgen_call_logs").select("id, agent_id, created_at, business_name, phone, outcome, notes, client_id").eq("agent_id", agent.id),
    // Emails Today/This Week/Delivered/Bounced/Failed drill-down source of
    // truth - the existing Resend-backed email log, filtered to emails this
    // agent actually sent.
    supabase
      .from("leadgen_emails")
      .select(
        "id, created_at, client_id, campaign_id, lead_id, to_email, to_name, subject, sender_email, sent_by, status, sent_at, delivered_at, delayed_at, bounced_at, bounce_reason, complained_at, opened_at, clicked_at, failed_at, failure_reason"
      )
      .eq("sent_by", agent.id),
    supabase.from("leadgen_followups").select("id, lead_id, agent_id, status, completed_at, note").eq("agent_id", agent.id).eq("status", "completed"),
    supabase.from("leadgen_followups").select("id, lead_id, status, scheduled_at").eq("agent_id", agent.id).eq("status", "pending").order("scheduled_at", { ascending: true }),
    supabase
      .from("leadgen_leads")
      .select("id, business_name, contact_name, phone, email, status, assigned_agent_id, last_contacted_at, next_follow_up_at, notes"),
    supabase.from("leadgen_clients").select("id, name"),
    supabase.from("leadgen_opportunity_scores").select("*"),
  ]);

  const allAppointments = (appointments ?? []) as AppointmentSourceRow[];
  const myCallLogs = (callLogs ?? []) as CallLogCardSource[];
  const myEmails = (emails ?? []) as EmailCardSource[];
  const myCompletedFollowUps = (completedFollowUps ?? []) as FollowUpCompletedCardSource[];
  const allLeads = (leads ?? []) as Pick<
    LeadgenLeadRow,
    "id" | "business_name" | "contact_name" | "phone" | "email" | "status" | "assigned_agent_id" | "last_contacted_at" | "next_follow_up_at" | "notes"
  >[];
  const allClients = (clients ?? []) as { id: string; name: string }[];
  const clientNameById = new Map(allClients.map((client) => [client.id, client.name] as const));
  const agentNameById = new Map([[agent.id, agent.full_name || agent.email]]);

  const now = new Date();
  const todayKey = leadgenDateKey(now);
  const currentWeekStart = leadgenMondayOf(todayKey);
  const currentWeekEnd = addDays(currentWeekStart, 4);

  const performance = computeLeadgenAgentPerformance(allAppointments, agent.id);
  const activityKpis = computeLeadgenAgentActivityKpis(myCallLogs, myEmails, myCompletedFollowUps, agent.id);

  const enrichedCallLogs = sortCallLogsMostRecentFirst(buildCallLogCardRecords(myCallLogs, agentNameById, clientNameById));
  const businessNameByLeadId = new Map(allLeads.map((lead) => [lead.id, lead.business_name] as const));
  const latestEmailByLeadId = latestLeadgenEmailByLeadId(myEmails.filter((e): e is EmailCardSource & { lead_id: string } => e.lead_id !== null));
  const sentEmails = myEmails.filter((e) => e.sent_by && e.sent_at);
  const enrichedEmails = sortEmailsMostRecentFirst(buildEmailCardRecords(sentEmails, agentNameById, clientNameById, businessNameByLeadId));
  const enrichedCompletedFollowUps = sortFollowUpsCompletedMostRecentFirst(
    buildFollowUpCompletedCardRecords(myCompletedFollowUps, agentNameById, businessNameByLeadId)
  );
  const scoredLeads = (opportunityScores ?? []) as LeadgenOpportunityScoreRow[];
  const enrichedLeads = buildLeadCardRecords(allLeads, { scores: scoredLeads, followUps: pendingFollowUps ?? [], agentNameById, latestEmailByLeadId });
  const interestedLeadRecords = enrichedLeads.filter((lead) => lead.status === "Interested");
  const appointmentsBookedRecords = sortAppointmentsUpcomingFirst(
    buildAppointmentCardRecords(leadgenCreditedAppointmentsInWeek(allAppointments, agent.id, currentWeekStart, currentWeekEnd), agentNameById)
  );
  const emailsThisWeek = filterEmailsSentThisWeek(enrichedEmails, now);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Performance</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your weekly (Monday-Friday) booked-appointment performance against a target of 4, reset every Monday. Cancelled
        and duplicate (replaced) appointments never count.
      </p>

      <div className="mt-6">
        <AgentActivityKpiSection
          kpis={activityKpis}
          interestedLeadRecords={interestedLeadRecords}
          appointmentsBookedRecords={appointmentsBookedRecords}
          appointmentsWeeklyTarget={LEADGEN_WEEKLY_APPOINTMENT_TARGET}
          callsTodayRecords={filterRecordsToday(enrichedCallLogs, now)}
          callsThisWeekRecords={filterRecordsThisWeek(enrichedCallLogs, now)}
          emailsTodayRecords={filterEmailsSentToday(enrichedEmails, now)}
          emailsThisWeekRecords={emailsThisWeek}
          deliveredThisWeekRecords={emailsThisWeek.filter((e) => e.delivered_at)}
          bouncedThisWeekRecords={emailsThisWeek.filter((e) => e.bounced_at)}
          failedThisWeekRecords={emailsThisWeek.filter((e) => e.failed_at)}
          followUpsCompletedRecords={filterFollowUpsCompletedThisWeek(enrichedCompletedFollowUps, now)}
          callLogHref="/leadgen/agent/call-log"
          emailsHref="/leadgen/agent/emails"
          leadHrefBase="/leadgen/agent/leads"
          appointmentsHref="/leadgen/agent/appointments"
          onAddNote={addBoardLeadNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onScheduleFollowUp={scheduleFollowUpAction}
        />
      </div>

      <div className="mt-6">
        <AgentPerformanceCard agentName={agent.full_name || agent.email} performance={performance} leadHrefBase="/leadgen/agent/leads" />
      </div>
    </div>
  );
}
