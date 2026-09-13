import Link from "next/link";
import { Users, Clock, AlertTriangle, UserCheck } from "lucide-react";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  LEADGEN_LEAD_STATUSES,
  LEADGEN_LEAD_STATUS_STYLES,
  LEADGEN_STAT_CARD_STYLES,
  isLeadgenAppointmentCountable,
  isLeadgenFollowUpDueToday,
  isLeadgenFollowUpOverdue,
  type LeadgenAgentAttendanceRow,
  type LeadgenFollowUpWithLead,
  type LeadgenLeadRow,
} from "@/lib/leadgen-types";
import OpportunityPipelineSummaryCard from "@/components/crm-ui/OpportunityPipelineSummaryCard";
import { effectiveOpportunityCategory, opportunityPriorityLevel, OPPORTUNITY_CATEGORY_KPI_TONE, type LeadgenOpportunityScoreRow } from "@/lib/opportunity-finder";
import { loadLeadgenAgentMyOpportunities } from "@/lib/leadgen-agent-my-opportunities-data";
import OpportunityFinderModalTrigger from "./my-opportunities/OpportunityFinderModalTrigger";
import type { LeadDetailActions } from "@/components/leadgen/LeadDetailClient";
import { bookAppointmentAction } from "./appointments/actions";
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
import { Flame, Gauge, CalendarClock, Snowflake, CalendarCheck, Target, Hourglass } from "lucide-react";
import { computeLeadgenAgentPerformance, leadgenPerformanceTier, leadgenWeekRangeLabel, type LeadgenPerformanceAppointment } from "@/lib/leadgen-performance";
import { computeLeadgenWeeklyIncentive, leadgenCurrentIncentiveWeek, type LeadgenIncentiveAppointment } from "@/lib/leadgen-incentives";
import { deriveWeeklyIncentiveDisplayStatus, isMonthlyIncentiveCapReached, monthStartOfWeek } from "@/lib/agent-incentive-shared";
import { fetchAgentMonthToDateApproved, fetchLedgerRow, fetchWinsalotIncentiveSettings } from "@/lib/agent-incentive-ledger";
import KpiCard from "@/components/crm-ui/KpiCard";
import { GROWTH_CRM_GAUGE_SEGMENTS } from "@/lib/performance-gauge";
import PerformanceScoreCard, { PerformanceTile } from "@/components/crm-ui/PerformanceScoreCard";
import AgentWeeklyIncentiveCard from "@/components/crm-ui/AgentWeeklyIncentiveCard";
import LeadgenAttendanceCard from "./LeadgenAttendanceCard";
import LeadToAppointmentRateCard from "./LeadToAppointmentRateCard";
import DialpadDashboardPreview from "@/components/dialpad/DialpadDashboardPreview";
import { loadDialpadAgentDashboardData } from "@/lib/dialpad-report-data";
import AgentCampaignSelector from "@/components/leadgen/AgentCampaignSelector";
import { LEADGEN_AGENT_DASHBOARD_CAMPAIGN_SCRIPTS } from "@/lib/leadgen-agent-campaigns";
import { addBoardLeadNoteAction } from "./my-opportunities/actions";
import LeadgenLeadRecordsModal from "@/components/leadgen/LeadgenLeadRecordsModal";
import { buildLeadCardRecords, latestLeadgenEmailByLeadId } from "@/lib/leadgen-dashboard-records";
import { getActiveDncSuppressions } from "@/lib/dnc-suppression";
import DoNotContactModalTrigger from "@/components/crm-ui/DoNotContactModalTrigger";
import { addAgentDncSuppressionAction } from "./do-not-contact-actions";

export default async function LeadgenAgentDashboardPage() {
  const agent = await requireLeadgenAgent();
  const agentDisplayName = agent.full_name.trim() || "Winsalot Agent";
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdmin();

  const { weekStart, weekEnd } = leadgenCurrentIncentiveWeek();
  const monthStart = monthStartOfWeek(weekStart);

  const [
    { data: leads },
    { data: followUps },
    { data: attendanceData, error: attendanceError },
    { data: appointments },
    { data: clients },
    { data: campaigns },
    settings,
    ledgerRow,
    monthToDateApproved,
    { data: opportunityScores },
    { data: recentEmails },
    myOpportunitiesRows,
    dncRows,
  ] = await Promise.all([
    supabase.from("leadgen_leads").select("*").order("created_at", { ascending: false }),
    supabase
      .from("leadgen_followups")
      .select("*, leadgen_leads(id, business_name, contact_name, phone, email, status, next_follow_up_at)")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("leadgen_agent_attendance")
      .select("*")
      .eq("agent_id", agent.id)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Same source /leadgen/agent/performance reads, reused here only to
    // surface a read-only ring summary on the dashboard - no calculation
    // logic duplicated or changed. incentive_status is additionally
    // selected for the Weekly Incentive card below.
    supabase
      .from("leadgen_appointments")
      .select("id, business_name, contact_name, appointment_date, appointment_time, status, created_at, booking_agent_id, incentive_status, client_id")
      .order("appointment_date", { ascending: false }),
    // Names for the "My Results by Client" breakdown below - agents can
    // already read every client's name (see leads/new/page.tsx), only
    // their own leads/appointments are actually RLS-scoped.
    supabase.from("leadgen_clients").select("id, name"),
    supabase.from("leadgen_campaigns").select("id, name, client_id").eq("status", "active").order("name"),
    fetchWinsalotIncentiveSettings(supabase),
    fetchLedgerRow(supabase, "leadgen", agent.email, weekStart),
    // Service-role, narrowly filtered to this signed-in agent's own
    // email - see the header comment on fetchAgentMonthToDateApproved
    // for why RLS alone can't serve a cross-CRM total.
    fetchAgentMonthToDateApproved(admin, agent.email, monthStart),
    // Opportunity Finder counters, below - RLS
    // (leadgen_opportunity_scores_agent_select_own) already scopes this to
    // the signed-in agent's own leads.
    supabase.from("leadgen_opportunity_scores").select("*").order("score", { ascending: false }),
    // "Latest Email Activity" card - RLS (leadgen_emails_agent_select_own)
    // already scopes this to emails sent for this agent's own leads, same
    // as leadgen_leads/leadgen_opportunity_scores above.
    supabase
      .from("leadgen_emails")
      .select("lead_id, status, to_email, sent_at, delivered_at, delayed_at, bounced_at, complained_at, opened_at, clicked_at, failed_at, created_at")
      .not("lead_id", "is", null)
      .order("created_at", { ascending: false }),
    // Opportunity Finder dashboard modal (below) - the exact same rows the
    // standalone /leadgen/agent/my-opportunities page loads (RLS already
    // scopes this to the signed-in agent's own leads).
    loadLeadgenAgentMyOpportunities(supabase, agentDisplayName),
    // Do Not Contact dashboard card/modal (below) - active restrictions
    // only, from either CRM, since a restriction added in the Growth CRM
    // must be visible here too.
    getActiveDncSuppressions(),
  ]);

  const myLeads = (leads ?? []) as LeadgenLeadRow[];
  const performance = computeLeadgenAgentPerformance((appointments ?? []) as LeadgenPerformanceAppointment[], agent.id);
  const performanceTier = leadgenPerformanceTier(performance.percentage);
  const openShift = attendanceError ? null : ((attendanceData ?? null) as LeadgenAgentAttendanceRow | null);
  const weeklyIncentive = computeLeadgenWeeklyIncentive(
    (appointments ?? []) as LeadgenIncentiveAppointment[],
    agent.id,
    weekStart,
    weekEnd,
    settings.leadgenWeeklyQuota,
    settings.leadgenWeeklyBonusAmount
  );
  const displayStatus = deriveWeeklyIncentiveDisplayStatus(weeklyIncentive.qualifiedCount, weeklyIncentive.quota, ledgerRow);
  const capReached = isMonthlyIncentiveCapReached(monthToDateApproved, settings.monthlyCap);
  const remainingToCap = Math.max(0, settings.monthlyCap - monthToDateApproved);
  const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const dialpadData = await loadDialpadAgentDashboardData(supabase);
  // Only count/show a follow-up if it's still its lead's authoritative
  // upcoming one (lead.next_follow_up_at === this row's scheduled_at) -
  // the same source of truth the Leads page's Due Today/Overdue filters
  // use (isLeadgenNextFollowUpDueToday/Overdue on next_follow_up_at), so
  // this list and its count can never drift out of sync with the Leads
  // page even if a stale "pending" row is ever left behind by a bug
  // elsewhere.
  const allFollowUps = ((followUps ?? []) as LeadgenFollowUpWithLead[]).filter(
    (followUp) => followUp.leadgen_leads?.next_follow_up_at === followUp.scheduled_at
  );
  const dueToday = allFollowUps.filter(isLeadgenFollowUpDueToday);
  const overdue = allFollowUps.filter(isLeadgenFollowUpOverdue);

  const statusCounts = new Map<string, number>();
  for (const lead of myLeads) statusCounts.set(lead.status, (statusCounts.get(lead.status) ?? 0) + 1);

  const opportunityScoreCounts = { hot: 0, warm: 0, followUp: 0, retry: 0 };
  const scoredLeads = (opportunityScores ?? []) as LeadgenOpportunityScoreRow[];
  for (const raw of scoredLeads) {
    const effective = effectiveOpportunityCategory(raw);
    if (effective === "hot") opportunityScoreCounts.hot += 1;
    else if (effective === "warm") opportunityScoreCounts.warm += 1;
    else if (effective === "follow_up") opportunityScoreCounts.followUp += 1;
    else if (effective === "retry") opportunityScoreCounts.retry += 1;
  }

  // Dashboard stat cards below - one enriched copy of every one of this
  // agent's own leads (latest call outcome/note from Opportunity Finder's
  // signals, earliest pending follow-up id), so each card's own count AND
  // its drill-down modal's rows are both `.filter()`ed from this exact
  // same array (see leadgen-dashboard-records.ts). Due Today/Overdue
  // reuse the exact same lead-id sets as the `dueToday`/`overdue`
  // follow-up arrays above, rather than re-deriving from
  // next_follow_up_at directly, so this modal never disagrees with the
  // FollowUpGroup lists further down the page.
  const latestEmailByLeadId = latestLeadgenEmailByLeadId(recentEmails ?? []);
  const enrichedLeads = buildLeadCardRecords(myLeads, {
    scores: scoredLeads,
    followUps: allFollowUps,
    agentNameById: new Map([[agent.id, agentDisplayName]]),
    latestEmailByLeadId,
  });
  const interestedRecords = enrichedLeads.filter((l) => l.status === "Interested");
  const dueTodayLeadIds = new Set(dueToday.map((f) => f.lead_id));
  const overdueLeadIds = new Set(overdue.map((f) => f.lead_id));
  const dueTodayRecords = enrichedLeads.filter((l) => dueTodayLeadIds.has(l.id));
  const overdueRecords = enrichedLeads.filter((l) => overdueLeadIds.has(l.id));

  // Opportunity Pipeline summary card (below) - reuses statusCounts above.
  const pipelineStageCounts = LEADGEN_LEAD_STATUSES.map((status) => ({
    label: status,
    count: statusCounts.get(status) ?? 0,
    styleClass: LEADGEN_LEAD_STATUS_STYLES[status],
  }));

  // "My Results by Client" - same shape as the admin dashboard's Results
  // by Client table, but scoped to only this agent's own leads/
  // appointments (already RLS-limited above), and only clients that are
  // actually relevant to them - never the full client roster, so a
  // Mantra-restricted agent's dashboard never surfaces Brent's Essentials
  // (or vice versa) just because leadgen_clients itself is readable.
  const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.name] as const));
  const myByClient = new Map<string, { name: string; leads: number; appointments: number }>();
  for (const lead of myLeads) {
    const name = clientNameById.get(lead.client_id);
    if (!name) continue;
    const entry = myByClient.get(lead.client_id) ?? { name, leads: 0, appointments: 0 };
    entry.leads++;
    myByClient.set(lead.client_id, entry);
  }
  for (const appt of appointments ?? []) {
    if (!isLeadgenAppointmentCountable(appt.status) || !appt.client_id) continue;
    const name = clientNameById.get(appt.client_id);
    if (!name) continue;
    const entry = myByClient.get(appt.client_id) ?? { name, leads: 0, appointments: 0 };
    entry.appointments++;
    myByClient.set(appt.client_id, entry);
  }

  // The agent dashboard's "Current Campaign" selector shows exactly the
  // campaigns registered in LEADGEN_AGENT_DASHBOARD_CAMPAIGN_SCRIPTS
  // (keyed by campaign id, not name text) - this is what keeps
  // "Q3 Growth Campaign" out of this dropdown even though it shares
  // Brent's Essentials' client_id. Each option's label is the campaign's
  // related client name, never the longer campaign name.
  const agentCampaignOptions = (campaigns ?? [])
    .filter((campaign) => campaign.id in LEADGEN_AGENT_DASHBOARD_CAMPAIGN_SCRIPTS)
    .map((campaign) => ({ id: campaign.id, businessName: clientNameById.get(campaign.client_id) ?? campaign.name }));

  // Opportunity Finder dashboard modal's trigger "N Hot" badge - same
  // numeric-score-based "hot" definition (opportunityPriorityLevel) the
  // modal's own list uses, counted over active (not dismissed) rows only.
  const opportunityFinderHotCount = myOpportunitiesRows.filter(
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
    // No resendEmail / assignAgent / clearBouncedEmail /
    // resendAppointmentNotification / sendAppointmentReminder - all
    // admin-only, same as the standalone /leadgen/agent/leads/[id] page's
    // own `actions` bag.
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Welcome, {agentDisplayName}</h1>
      <p className="mt-1 text-sm text-slate-500">{myLeads.length} leads assigned to you.</p>

      <AgentCampaignSelector
        campaigns={agentCampaignOptions}
        currentCampaignId={agent.current_campaign_id}
        agentFullName={agentDisplayName}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <LeadgenLeadRecordsModal
          label="My Leads"
          tone={LEADGEN_STAT_CARD_STYLES.leads}
          icon={<Users />}
          records={enrichedLeads}
          leadHrefBase="/leadgen/agent/leads"
          onAddNote={addBoardLeadNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onScheduleFollowUp={scheduleFollowUpAction}
        />
        <LeadgenLeadRecordsModal
          label="Due Today"
          tone={LEADGEN_STAT_CARD_STYLES.dueToday}
          icon={<Clock />}
          records={dueTodayRecords}
          leadHrefBase="/leadgen/agent/leads"
          emptyMessage="No follow-ups due today."
          onAddNote={addBoardLeadNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onScheduleFollowUp={scheduleFollowUpAction}
        />
        <LeadgenLeadRecordsModal
          label="Overdue"
          tone={LEADGEN_STAT_CARD_STYLES.overdue}
          icon={<AlertTriangle />}
          records={overdueRecords}
          leadHrefBase="/leadgen/agent/leads"
          emptyMessage="No overdue follow-ups."
          onAddNote={addBoardLeadNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onScheduleFollowUp={scheduleFollowUpAction}
        />
        <LeadgenLeadRecordsModal
          label="Interested"
          tone={LEADGEN_STAT_CARD_STYLES.interested}
          icon={<UserCheck />}
          records={interestedRecords}
          leadHrefBase="/leadgen/agent/leads"
          emptyMessage="No interested leads right now."
          onAddNote={addBoardLeadNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onScheduleFollowUp={scheduleFollowUpAction}
        />
      </div>

      <h2 className="mt-8 text-lg font-bold text-slate-900">Opportunity Finder</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Hot" value={opportunityScoreCounts.hot} icon={<Flame />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.hot} href="/leadgen/agent/my-opportunities?category=hot" />
        <KpiCard label="Warm" value={opportunityScoreCounts.warm} icon={<Gauge />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.warm} href="/leadgen/agent/my-opportunities?category=warm" />
        <KpiCard label="Follow-Up" value={opportunityScoreCounts.followUp} icon={<CalendarClock />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.follow_up} href="/leadgen/agent/my-opportunities?category=follow_up" />
        <KpiCard label="Retry" value={opportunityScoreCounts.retry} icon={<Snowflake />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.retry} href="/leadgen/agent/my-opportunities?category=retry" />
      </div>

      <OpportunityFinderModalTrigger
        rows={myOpportunitiesRows}
        currentUserName={agent.full_name || agent.email}
        currentUserId={agent.id}
        actions={leadDetailActions}
        onAddNote={addBoardLeadNoteAction}
        onScheduleCallback={scheduleFollowUpAction}
        onCompleteFollowUp={completeFollowUpAction}
        hotCount={opportunityFinderHotCount}
      />

      <DoNotContactModalTrigger rows={dncRows} actions={{ addSuppression: addAgentDncSuppressionAction }} />

      <OpportunityPipelineSummaryCard stageCounts={pipelineStageCounts} boardHref="/leadgen/agent/my-opportunities?view=board" />

      <DialpadDashboardPreview
        audience="agent"
        report={dialpadData.report}
        summaries={dialpadData.summary ? [dialpadData.summary] : []}
        fullReportHref="/leadgen/agent/dialpad"
      />

      {myByClient.size > 1 && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-purple-700">My Results by Client</h2>
          <table className="mt-3 w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2">Client</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">Appointments</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(myByClient.entries()).map(([id, row]) => (
                <tr key={id} className="border-b border-slate-100">
                  <td className="py-2">
                    <Link href={`/leadgen/agent/leads?client=${id}`} className="font-medium text-sky-600 hover:text-sky-700">
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right">
                    <Link href={`/leadgen/agent/leads?client=${id}`} className="text-slate-700 hover:text-sky-600 hover:underline">
                      {row.leads}
                    </Link>
                  </td>
                  <td className="py-2 text-right">
                    <Link href={`/leadgen/agent/appointments?client=${id}`} className="text-slate-700 hover:text-sky-600 hover:underline">
                      {row.appointments}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <PerformanceScoreCard
        className="mt-6"
        agentName={agentDisplayName}
        score={performance.percentage}
        tier={performanceTier}
        segments={GROWTH_CRM_GAUGE_SEGMENTS}
        periodLabel={`Week of ${leadgenWeekRangeLabel(performance.weekStart, performance.weekEnd)}`}
        resultsLine={`${performance.bookedThisWeek}/${performance.target} appointments booked`}
        reportHref="/leadgen/agent/performance"
        tiles={
          <>
            <PerformanceTile
              label="Appointments Booked"
              value={`${performance.bookedThisWeek}/${performance.target}`}
              icon={<CalendarCheck className="h-5 w-5" strokeWidth={2.3} />}
              tone="violet"
            />
            <PerformanceTile label="Weekly Target" value={String(performance.target)} icon={<Target className="h-5 w-5" strokeWidth={2.3} />} tone="emerald" />
            <PerformanceTile
              label="Remaining to Target"
              value={String(performance.remainingToTarget)}
              icon={<Hourglass className="h-5 w-5" strokeWidth={2.3} />}
              tone="sky"
            />
          </>
        }
      />

      <LeadToAppointmentRateCard
        leads={myLeads.map((lead) => ({ id: lead.id, business_name: lead.business_name, status: lead.status, created_at: lead.created_at }))}
        serverNowIso={new Date().toISOString()}
      />

      <AgentWeeklyIncentiveCard
        crm="leadgen"
        weekLabel={leadgenWeekRangeLabel(weekStart, weekEnd)}
        recordLabel="qualified appointments"
        qualifiedCount={weeklyIncentive.qualifiedCount}
        quota={weeklyIncentive.quota}
        percentage={weeklyIncentive.percentage}
        quotaMet={weeklyIncentive.quotaMet}
        calculatedBonus={weeklyIncentive.calculatedBonus}
        weeklyBonusAmount={settings.leadgenWeeklyBonusAmount}
        displayStatus={displayStatus}
        monthLabel={monthLabel}
        monthToDateApproved={monthToDateApproved}
        monthlyCap={settings.monthlyCap}
        remainingToCap={remainingToCap}
        capReached={capReached}
        historyHref="/leadgen/agent/incentives/history"
      />

      <LeadgenAttendanceCard openShift={openShift} />
      {attendanceError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load attendance: {attendanceError.message}
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FollowUpGroup title="Overdue" items={overdue} emphasis="danger" />
        <FollowUpGroup title="Due Today" items={dueToday} emphasis="warn" />
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Training</h2>
        <p className="mt-2 text-[13.5px] text-slate-600">
          Open the correct client call script before dialing to stay consistent for every business.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/leadgen/agent/training#mantra-collab" className="text-[13.5px] font-semibold text-sky-600 hover:text-sky-700">
            Open Mantra Collab Training
          </Link>
          <Link href="/leadgen/agent/training#brents-essentials" className="text-[13.5px] font-semibold text-sky-600 hover:text-sky-700">
            Open Brent&apos;s Essentials Training
          </Link>
        </div>
      </section>
    </div>
  );
}

function FollowUpGroup({ title, items, emphasis }: { title: string; items: LeadgenFollowUpWithLead[]; emphasis: "danger" | "warn" }) {
  const cardStyle = emphasis === "danger" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50";
  const titleStyle = emphasis === "danger" ? "text-rose-700" : "text-amber-700";

  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h2 className={`text-[11.5px] font-semibold uppercase tracking-wide ${titleStyle}`}>
        {title} ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-slate-500">Nothing here.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((followUp) => {
            const lead = followUp.leadgen_leads;
            return (
              <li key={followUp.id} className={`rounded-lg border p-3.5 text-[13.5px] ${cardStyle}`}>
                <div className="flex items-center justify-between">
                  <Link href={`/leadgen/agent/leads/${followUp.lead_id}`} className="font-semibold text-slate-900 hover:text-sky-600">
                    {lead?.business_name ?? "Lead"}
                  </Link>
                  <span className="text-[12px] text-slate-500">{new Date(followUp.scheduled_at).toLocaleString()}</span>
                </div>
                {lead?.status && (
                  <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_LEAD_STATUS_STYLES[lead.status]}`}>
                    {lead.status}
                  </span>
                )}
                {followUp.note && <p className="mt-1.5 text-slate-700">{followUp.note}</p>}
                <form
                  action={async () => {
                    "use server";
                    await completeFollowUpAction(followUp.id, followUp.lead_id);
                  }}
                  className="mt-2"
                >
                  <button type="submit" className="text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800">
                    Mark Completed
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
