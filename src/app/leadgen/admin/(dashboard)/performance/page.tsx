import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  computeLeadgenAgentPerformance,
  leadgenCreditedAppointmentsInWeek,
  leadgenDateKey,
  leadgenMondayOf,
  addDays,
  LEADGEN_WEEKLY_APPOINTMENT_TARGET,
  type LeadgenPerformanceAppointment,
} from "@/lib/leadgen-performance";
import { syncLeadgenWeeklyPerformanceHistory } from "@/lib/leadgen-performance-history-sync";
import type { LeadgenWeeklyHistoryRow } from "@/lib/leadgen-performance-history";
import type { LeadgenUserRow, LeadgenLeadRow } from "@/lib/leadgen-types";
import { computeLeadgenAgentActivityKpis, computeLeadgenTeamActivityKpis } from "@/lib/leadgen-agent-kpi";
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

// A superset of both LeadgenPerformanceAppointment (what
// computeLeadgenAgentPerformance/leadgenCreditedAppointmentsInWeek need) and
// AppointmentCardSource (what buildAppointmentCardRecords needs) - this
// page's own leadgen_appointments select already covers every column both
// require, so one row shape serves both instead of two separate queries.
type AppointmentSourceRow = LeadgenPerformanceAppointment & AppointmentCardSource;
import type { LeadgenOpportunityScoreRow } from "@/lib/opportunity-finder";
import AgentPerformanceCard from "@/components/leadgen/AgentPerformanceCard";
import AgentActivityKpiSection from "@/components/leadgen/AgentActivityKpiSection";
import TeamActivityKpiSection from "@/components/leadgen/TeamActivityKpiSection";
import MonthlyPerformanceSection from "@/components/leadgen/MonthlyPerformanceSection";
import { addBoardLeadNoteAction } from "../opportunity-finder/actions";
import { completeFollowUpAction, scheduleFollowUpAction } from "../leads/[id]/actions";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

// Admin view of the Agent Performance Report - every active agent, each
// with their own weekly-target card (see AgentPerformanceCard). Agents
// only ever see their own card - /leadgen/agent/performance. Below the
// unchanged weekly cards, MonthlyPerformanceSection adds the Monthly
// Performance history view, reading the permanent weekly ledger this
// page keeps in sync (see leadgen-performance-history-sync.ts).
export default async function LeadgenAdminPerformancePage() {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();

  const [
    { data: agents },
    { data: appointments },
    { data: callLogs },
    { data: emails },
    { data: completedFollowUps },
    { data: pendingFollowUps },
    { data: leads },
    { data: clients },
    { data: opportunityScores },
  ] = await Promise.all([
    admin
      .from("leadgen_users")
      .select("id, full_name, email")
      .eq("role", "agent")
      .eq("active", true)
      .neq("email", DEACTIVATED_TEST_AGENT_EMAIL)
      .order("full_name"),
    admin
      .from("leadgen_appointments")
      .select(
        "id, lead_id, business_name, contact_name, phone, email, appointment_date, appointment_time, timezone, meeting_type, appointment_notes, status, created_at, booking_agent_id, assigned_specialist_id"
      )
      .order("appointment_date", { ascending: false }),
    // Calls KPI + "Calls Today/This Week" drill-down source of truth - see
    // leadgen-agent-kpi.ts's header comment for why this reuses the
    // existing Call Log table rather than a new manual counter.
    admin.from("leadgen_call_logs").select("id, agent_id, created_at, business_name, phone, outcome, notes, client_id"),
    // Emails KPI + Emails Today/This Week/Delivered/Bounced/Failed
    // drill-down source of truth - one broad read, filtered/derived
    // multiple ways below (sent-only for the KPI counts, any-lead for the
    // "latest email activity" enrichment) rather than two separate queries
    // against the same table.
    admin
      .from("leadgen_emails")
      .select(
        "id, created_at, client_id, campaign_id, lead_id, to_email, to_name, subject, sender_email, sent_by, status, sent_at, delivered_at, delayed_at, bounced_at, bounce_reason, complained_at, opened_at, clicked_at, failed_at, failure_reason"
      ),
    admin.from("leadgen_followups").select("id, lead_id, agent_id, status, completed_at, note").eq("status", "completed"),
    admin.from("leadgen_followups").select("id, lead_id, status, scheduled_at").eq("status", "pending").order("scheduled_at", { ascending: true }),
    admin
      .from("leadgen_leads")
      .select("id, business_name, contact_name, phone, email, status, assigned_agent_id, last_contacted_at, next_follow_up_at, notes"),
    admin.from("leadgen_clients").select("id, name"),
    admin.from("leadgen_opportunity_scores").select("*"),
  ]);

  const allAgents = (agents ?? []) as Pick<LeadgenUserRow, "id" | "full_name" | "email">[];
  const allAppointments = (appointments ?? []) as AppointmentSourceRow[];
  const allCallLogs = (callLogs ?? []) as CallLogCardSource[];
  const allEmails = (emails ?? []) as EmailCardSource[];
  const allCompletedFollowUps = (completedFollowUps ?? []) as FollowUpCompletedCardSource[];
  const allLeads = (leads ?? []) as Pick<
    LeadgenLeadRow,
    "id" | "business_name" | "contact_name" | "phone" | "email" | "status" | "assigned_agent_id" | "last_contacted_at" | "next_follow_up_at" | "notes"
  >[];
  const allClients = (clients ?? []) as { id: string; name: string }[];
  const clientNameById = new Map(allClients.map((client) => [client.id, client.name] as const));
  const agentNameById = new Map(allAgents.map((agent) => [agent.id, agent.full_name] as const));

  const now = new Date();
  const todayKey = leadgenDateKey(now);
  const currentWeekStart = leadgenMondayOf(todayKey);
  const currentWeekEnd = addDays(currentWeekStart, 4);

  // Same "enrich once, derive every card's count AND its modal's rows from
  // that one array" convention as leadgen-dashboard-records.ts - see this
  // page's per-agent and team-wide record slices below.
  const enrichedCallLogs = sortCallLogsMostRecentFirst(buildCallLogCardRecords(allCallLogs, agentNameById, clientNameById));
  const latestEmailByLeadId = latestLeadgenEmailByLeadId(allEmails.filter((e): e is EmailCardSource & { lead_id: string } => e.lead_id !== null));
  const businessNameByLeadId = new Map(allLeads.map((lead) => [lead.id, lead.business_name] as const));
  // Only emails an agent actually sent count toward Emails Today/This
  // Week/Delivered/Bounced/Failed - a draft/never-sent row (sent_at still
  // null) is excluded, same rule computeLeadgenAgentActivityKpis uses.
  const sentEmails = allEmails.filter((e) => e.sent_by && e.sent_at);
  const enrichedEmails = sortEmailsMostRecentFirst(buildEmailCardRecords(sentEmails, agentNameById, clientNameById, businessNameByLeadId));
  const enrichedCompletedFollowUps = sortFollowUpsCompletedMostRecentFirst(
    buildFollowUpCompletedCardRecords(allCompletedFollowUps, agentNameById, businessNameByLeadId)
  );
  const scoredLeads = (opportunityScores ?? []) as LeadgenOpportunityScoreRow[];
  const enrichedLeads = buildLeadCardRecords(allLeads, { scores: scoredLeads, followUps: pendingFollowUps ?? [], agentNameById, latestEmailByLeadId });
  const interestedLeadsByAgent = new Map<string, typeof enrichedLeads>();
  for (const lead of enrichedLeads) {
    if (lead.status !== "Interested" || !lead.assigned_agent_id) continue;
    const existing = interestedLeadsByAgent.get(lead.assigned_agent_id) ?? [];
    existing.push(lead);
    interestedLeadsByAgent.set(lead.assigned_agent_id, existing);
  }
  const totalInterestedLeadRecords = enrichedLeads.filter((lead) => lead.status === "Interested");

  const activityKpisByAgent = new Map(
    allAgents.map((agentRow) => [agentRow.id, computeLeadgenAgentActivityKpis(allCallLogs, allEmails, allCompletedFollowUps, agentRow.id)])
  );
  const teamActivityKpis = computeLeadgenTeamActivityKpis(Array.from(activityKpisByAgent.values()));

  const performanceByAgent = new Map(allAgents.map((agentRow) => [agentRow.id, computeLeadgenAgentPerformance(allAppointments, agentRow.id)] as const));
  const appointmentsBookedRecordsByAgent = new Map(
    allAgents.map(
      (agentRow) =>
        [
          agentRow.id,
          sortAppointmentsUpcomingFirst(
            buildAppointmentCardRecords(leadgenCreditedAppointmentsInWeek(allAppointments, agentRow.id, currentWeekStart, currentWeekEnd), agentNameById)
          ),
        ] as const
    )
  );
  const teamAppointmentsBookedRecords = sortAppointmentsUpcomingFirst(
    buildAppointmentCardRecords(
      allAgents.flatMap((agentRow) => leadgenCreditedAppointmentsInWeek(allAppointments, agentRow.id, currentWeekStart, currentWeekEnd)),
      agentNameById
    )
  );

  await syncLeadgenWeeklyPerformanceHistory(admin, allAgents, allAppointments, now);

  const { data: historyRows } = await admin
    .from("leadgen_agent_weekly_performance")
    .select("agent_id, agent_name, week_start, week_end, booked_count, target, percentage, status")
    .eq("definition_version", 2)
    .in("agent_id", allAgents.map((agent) => agent.id));

  const [currentYear, currentMonth] = todayKey.split("-").map(Number);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agent Performance Report</h1>
          <p className="mt-1 text-sm text-slate-500">
            Weekly (Monday-Friday) booked-appointment performance against a target of 4 per agent, reset every Monday.
            Cancelled and duplicate (replaced) appointments never count.
          </p>
        </div>
        <Link
          href="/leadgen/admin/performance/call-notes"
          className="rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
        >
          View All Call Logs
        </Link>
      </div>

      {allAgents.length > 0 && (
        <div className="mt-6">
          <TeamActivityKpiSection
            team={teamActivityKpis}
            interestedLeadRecords={totalInterestedLeadRecords}
            appointmentsBookedRecords={teamAppointmentsBookedRecords}
            callsTodayRecords={filterRecordsToday(enrichedCallLogs, now)}
            callsThisWeekRecords={filterRecordsThisWeek(enrichedCallLogs, now)}
            emailsTodayRecords={filterEmailsSentToday(enrichedEmails, now)}
            emailsThisWeekRecords={filterEmailsSentThisWeek(enrichedEmails, now)}
            deliveredThisWeekRecords={filterEmailsSentThisWeek(enrichedEmails, now).filter((e) => e.delivered_at)}
            bouncedThisWeekRecords={filterEmailsSentThisWeek(enrichedEmails, now).filter((e) => e.bounced_at)}
            failedThisWeekRecords={filterEmailsSentThisWeek(enrichedEmails, now).filter((e) => e.failed_at)}
            callLogHref="/leadgen/admin/performance/call-notes"
            emailsHref="/leadgen/admin/emails"
            leadHrefBase="/leadgen/admin/leads"
            appointmentsHref="/leadgen/admin/appointments"
            onAddNote={addBoardLeadNoteAction}
            onCompleteFollowUp={completeFollowUpAction}
            onScheduleFollowUp={scheduleFollowUpAction}
          />
        </div>
      )}

      <div className="mt-6 space-y-6">
        {allAgents.length === 0 ? (
          <p className="text-[13.5px] text-slate-500">No active agents yet.</p>
        ) : (
          allAgents.map((agent) => {
            const agentName = agent.full_name || agent.email;
            const agentActivityKpis = activityKpisByAgent.get(agent.id);
            const agentPerformance = performanceByAgent.get(agent.id)!;
            const myCallLogs = enrichedCallLogs.filter((c) => c.agent_id === agent.id);
            const myEmails = enrichedEmails.filter((e) => e.sent_by === agent.id);
            const myEmailsThisWeek = filterEmailsSentThisWeek(myEmails, now);
            return (
              <div key={agent.id} className="space-y-3">
                {agentActivityKpis && (
                  <AgentActivityKpiSection
                    agentName={agentName}
                    kpis={agentActivityKpis}
                    interestedLeadRecords={interestedLeadsByAgent.get(agent.id) ?? []}
                    appointmentsBookedRecords={appointmentsBookedRecordsByAgent.get(agent.id) ?? []}
                    appointmentsWeeklyTarget={LEADGEN_WEEKLY_APPOINTMENT_TARGET}
                    callsTodayRecords={filterRecordsToday(myCallLogs, now)}
                    callsThisWeekRecords={filterRecordsThisWeek(myCallLogs, now)}
                    emailsTodayRecords={filterEmailsSentToday(myEmails, now)}
                    emailsThisWeekRecords={myEmailsThisWeek}
                    deliveredThisWeekRecords={myEmailsThisWeek.filter((e) => e.delivered_at)}
                    bouncedThisWeekRecords={myEmailsThisWeek.filter((e) => e.bounced_at)}
                    failedThisWeekRecords={myEmailsThisWeek.filter((e) => e.failed_at)}
                    followUpsCompletedRecords={filterFollowUpsCompletedThisWeek(
                      enrichedCompletedFollowUps.filter((f) => f.agent_id === agent.id),
                      now
                    )}
                    callLogHref={`/leadgen/admin/performance/call-notes?agent=${agent.id}`}
                    emailsHref="/leadgen/admin/emails"
                    leadHrefBase="/leadgen/admin/leads"
                    appointmentsHref="/leadgen/admin/appointments"
                    onAddNote={addBoardLeadNoteAction}
                    onCompleteFollowUp={completeFollowUpAction}
                    onScheduleFollowUp={scheduleFollowUpAction}
                  />
                )}
                <AgentPerformanceCard agentName={agentName} performance={agentPerformance} leadHrefBase="/leadgen/admin/leads" />
              </div>
            );
          })
        )}
      </div>

      <MonthlyPerformanceSection
        agents={allAgents.map((agent) => ({ id: agent.id, name: agent.full_name || agent.email }))}
        appointments={allAppointments}
        historyRows={(historyRows ?? []) as LeadgenWeeklyHistoryRow[]}
        currentWeekStart={currentWeekStart}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />
    </div>
  );
}
