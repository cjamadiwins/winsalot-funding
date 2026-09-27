Warning: truncated output (original token count: 6887)
Total output lines: 532

import PhoneReputationComplianceCard from "@/components/crm-ui/PhoneReputationComplianceCard";
import AdminHiyaCallerReputationCard from "@/components/crm-ui/AdminHiyaCallerReputationCard";
import Link from "next/link";
import AdminDashboardGreeting from "@/components/crm-ui/AdminDashboardGreeting";
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
import { loadDialpadDashboardData, ensureLatestDialpadReportImported } from "@/lib/dialpad-report-data";
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
import { getAllDncSuppressions } from "@/lib/dnc-suppression";
import DoNotContactModalTrigger from "@/components/crm-ui/DoNotContactModalTrigger";
import {
  addSuppressionAction as addDncSuppressionAction,
  editSuppressionAction as editDncSuppressionAction,
  getAuditLogAction as getDncAuditLogAction,
  importDncCsvAction,
  reactivateSuppressionAction as reactivateDncSuppressionAction,
  removeSuppressionAction as removeDncSuppressionAction,
} from "./do-not-contact/actions";
import { loadLeadgenTeamSalesCoachData } from "@/lib/leadgen-sales-coach";
import { SalesCoachAdminCard } from "@/components/crm-ui/SalesCoachCard";
import ApprovedVoicemailScriptCard from "@/components/crm-ui/ApprovedVoicemailScriptCard";

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
    dncRows,
    { data: openShifts },
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
        .select("id, full_name, role, current_campaign_id, scheduled_start_time")
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
      // Do Not Contact dashboard card/modal (below) - every row regardless
      // of source_crm, since a Lead Generation CRM admin must also see
      // (and be able to manage) a restriction added from the Growth CRM.
      getAllDncSuppressions(),
      // Sales Coach Team Overview status banner (below) - only who's
      // currently clocked in matters here, not full shift history.
      admin.from("leadgen_agent_attendance").select("agent_id").is("clock_out", null),
    ]);

  const allLeads = leads ?? [];
  const allAppointments = appointments ?? [];
  const allClients = clients ?? [];
  const agents = users ?? [];
  const clientNameById = new Map(allClients.map((client) => [client.id, client.name] as const));
  const clientNameByCampaignId = new Map(
    (campaigns ?? []).map((campaign) => [campaign.id, clientNameById.get(campaign.client_id) ?? campaign.n…2887 tokens truncated…         // Rising overdue count is bad, not good - flip the arrow's
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

      <DoNotContactModalTrigger
        rows={dncRows}
        exportHref="/leadgen/admin/do-not-contact/export"
        actions={{
          addSuppression: addDncSuppressionAction,
          removeSuppression: removeDncSuppressionAction,
          reactivateSuppression: reactivateDncSuppressionAction,
          editSuppression: editDncSuppressionAction,
          importCsv: importDncCsvAction,
          getAuditLog: getDncAuditLogAction,
        }}
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
