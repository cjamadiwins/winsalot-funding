import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmUser } from "@/lib/crm-auth";
import type { AgentAttendanceRow, CrmFollowUpWithOpportunity, CrmOpportunityRow } from "@/lib/crm-types";
import { getCrmPerformanceRecords } from "@/lib/crm-performance-data";
import { getCrmIncentiveAppointments } from "@/lib/crm-incentive-data";
import { getCrmOpportunityConversionRecords } from "@/lib/crm-conversion-data";
import { computeCrmAgentPerformance, crmPerformanceTier, crmBiweeklyRangeLabel, crmDateKey, addDays as crmAddDays } from "@/lib/crm-performance";
import { computeCrmWeeklyIncentive, crmMondayOf } from "@/lib/crm-incentives";
import { deriveWeeklyIncentiveDisplayStatus, isMonthlyIncentiveCapReached, monthStartOfWeek } from "@/lib/agent-incentive-shared";
import { fetchAgentMonthToDateApproved, fetchLedgerRow, fetchWinsalotIncentiveSettings } from "@/lib/agent-incentive-ledger";
import PerformanceRing from "@/components/crm-ui/PerformanceRing";
import AgentWeeklyIncentiveCard from "@/components/crm-ui/AgentWeeklyIncentiveCard";
import ResultsByAgentConversion from "@/components/ResultsByAgentConversion";
import AgentDashboardClient from "./AgentDashboardClient";
import FollowUpCalendar from "./FollowUpCalendar";
import OverdueOpportunitiesPanel from "./OverdueOpportunitiesPanel";
import AttendanceCard from "./AttendanceCard";
import DialpadDashboardPreview from "@/components/dialpad/DialpadDashboardPreview";
import { loadDialpadAgentDashboardData } from "@/lib/dialpad-report-data";

export default async function AgentDashboardPage() {
  const crmUser = await requireCrmUser();
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
  ]);

  const opportunities = (opportunitiesData ?? []) as CrmOpportunityRow[];
  const followUps = (followUpsData ?? []) as CrmFollowUpWithOpportunity[];
  const openShift = attendanceError ? null : ((attendanceData ?? null) as AgentAttendanceRow | null);

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
  const dialpadData = await loadDialpadAgentDashboardData(
    supabase,
    crmUser.email,
    crmUser.full_name
  );

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

      {!opportunitiesError && <AgentDashboardClient opportunities={opportunities} />}

      {/* 2. Dashboard and performance */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Welcome back, {crmUser.full_name || crmUser.email}.
          </p>
        </div>
        <Link
          href="/agent/opportunities/new"
          className="whitespace-nowrap rounded-full bg-[var(--color-accent)] px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          + New Opportunity
        </Link>
      </div>

      <section className="mt-6 flex flex-col items-center gap-5 rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <PerformanceRing percentage={performance.current.overallPercentage} tier={performanceTier} label="of biweekly target" size={112} strokeWidth={10} />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">Performance</div>
            <div className="mt-1 text-[15px] font-bold text-[var(--crm-text)]">
              {performance.current.consultationsBooked} consultations · {performance.current.clientsWon} won
            </div>
            <div className="mt-0.5 text-[12.5px] text-[var(--crm-text-muted)]">
              Period: {crmBiweeklyRangeLabel(performance.current.periodStart, performance.current.periodEnd)}
            </div>
          </div>
        </div>
        <Link href="/agent/performance" className="whitespace-nowrap text-[13.5px] font-semibold text-[var(--crm-accent)] hover:opacity-80">
          View full report →
        </Link>
      </section>

      <DialpadDashboardPreview
        audience="agent"
        report={dialpadData.report}
        summaries={dialpadData.summary ? [dialpadData.summary] : []}
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
