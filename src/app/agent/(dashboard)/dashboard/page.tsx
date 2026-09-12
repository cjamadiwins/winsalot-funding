import Link from "next/link";
import { UserPlus, CalendarPlus, BarChart3, CalendarCheck, Target, Mail } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmUser } from "@/lib/crm-auth";
import { OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_STYLES, type AgentAttendanceRow, type CrmFollowUpWithOpportunity, type CrmOpportunityRow } from "@/lib/crm-types";
import OpportunityPipelineSummaryCard from "@/components/crm-ui/OpportunityPipelineSummaryCard";
import KpiCard from "@/components/crm-ui/KpiCard";
import { effectiveOpportunityCategory, opportunityPriorityLevel, OPPORTUNITY_CATEGORY_KPI_TONE, type CrmOpportunityScoreRow } from "@/lib/opportunity-finder";
import { loadAgentMyOpportunities } from "@/lib/agent-my-opportunities-data";
import OpportunityFinderModalTrigger from "../my-opportunities/OpportunityFinderModalTrigger";
import { Flame, Gauge, CalendarClock, Snowflake } from "lucide-react";
import { getCrmPerformanceRecords } from "@/lib/crm-performance-data";
import { getCrmIncentiveAppointments } from "@/lib/crm-incentive-data";
import { getCrmOpportunityConversionRecords } from "@/lib/crm-conversion-data";
import {
  computeCrmAgentPerformance,
  crmPerformanceTier,
  crmWeeklyRangeLabel,
  crmDateKey,
  addDays as crmAddDays,
  CRM_WEEKLY_CONSULTATIONS_TARGET,
  CRM_WEEKLY_LEADS_ADDED_TARGET,
  CRM_WEEKLY_EMAILS_DELIVERED_TARGET,
} from "@/lib/crm-performance";
import { computeCrmWeeklyIncentive, crmMondayOf } from "@/lib/crm-incentives";
import { deriveWeeklyIncentiveDisplayStatus, isMonthlyIncentiveCapReached, monthStartOfWeek } from "@/lib/agent-incentive-shared";
import { fetchAgentMonthToDateApproved, fetchLedgerRow, fetchWinsalotIncentiveSettings } from "@/lib/agent-incentive-ledger";
import { GROWTH_CRM_GAUGE_SEGMENTS } from "@/lib/performance-gauge";
import PerformanceScoreCard, { PerformanceTile } from "@/components/crm-ui/PerformanceScoreCard";
import AgentWeeklyIncentiveCard from "@/components/crm-ui/AgentWeeklyIncentiveCard";
import ResultsByAgentConversion from "@/components/ResultsByAgentConversion";
import AgentDashboardClient from "./AgentDashboardClient";
import FollowUpCalendar from "./FollowUpCalendar";
import OverdueOpportunitiesPanel from "./OverdueOpportunitiesPanel";
import AttendanceCard from "./AttendanceCard";
import DialpadDashboardPreview from "@/components/dialpad/DialpadDashboardPreview";
import { loadDialpadAgentDashboardData } from "@/lib/dialpad-report-data";
import { addBoardOpportunityNoteAction } from "../my-opportunities/actions";
import { completeOpportunityFollowUpAction, rescheduleOpportunityFollowUpAction, scheduleOpportunityFollowUpAction } from "../opportunities/[id]/actions";
import { buildOpportunityCardRecords } from "@/lib/crm-dashboard-records";
import { getBookedConsultationRecords, sortConsultationsUpcomingFirst } from "@/lib/winsalot-consultation-data";

export default async function AgentDashboardPage() {
  const crmUser = await requireCrmUser();
  const agentDisplayName = crmUser.full_name.trim() || "Winsalot Agent";
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdmin();

  const weekStart = crmMondayOf(crmDateKey(new Date()));
  const weekEnd = crmAddDays(weekStart, 6);
  const incentiveMonthStart = monthStartOfWeek(weekStart);

  // RLS (crm_opportunities_agent_select_own / crm_followups_agent_select_own_opportunity)
  // already restricts both of these to opportunities assigned to the
  // signed-in agent, so no extra filtering is needed here - the session
  // client is enough, no service-role client required.
  const [
    { data: opportunitiesData, error: opportunitiesError },
    { data: followUpsData, error: followUpsError },
    { data: attendanceData, error: attendanceError },
    { data: opportunityScores },
    consultationRecordsRaw,
    myOpportunitiesRows,
  ] = await Promise.all([
    supabase.from("crm_opportunities").select("*").order("created_at", { ascending: false }),
    supabase
      .from("crm_followups")
      .select("*, crm_opportunities(id, business_name, phone, city, assigned_agent_id, opportunity_type)")
      .eq("status", "pending")
      .not("opportunity_id", "is", null)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("agent_attendance")
      .select("*")
      .eq("agent_id", crmUser.id)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Opportunity Finder counters, below - RLS (crm_opportunity_scores_agent_select_own)
    // already scopes this to the signed-in agent's own opportunities.
    supabase.from("crm_opportunity_scores").select("*").order("score", { ascending: false }),
    // Consultations Booked (below) - a genuine winsalot_appointments row
    // with status='booked' (RLS: winsalot_appointments_agent_select_own
    // already scopes this to the signed-in agent's own appointments only),
    // not just an opportunity whose stage happens to read "Consultation
    // Booked" - see winsalot-consultation-data.ts.
    getBookedConsultationRecords(supabase),
    // Opportunity Finder dashboard modal (below) - the exact same rows the
    // standalone /agent/my-opportunities page loads (RLS already scopes
    // this to the signed-in agent's own opportunities).
    loadAgentMyOpportunities(supabase, agentDisplayName),
  ]);

  const opportunities = (opportunitiesData ?? []) as CrmOpportunityRow[];
  const followUps = (followUpsData ?? []) as CrmFollowUpWithOpportunity[];
  const openShift = attendanceError ? null : ((attendanceData ?? null) as AgentAttendanceRow | null);
  const consultationRecords = sortConsultationsUpcomingFirst(consultationRecordsRaw);

  const scoreCounts = { hot: 0, warm: 0, followUp: 0, retry: 0 };
  const scoredOpportunities = (opportunityScores ?? []) as CrmOpportunityScoreRow[];
  for (const raw of scoredOpportunities) {
    const effective = effectiveOpportunityCategory(raw);
    if (effective === "hot") scoreCounts.hot += 1;
    else if (effective === "warm") scoreCounts.warm += 1;
    else if (effective === "follow_up") scoreCounts.followUp += 1;
    else if (effective === "retry") scoreCounts.retry += 1;
  }

  // My Opportunities cards below - one enriched copy of every opportunity
  // (latest call outcome/note from Opportunity Finder's signals, earliest
  // pending follow-up id), so each card's own count AND its drill-down
  // modal's rows are both `.filter()`ed from this exact same array - see
  // crm-dashboard-records.ts.
  const enrichedOpportunities = buildOpportunityCardRecords(opportunities, {
    scores: scoredOpportunities,
    followUps,
    agentNameById: new Map([[crmUser.id, agentDisplayName]]),
  });

  // Opportunity Finder dashboard modal's trigger "N Hot" badge - same
  // numeric-score-based "hot" definition (opportunityPriorityLevel) the
  // modal's own list uses, counted over active (not dismissed) rows only.
  const opportunityFinderHotCount = myOpportunitiesRows.filter(
    (row) => row.score.finder_state === "active" && opportunityPriorityLevel(row.score.score) === "hot"
  ).length;

  // Opportunity Pipeline summary card (below) - stage counts from the
  // same opportunities array already fetched above (RLS-scoped to this
  // agent's own opportunities), no new query.
  const pipelineStageCounts = OPPORTUNITY_STAGES.map((stage) => ({
    label: stage,
    count: opportunities.filter((o) => o.stage === stage).length,
    styleClass: OPPORTUNITY_STAGE_STYLES[stage],
  }));

  // Same helpers /agent/performance uses (getCrmPerformanceRecords +
  // computeCrmAgentPerformance) - reused here purely to surface a
  // read-only ring summary on the dashboard; no calculation logic
  // duplicated or changed.
  const performanceRecords = await getCrmPerformanceRecords(crmUser.id);
  const performance = computeCrmAgentPerformance(performanceRecords, crmUser.id);
  const performanceTier = crmPerformanceTier(performance.current.overallPercentage);

  // Prospect-to-Client Rate (Results by Agent) - scoped to just this
  // agent's own opportunities (getCrmOpportunityConversionRecords(crmUser.id)
  // never even receives another agent's rows over the wire), so an agent
  // only ever sees their own rate here.
  const conversionRecords = await getCrmOpportunityConversionRecords(crmUser.id);
  const dialpadData = await loadDialpadAgentDashboardData(supabase);

  // Weekly Agent Incentive - scoped to just this agent's own appointments
  // (getCrmIncentiveAppointments(crmUser.id) never even receives another
  // agent's rows over the wire, same pattern as getCrmPerformanceRecords
  // above). Settings/ledger reads go through the session client (RLS:
  // winsalot_incentive_settings_agent_select /
  // winsalot_agent_incentive_ledger_agent_select_own); the cross-CRM
  // month-to-date total is the one deliberate service-role exception -
  // see fetchAgentMonthToDateApproved's header comment.
  const [incentiveAppointments, incentiveSettings, incentiveLedgerRow, incentiveMonthToDateApproved] = await Promise.all([
    getCrmIncentiveAppointments(crmUser.id),
    fetchWinsalotIncentiveSettings(supabase),
    fetchLedgerRow(supabase, "cleaning", crmUser.email, weekStart),
    fetchAgentMonthToDateApproved(admin, crmUser.email, incentiveMonthStart),
  ]);
  const weeklyIncentive = computeCrmWeeklyIncentive(
    incentiveAppointments,
    crmUser.id,
    weekStart,
    weekEnd,
    incentiveSettings.crmWeeklyQuota,
    incentiveSettings.crmWeeklyBonusAmount
  );
  const incentiveDisplayStatus = deriveWeeklyIncentiveDisplayStatus(weeklyIncentive.qualifiedCount, weeklyIncentive.quota, incentiveLedgerRow);
  const incentiveCapReached = isMonthlyIncentiveCapReached(incentiveMonthToDateApproved, incentiveSettings.monthlyCap);
  const incentiveRemainingToCap = Math.max(0, incentiveSettings.monthlyCap - incentiveMonthToDateApproved);
  const incentiveMonthLabel = new Date(`${incentiveMonthStart}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      {/* 1. My Opportunities - cards, search, filters, and the opportunity
          list (AgentDashboardClient) - moved to the top of the agent's
          working content, ahead of the dashboard/performance summary and
          the callback/follow-up sections below. Purely a reorder: every
          section's own markup, data, and styling is unchanged from before. */}
      <h2 id="my-opportunities" className="mt-10 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">
        My Opportunities
      </h2>

      {opportunitiesError && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load opportunities: {opportunitiesError.message}
        </p>
      )}

      {!opportunitiesError && (
        <AgentDashboardClient
          opportunities={enrichedOpportunities}
          consultationRecords={consultationRecords}
          onAddNote={addBoardOpportunityNoteAction}
          onCompleteFollowUp={completeOpportunityFollowUpAction}
          onReschedule={rescheduleOpportunityFollowUpAction}
        />
      )}

      {/* 2. Dashboard and performance */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Welcome back, {agentDisplayName}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/agent/opportunities/new"
            className="flex items-center gap-2 whitespace-nowrap rounded-full bg-[var(--color-accent)] px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <UserPlus className="h-4 w-4" strokeWidth={2.3} />
            Add Opportunity
          </Link>
          <Link
            href="/agent/appointments?openAdd=1"
            className="flex items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] border-[var(--color-accent)]/30 bg-[var(--color-input-bg)] px-5 py-3 text-[15px] font-semibold text-[var(--color-accent)] transition hover:bg-[var(--crm-bg-2,#eaf0f6)]"
          >
            <CalendarPlus className="h-4 w-4" strokeWidth={2.3} />
            Book Call / Appointment
          </Link>
          <Link
            href="/agent/performance"
            className="flex items-center gap-2 whitespace-nowrap rounded-full bg-teal-600 px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-teal-700"
          >
            <BarChart3 className="h-4 w-4" strokeWidth={2.3} />
            View Reports
          </Link>
        </div>
      </div>

      <PerformanceScoreCard
        className="mt-6"
        agentName={agentDisplayName}
        score={performance.current.overallPercentage}
        tier={performanceTier}
        segments={GROWTH_CRM_GAUGE_SEGMENTS}
        periodLabel={`Week: ${crmWeeklyRangeLabel(performance.current.periodStart, performance.current.periodEnd)}`}
        resultsLine={`${performance.current.consultationsBooked} consultations · ${performance.current.leadsAdded} leads added · ${performance.current.emailsDelivered} emails delivered`}
        reportHref="/agent/performance"
        tiles={
          <>
            <PerformanceTile
              label="Consultations Booked"
              value={`${performance.current.consultationsBooked}/${CRM_WEEKLY_CONSULTATIONS_TARGET}`}
              icon={<CalendarCheck className="h-5 w-5" strokeWidth={2.3} />}
              tone="violet"
            />
            <PerformanceTile
              label="Opportunity Leads Added"
              value={`${performance.current.leadsAdded}/${CRM_WEEKLY_LEADS_ADDED_TARGET}`}
              icon={<Target className="h-5 w-5" strokeWidth={2.3} />}
              tone="emerald"
            />
            <PerformanceTile
              label="Emails Delivered"
              value={`${performance.current.emailsDelivered}/${CRM_WEEKLY_EMAILS_DELIVERED_TARGET}`}
              icon={<Mail className="h-5 w-5" strokeWidth={2.3} />}
              tone="sky"
            />
          </>
        }
      />

      <h2 className="mt-8 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">Opportunity Finder</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Hot" value={scoreCounts.hot} icon={<Flame />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.hot} href="/agent/my-opportunities?category=hot" />
        <KpiCard label="Warm" value={scoreCounts.warm} icon={<Gauge />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.warm} href="/agent/my-opportunities?category=warm" />
        <KpiCard label="Follow-Up" value={scoreCounts.followUp} icon={<CalendarClock />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.follow_up} href="/agent/my-opportunities?category=follow_up" />
        <KpiCard label="Retry" value={scoreCounts.retry} icon={<Snowflake />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.retry} href="/agent/my-opportunities?category=retry" />
      </div>

      <OpportunityFinderModalTrigger
        rows={myOpportunitiesRows}
        currentAgentId={crmUser.id}
        onAddNote={addBoardOpportunityNoteAction}
        onScheduleCallback={scheduleOpportunityFollowUpAction}
        onCompleteFollowUp={completeOpportunityFollowUpAction}
        hotCount={opportunityFinderHotCount}
      />

      <OpportunityPipelineSummaryCard stageCounts={pipelineStageCounts} boardHref="/agent/my-opportunities?view=board" />

      <DialpadDashboardPreview
        audience="agent"
        report={dialpadData.report}
        summaries={dialpadData.summary ? [dialpadData.summary] : []}
        fullReportHref="/agent/dialpad"
      />

      <ResultsByAgentConversion
        agents={[{ id: crmUser.id, full_name: crmUser.full_name, email: crmUser.email }]}
        records={conversionRecords}
        serverNowIso={new Date().toISOString()}
        opportunityHrefBase="/agent/opportunities"
      />

      <AgentWeeklyIncentiveCard
        crm="cleaning"
        weekLabel={formatIncentiveWeekLabel(weekStart, weekEnd)}
        recordLabel="qualified consultations"
        qualifiedCount={weeklyIncentive.qualifiedCount}
        quota={weeklyIncentive.quota}
        percentage={weeklyIncentive.percentage}
        quotaMet={weeklyIncentive.quotaMet}
        calculatedBonus={weeklyIncentive.calculatedBonus}
        weeklyBonusAmount={incentiveSettings.crmWeeklyBonusAmount}
        displayStatus={incentiveDisplayStatus}
        monthLabel={incentiveMonthLabel}
        monthToDateApproved={incentiveMonthToDateApproved}
        monthlyCap={incentiveSettings.monthlyCap}
        remainingToCap={incentiveRemainingToCap}
        capReached={incentiveCapReached}
        historyHref="/agent/incentives/history"
      />

      <AttendanceCard openShift={openShift} />
      {attendanceError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load attendance: {attendanceError.message}
        </p>
      )}

      {/* 3. Scheduled callbacks and follow-ups */}
      {!opportunitiesError && !followUpsError && (
        <div className="mt-8">
          <OverdueOpportunitiesPanel opportunities={opportunities} followUps={followUps} />
        </div>
      )}

      <h2 className="mt-8 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">
        Follow-Up Calendar
      </h2>
      {followUpsError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load your follow-up calendar: {followUpsError.message}
        </p>
      )}
      {!followUpsError && (
        <div className="mt-3">
          <FollowUpCalendar followUps={followUps} opportunities={opportunities} />
        </div>
      )}

      {/* 4. Remaining existing sections - none; every section above already
          accounts for the page's full previous content. */}
    </div>
  );
}

function formatIncentiveWeekLabel(weekStart: string, weekEnd: string): string {
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = weekEnd.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = new Date(ey, em - 1, ed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${start} – ${end}`;
}
