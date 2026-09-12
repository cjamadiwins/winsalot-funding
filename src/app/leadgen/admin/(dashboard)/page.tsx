import Link from "next/link";
import { Users, UserCheck, CalendarCheck, Clock, AlertTriangle, UserPlus, CalendarPlus, BarChart3, Flame, Gauge, Snowflake, CalendarClock, Trophy } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import {
  LEADGEN_LEAD_STATUSES,
  LEADGEN_LEAD_STATUS_STYLES,
  LEADGEN_STAT_CARD_STYLES,
  isLeadgenAppointmentCountable,
  isLeadgenNextFollowUpDueToday,
  isLeadgenNextFollowUpOverdue,
} from "@/lib/leadgen-types";
import OpportunityPipelineSummaryCard from "@/components/crm-ui/OpportunityPipelineSummaryCard";
import { computeLeadgenDashboardTrends } from "@/lib/leadgen-dashboard-trends";
import { computeLeadgenAgentPerformance, leadgenDateKey, leadgenPerformanceTier, leadgenWeekRangeLabel, type LeadgenPerformanceAppointment } from "@/lib/leadgen-performance";
import KpiCard from "@/components/crm-ui/KpiCard";
import ResultsByAgentChart from "./ResultsByAgentChart";
import TodaysAppointmentsCard, { type TodaysAppointmentRow } from "./TodaysAppointmentsCard";
import DialpadDashboardPreview from "@/components/dialpad/DialpadDashboardPreview";
import { loadDialpadDashboardData } from "@/lib/dialpad-report-data";
import { effectiveOpportunityCategory, opportunityPriorityLevel, OPPORTUNITY_CATEGORY_KPI_TONE } from "@/lib/opportunity-finder";
import type { LeadgenOpportunityScoreRow } from "@/lib/opportunity-finder";
import { loadLeadgenAdminOpportunityFinderData } from "@/lib/leadgen-admin-opportunity-finder-data";
import OpportunityFinderModalTrigger from "./opportunity-finder/OpportunityFinderModalTrigger";
import type { LeadDetailActions } from "@/components/leadgen/LeadDetailClient";
import { addBoardLeadNoteAction } from "./opportunity-finder/actions";
import {
  completeFollowUpAction,
  recordCallOutcomeAction,
  scheduleFollowUpAction,
  sendConsultationEmailAction,
  sendConsultationFollowUpAction,
  sendConsultationInvitationAction,
  sendMantraCollabIntroEmailAction,
  updateLeadAction,
} from "./leads/[id]/actions";
import { assignLeadAction, deleteLeadgenLeadAction } from "./leads/actions";
import { clearBouncedEmailAction, resendLeadgenEmailAction } from "./actions";
import { bookAppointmentAction, resendAppointmentNotificationAction, sendAppointmentReminderAction } from "./appointments/actions";
import AdminPerformanceGaugeGrid from "@/components/crm-ui/AdminPerformanceGaugeGrid";
import { GROWTH_CRM_GAUGE_SEGMENTS } from "@/lib/performance-gauge";
import LeadgenLeadRecordsModal from "@/components/leadgen/LeadgenLeadRecordsModal";
import LeadgenAppointmentRecordsModal from "@/components/leadgen/LeadgenAppointmentRecordsModal";
import { buildAppointmentCardRecords, buildLeadCardRecords, latestLeadgenEmailByLeadId, sortAppointmentsUpcomingFirst, sortLeadsByMostUrgentFollowUp } from "@/lib/leadgen-dashboard-records";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export default async function LeadgenAdminDashboardPage() {
  const adminUser = await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const now = new Date();
  const todayKey = leadgenDateKey(now);

  const [
    { data: leads },
    { data: appointments },
    { data: clients },
    { data: users },
    { data: campaigns },
    { data: todaysAppointments },
    { data: opportunityScores },
    { data: pendingFollowUps },
    { data: recentEmails },
    opportunityFinderData,
  ] = await Promise.all([
      admin
        .from("leadgen_leads")
        .select(
          "id, business_name, contact_name, phone, email, status, client_id, campaign_id, assigned_agent_id, next_follow_up_at, last_contacted_at, notes, created_at"
        ),
      admin
        .from("leadgen_appointments")
        .select(
          "id, business_name, contact_name, phone, email, appointment_date, appointment_time, timezone, meeting_type, appointment_notes, status, created_at, booking_agent_id, assigned_specialist_id, client_id, lead_id"
        ),
      admin.from("leadgen_clients").select("id, name"),
      admin
        .from("leadgen_users")
        .select("id, full_name, role, current_campaign_id")
        .eq("role", "agent")
        .eq("active", true)
        .neq("email", DEACTIVATED_TEST_AGENT_EMAIL),
      admin.from("leadgen_campaigns").select("id, name, client_id"),
      // Today's Appointments dashboard widget - every non-cancelled/replaced
      // appointment booked for today, earliest first.
      admin
        .from("leadgen_appointments")
        .select("id, appointment_time, business_name, contact_name, status, assigned_specialist_id, lead_id")
        .eq("appointment_date", todayKey)
        .order("appointment_time", { ascending: true }),
      // Opportunity Finder counters, below - one lightweight read of the
      // scoring table (supabase/migrations/0113).
      admin.from("leadgen_opportunity_scores").select("*").order("score", { ascending: false }),
      admin.from("leadgen_followups").select("id, lead_id, status, scheduled_at").eq("status", "pending").order("scheduled_at", { ascending: true }),
      // "Latest Email Activity" card (Total Leads / Smart Opportunities) -
      // leadgen_leads has no denormalized last-email columns (unlike
      // crm_opportunities in the Growth CRM), so the most recent
      // leadgen_emails row per lead is resolved from a fresh read here
      // instead (see latestLeadgenEmailByLeadId).
      admin
        .from("leadgen_emails")
        .select("lead_id, status, to_email, sent_at, delivered_at, delayed_at, bounced_at, complained_at, opened_at, clicked_at, failed_at, created_at")
        .not("lead_id", "is", null)
        .order("created_at", { ascending: false }),
      // Opportunity Finder dashboard modal (below) - the exact same rows,
      // agents, clients, campaigns, and industries dataset the standalone
      // Opportunity Finder page loads, so the modal is never a
      // lighter/different dataset.
      loadLeadgenAdminOpportunityFinderData(),
    ]);

  const allLeads = leads ?? [];
  const allAppointments = appointments ?? [];
  const allClients = clients ?? [];
  const agents = users ?? [];
  const clientNameById = new Map(allClients.map((client) => [client.id, client.name] as const));
  const clientNameByCampaignId = new Map(
    (campaigns ?? []).map((campaign) => [campaign.id, clientNameById.get(campaign.client_id) ?? campaign.name] as const)
  );

  // Cancelled/Replaced appointments (isLeadgenAppointmentCountable,
  // leadgen-types.ts) never count toward "Results by Client"'s
  // appointment totals - a corrected duplicate (see the "Cancel/Replace
  // Appointment" admin action) counts once, via the appointment that
  // replaced it, not twice. (The dashboard's own "Appointments Booked"
  // card below uses a narrower, exact status === "Booked" definition -
  // see leadgen-dashboard-records.ts's header comment for why.)
  const countableAppointments = allAppointments.filter((a) => isLeadgenAppointmentCountable(a.status));

  const trends = computeLeadgenDashboardTrends(allLeads, now);

  // Opportunity Pipeline summary card (below) - stage counts from the
  // same allLeads array already fetched above, no new query.
  const pipelineStageCounts = LEADGEN_LEAD_STATUSES.map((status) => ({
    label: status,
    count: allLeads.filter((l) => l.status === status).length,
    styleClass: LEADGEN_LEAD_STATUS_STYLES[status],
  }));

  // Opportunity Finder counters.
  const opportunityScoreCounts = { hot: 0, warm: 0, followUp: 0, retry: 0 };
  const scoredLeads = (opportunityScores ?? []) as LeadgenOpportunityScoreRow[];
  for (const raw of scoredLeads) {
    const effective = effectiveOpportunityCategory(raw);
    if (effective === "hot") opportunityScoreCounts.hot += 1;
    else if (effective === "warm") opportunityScoreCounts.warm += 1;
    else if (effective === "follow_up") opportunityScoreCounts.followUp += 1;
    else if (effective === "retry") opportunityScoreCounts.retry += 1;
  }
  const convertedLeadIds = new Set((allAppointments as { status: string; lead_id?: string | null }[]).filter((a) => a.status === "Completed" && a.lead_id).map((a) => a.lead_id as string));

  const byCampaignClient = new Map<string, { name: string; leads: number; appointments: number }>();
  for (const client of allClients) byCampaignClient.set(client.id, { name: client.name, leads: 0, appointments: 0 });
  for (const lead of allLeads) {
    const entry = byCampaignClient.get(lead.client_id);
    if (entry) entry.leads++;
  }
  for (const appt of countableAppointments) {
    const entry = byCampaignClient.get(appt.client_id);
    if (entry) entry.appointments++;
  }

  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.full_name] as const));

  // Dashboard stat cards below - one enriched copy of every lead (agent
  // name, latest call outcome/note from Opportunity Finder's signals,
  // earliest pending follow-up id), so each card's own count AND its
  // drill-down modal's rows are both `.filter()`ed from this exact same
  // array - a card's number can never disagree with what clicking it
  // shows (see leadgen-dashboard-records.ts).
  const latestEmailByLeadId = latestLeadgenEmailByLeadId(recentEmails ?? []);
  const enrichedLeads = buildLeadCardRecords(allLeads, { scores: scoredLeads, followUps: pendingFollowUps ?? [], agentNameById, latestEmailByLeadId });
  const interestedRecords = enrichedLeads.filter((l) => l.status === "Interested");
  const followUpsDueTodayRecords = sortLeadsByMostUrgentFollowUp(enrichedLeads.filter((l) => isLeadgenNextFollowUpDueToday(l.next_follow_up_at)));
  const overdueRecords = sortLeadsByMostUrgentFollowUp(enrichedLeads.filter((l) => isLeadgenNextFollowUpOverdue(l.next_follow_up_at)));
  // Root-cause fix for "Appointments Booked" (see leadgen-dashboard-
  // records.ts's header comment) - status === "Booked" exactly, not the
  // broader isLeadgenAppointmentCountable set the old count used.
  const bookedAppointmentRecords = sortAppointmentsUpcomingFirst(
    buildAppointmentCardRecords(
      allAppointments.filter((a) => a.status === "Booked"),
      agentNameById
    )
  );
  // "Opportunities Converted" (Opportunity Finder row, below) had the
  // same class of bug as "Appointments Booked": it linked to Opportunity
  // Finder's own category=closed filter (a different, broader concept -
  // won, not interested, OR an appointment booked with nothing else
  // outstanding), while its count here is leads with a real Completed
  // appointment. Reusing convertedLeadIds (already computed above)
  // instead fixes that mismatch the same way the Growth CRM's
  // "Opportunities Converted" card was fixed.
  const convertedRecords = enrichedLeads.filter((l) => convertedLeadIds.has(l.id));
  // Opportunity Finder dashboard modal's trigger "N Hot" badge - same
  // numeric-score-based "hot" definition (opportunityPriorityLevel) the
  // modal's own list uses, counted over active (not dismissed) rows only.
  const opportunityFinderHotCount = opportunityFinderData.rows.filter(
    (row) => row.score.finder_state === "active" && opportunityPriorityLevel(row.score.score) === "hot"
  ).length;
  const leadDetailActions: LeadDetailActions = {
    updateLead: updateLeadAction,
    recordCallOutcome: recordCallOutcomeAction,
    scheduleFollowUp: scheduleFollowUpAction,
    completeFollowUp: completeFollowUpAction,
    bookAppointment: bookAppointmentAction,
    sendConsultationEmail: sendConsultationEmailAction,
    sendConsultationInvitation: sendConsultationInvitationAction,
    sendConsultationFollowUp: sendConsultationFollowUpAction,
    sendMantraCollabIntro: sendMantraCollabIntroEmailAction,
    resendEmail: resendLeadgenEmailAction,
    assignAgent: assignLeadAction,
    clearBouncedEmail: clearBouncedEmailAction,
    deleteLead: deleteLeadgenLeadAction,
    resendAppointmentNotification: resendAppointmentNotificationAction,
    sendAppointmentReminder: sendAppointmentReminderAction,
  };
  const todaysAppointmentRows: TodaysAppointmentRow[] = (todaysAppointments ?? [])
    .filter((appt) => isLeadgenAppointmentCountable(appt.status))
    .map((appt) => ({
      id: appt.id,
      appointment_time: appt.appointment_time,
      business_name: appt.business_name,
      contact_name: appt.contact_name,
      status: appt.status,
      agentName: appt.assigned_specialist_id ? (agentNameById.get(appt.assigned_specialist_id) ?? null) : null,
      lead_id: appt.lead_id,
    }));

  const dialpadData = await loadDialpadDashboardData(admin);

  const performanceGaugeRows = agents.map((agent) => {
    const performance = computeLeadgenAgentPerformance(allAppointments as LeadgenPerformanceAppointment[], agent.id);
    return {
      id: agent.id,
      agentName: agent.full_name,
      score: performance.percentage,
      tier: leadgenPerformanceTier(performance.percentage),
      summary: `${performance.bookedThisWeek}/${performance.target} appointments booked`,
      periodLabel: leadgenWeekRangeLabel(performance.weekStart, performance.weekEnd),
    };
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Good afternoon, Winsalot Corp.
          </h1>
          <p className="mt-1 text-sm text-slate-500">Here&apos;s what&apos;s happening across every client and campaign today.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/leadgen/admin/leads"
            className="flex items-center gap-2 rounded-[11px] bg-[var(--crm-accent,#3e7ef7)] px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-[var(--crm-accent-hover,#2e63d6)]"
          >
            <UserPlus className="h-4 w-4" strokeWidth={2.3} />
            Add Lead
          </Link>
          <Link
            href="/leadgen/admin/appointments"
            className="flex items-center gap-2 rounded-[11px] border-[1.5px] border-[var(--crm-accent,#3e7ef7)]/30 bg-white px-4 py-2.5 text-[13.5px] font-bold text-[var(--crm-accent,#3e7ef7)] transition hover:bg-[var(--crm-bg-2,#eaf0f6)]"
          >
            <CalendarPlus className="h-4 w-4" strokeWidth={2.3} />
            Book Appointment
          </Link>
          <Link
            href="/leadgen/admin/performance"
            className="flex items-center gap-2 rounded-[11px] bg-teal-600 px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-teal-700"
          >
            <BarChart3 className="h-4 w-4" strokeWidth={2.3} />
            View Reports
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <LeadgenLeadRecordsModal
          label="Total Leads"
          tone={LEADGEN_STAT_CARD_STYLES.leads}
          icon={<Users />}
          trend={trends.totalLeads}
          records={enrichedLeads}
          leadHrefBase="/leadgen/admin/leads"
          onAddNote={addBoardLeadNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onScheduleFollowUp={scheduleFollowUpAction}
        />
        <LeadgenLeadRecordsModal
          label="Interested Leads"
          tone={LEADGEN_STAT_CARD_STYLES.interested}
          icon={<UserCheck />}
          trend={trends.interestedLeads}
          records={interestedRecords}
          leadHrefBase="/leadgen/admin/leads"
          emptyMessage="No interested leads right now."
          onAddNote={addBoardLeadNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onScheduleFollowUp={scheduleFollowUpAction}
        />
        <LeadgenAppointmentRecordsModal
          label="Appointments Booked"
          tone={LEADGEN_STAT_CARD_STYLES.appointments}
          icon={<CalendarCheck />}
          trend={trends.appointmentsBooked}
          records={bookedAppointmentRecords}
          leadHrefBase="/leadgen/admin/leads"
          appointmentsHref="/leadgen/admin/appointments"
        />
        <LeadgenLeadRecordsModal
          label="Follow-ups Due Today"
          tone={LEADGEN_STAT_CARD_STYLES.dueToday}
          icon={<Clock />}
          trend={trends.followUpsDue}
          records={followUpsDueTodayRecords}
          leadHrefBase="/leadgen/admin/leads"
          emptyMessage="No follow-ups due today."
          onAddNote={addBoardLeadNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onScheduleFollowUp={scheduleFollowUpAction}
        />
        <LeadgenLeadRecordsModal
          label="Overdue Follow-ups"
          tone={LEADGEN_STAT_CARD_STYLES.overdue}
          icon={<AlertTriangle />}
          // Rising overdue count is bad, not good - flip the arrow's
          // color logic so an "up" trend reads red, not green.
          trend={{ ...trends.overdueFollowUps, goodDirection: "down" as const }}
          records={overdueRecords}
          leadHrefBase="/leadgen/admin/leads"
          emptyMessage="No overdue follow-ups."
          onAddNote={addBoardLeadNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onScheduleFollowUp={scheduleFollowUpAction}
        />
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-sky-700">Agent Client Status</h2>
        <p className="mt-1 text-[13px] text-slate-500">Each active agent&apos;s currently selected client.</p>
        {agents.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-slate-500">No active agents.</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {agents.map((agent) => {
              const clientName = agent.current_campaign_id ? clientNameByCampaignId.get(agent.current_campaign_id) : null;
              return (
                <div key={agent.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="text-[13.5px] font-semibold text-slate-800">{agent.full_name}</span>
                  <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${clientName ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                    {clientName ?? "Not selected"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <h2 className="mt-6 text-lg font-bold text-slate-900">Opportunity Finder</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Hot" value={opportunityScoreCounts.hot} icon={<Flame />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.hot} href="/leadgen/admin/opportunity-finder?category=hot" />
        <KpiCard label="Warm" value={opportunityScoreCounts.warm} icon={<Gauge />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.warm} href="/leadgen/admin/opportunity-finder?category=warm" />
        <KpiCard label="Follow-Up" value={opportunityScoreCounts.followUp} icon={<CalendarClock />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.follow_up} href="/leadgen/admin/opportunity-finder?category=follow_up" />
        <KpiCard label="Retry" value={opportunityScoreCounts.retry} icon={<Snowflake />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.retry} href="/leadgen/admin/opportunity-finder?category=retry" />
        <LeadgenLeadRecordsModal
          label="Opportunities Converted"
          tone="green"
          icon={<Trophy />}
          records={convertedRecords}
          leadHrefBase="/leadgen/admin/leads"
          emptyMessage="No converted opportunities yet."
          onAddNote={addBoardLeadNoteAction}
        />
      </div>

      <OpportunityFinderModalTrigger
        rows={opportunityFinderData.rows}
        agents={opportunityFinderData.agents}
        clients={opportunityFinderData.clients}
        campaigns={opportunityFinderData.campaigns}
        industries={opportunityFinderData.industries}
        currentUserName={adminUser.full_name || adminUser.email}
        currentUserId={adminUser.id}
        actions={leadDetailActions}
        onAddNote={addBoardLeadNoteAction}
        onScheduleCallback={scheduleFollowUpAction}
        onCompleteFollowUp={completeFollowUpAction}
        hotCount={opportunityFinderHotCount}
      />

      <OpportunityPipelineSummaryCard stageCounts={pipelineStageCounts} boardHref="/leadgen/admin/opportunity-finder?view=board" />

      <AdminPerformanceGaugeGrid rows={performanceGaugeRows} reportHref="/leadgen/admin/performance" segments={GROWTH_CRM_GAUGE_SEGMENTS} />

      <DialpadDashboardPreview
        audience="admin"
        report={dialpadData.selectedReport}
        summaries={dialpadData.summaries}
        fullReportHref="/leadgen/admin/dialpad"
      />

      <section className="mt-8 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-purple-700">Results by Client</h2>
        {byCampaignClient.size === 0 ? (
          <p className="mt-3 text-[13.5px] text-slate-500">No clients yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2">Client</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">Appointments</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byCampaignClient.entries()).map(([id, row]) => (
                <tr key={id} className="border-b border-slate-100">
                  <td className="py-2">
                    <Link
                      href={`/leadgen/admin/clients/${id}`}
                      className="font-medium text-sky-600 hover:text-sky-700"
                      title={`Open the ${row.name} campaign dashboard`}
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right">
                    <Link href={`/leadgen/admin/leads?client=${id}`} className="text-slate-700 hover:text-sky-600 hover:underline">
                      {row.leads}
                    </Link>
                  </td>
                  <td className="py-2 text-right">
                    <Link href={`/leadgen/admin/appointments?client=${id}`} className="text-slate-700 hover:text-sky-600 hover:underline">
                      {row.appointments}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <section className="min-w-0 flex-[1.6] rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-green-700">Agent Performance</h2>
          <ResultsByAgentChart agents={agents} leads={allLeads} serverNowIso={now.toISOString()} />
        </section>

        <div className="flex-1">
          <TodaysAppointmentsCard appointments={todaysAppointmentRows} />
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Training</h2>
        <p className="mt-2 text-[13.5px] text-slate-600">
          Open the correct client call script before dialing to stay consistent on every campaign.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/leadgen/admin/training#mantra-collab" className="text-[13.5px] font-semibold text-sky-600 hover:text-sky-700">
            Open Mantra Collab Training
          </Link>
          <Link href="/leadgen/admin/training#brents-essentials" className="text-[13.5px] font-semibold text-sky-600 hover:text-sky-700">
            Open Brent&apos;s Essentials Training
          </Link>
        </div>
      </section>
    </div>
  );
}
