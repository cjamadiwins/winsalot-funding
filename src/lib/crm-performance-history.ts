// Monthly Performance (Winsalot Growth CRM): reads the permanent weekly
// ledger (crm_agent_weekly_performance, migration 0052/0086/0152) plus the
// current, still-open period (computed live, the same way the existing
// Agent Performance Report does in crm-performance.ts) to build a
// month's worth of history. Pure, client-safe - CrmMonthlyPerformanceSection
// renders straight from this file's exports, the same way
// CrmPerformanceCard renders from crm-performance.ts. The write side
// (freezing a completed period into that table) is a separate,
// server-only module - crm-performance-history-sync.ts - so this file
// can be imported from a "use client" component without pulling in
// service-role code. Deliberately self-contained rather than sharing
// code with the Lead Gen CRM's equivalent (leadgen-performance-history.ts)
// - same rationale as crm-performance.ts's own header comment: the two
// CRMs' report logic must never accidentally couple to each other.

import {
  CRM_WEEKLY_CONSULTATIONS_TARGET,
  CRM_WEEKLY_LEADS_ADDED_TARGET,
  CRM_WEEKLY_EMAILS_DELIVERED_TARGET,
  addDays,
  crmWeekStartOf,
  computeCrmPeriodPerformance,
  crmPerformanceTier,
  type CrmPerformanceOpportunityRecord,
  type CrmPerformanceTier,
} from "./crm-performance";

// Where a period sits relative to "today" - a period that hasn't
// started yet has no result to judge (brief: future periods "must show
// 'Not Started' and must not reduce the current monthly percentage"),
// so it's never given a green/yellow/red tier - only "completed"
// periods are. "current" is the one still-open period in progress.
export type CrmPeriodStatus = "completed" | "current" | "future";

export type CrmWeeklyHistoryRow = {
  agent_id: string | null;
  agent_name: string;
  period_start: string;
  period_end: string;
  consultations_booked: number | null;
  consultations_booked_target: number | null;
  consultations_booked_percentage: number | null;
  leads_added: number | null;
  leads_added_target: number | null;
  leads_added_percentage: number | null;
  emails_delivered: number | null;
  emails_delivered_target: number | null;
  emails_delivered_percentage: number | null;
  overall_percentage: number;
  status: CrmPerformanceTier;
};

export type CrmPeriodRecord = {
  periodStart: string; // YYYY-MM-DD, Monday
  periodEnd: string; // YYYY-MM-DD, Friday (4 days after periodStart)
  consultationsBooked: number;
  leadsAdded: number;
  emailsDelivered: number;
  overallPercentage: number;
  tier: CrmPerformanceTier;
  status: CrmPeriodStatus;
  // true = a closed period's permanently saved result (from
  // crm_agent_weekly_performance); false = computed live from the
  // currently-visible opportunity records (the still-open current
  // period, or any completed period that hasn't been frozen yet).
  frozen: boolean;
};

export type CrmMonthlyMetricTotal = {
  total: number;
  goal: number;
  percentage: number;
  remaining: number;
};

export type CrmMonthlyPerformance = {
  year: number;
  month: number; // 1-12
  monthLabel: string;
  periodsStarted: number; // completed + current - what goals/percentages/average are based on
  completedPeriodsCount: number; // strictly completed (excludes the current in-progress period)
  consultationsBooked: CrmMonthlyMetricTotal;
  leadsAdded: CrmMonthlyMetricTotal;
  emailsDelivered: CrmMonthlyMetricTotal;
  bestPeriod: CrmPeriodRecord | null;
  monthlyTier: CrmPerformanceTier;
  monthlyOverallPercentage: number;
  periodBreakdown: CrmPeriodRecord[];
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function crmMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Every Monday-Friday period belongs to exactly one month: whichever month
// contains its Monday start date. Weeks are anchored to the calendar (every
// Monday is a period start), so unlike a biweekly cadence a period can
// still span a month boundary near the end of a month - it's counted
// toward the month its start date falls in, the same "own the month of its
// start" partition rule the Lead Gen CRM's weekly report uses for weeks.
export function crmWeekStartsInMonth(year: number, month: number): string[] {
  const firstOfMonth = `${year}-${pad2(month)}-01`;
  let periodStart = crmWeekStartOf(firstOfMonth);
  if (periodStart < firstOfMonth) periodStart = addDays(periodStart, 7);

  const starts: string[] = [];
  while (true) {
    const [periodYear, periodMonth] = periodStart.split("-").map(Number);
    if (periodYear !== year || periodMonth !== month) break;
    starts.push(periodStart);
    periodStart = addDays(periodStart, 7);
  }
  return starts;
}

// Builds one agent's period records for a list of period-start dates -
// the frozen ledger row for any already-closed period, or a live
// computation (over the same opportunity records batch the caller
// already fetched) for the current, still-open period or any period
// that hasn't been frozen yet. A future period is always zero regardless
// of what's in `records` so it unambiguously shows "Not Started" rather
// than a misleading 0%.
export function buildCrmPeriodRecords(
  periodStarts: string[],
  historyRows: CrmWeeklyHistoryRow[],
  records: CrmPerformanceOpportunityRecord[],
  agentId: string,
  currentPeriodStart: string
): CrmPeriodRecord[] {
  const historyByPeriod = new Map(
    historyRows.filter((row) => row.agent_id === agentId).map((row) => [row.period_start, row] as const)
  );

  return periodStarts.map((periodStart) => {
    const periodEnd = addDays(periodStart, 4);
    const status: CrmPeriodStatus =
      periodStart < currentPeriodStart ? "completed" : periodStart === currentPeriodStart ? "current" : "future";
    const frozenRow = status === "completed" ? historyByPeriod.get(periodStart) : undefined;

    if (frozenRow && frozenRow.leads_added !== null) {
      return {
        periodStart,
        periodEnd,
        consultationsBooked: frozenRow.consultations_booked ?? 0,
        leadsAdded: frozenRow.leads_added ?? 0,
        emailsDelivered: frozenRow.emails_delivered ?? 0,
        overallPercentage: frozenRow.overall_percentage,
        tier: frozenRow.status,
        status,
        frozen: true,
      };
    }

    if (status === "future") {
      return {
        periodStart,
        periodEnd,
        consultationsBooked: 0,
        leadsAdded: 0,
        emailsDelivered: 0,
        overallPercentage: 0,
        tier: crmPerformanceTier(0),
        status,
        frozen: false,
      };
    }

    const period = computeCrmPeriodPerformance(records, agentId, periodStart, periodEnd);
    return {
      periodStart,
      periodEnd,
      consultationsBooked: period.consultationsBooked,
      leadsAdded: period.leadsAdded,
      emailsDelivered: period.emailsDelivered,
      overallPercentage: period.overallPercentage,
      tier: crmPerformanceTier(period.overallPercentage),
      status,
      frozen: false,
    };
  });
}

// periodBreakdown covers every Monday-Friday period whose start falls in
// the month, including any that haven't started yet ("future") - kept
// as-is on the returned object so the UI can still list/label them. But a
// period that hasn't begun has no result to weigh the month's numbers
// down with, so every goal/percentage below is computed only over periods
// that have started (completed or the current in-progress one) -
// otherwise picking a month on day one would show a misleadingly low
// percentage purely because most of its periods hadn't started.
// "completedPeriodsCount" is reported separately, strictly completed
// periods only.
function metricTotal(total: number, target: number, periodsStarted: number): CrmMonthlyMetricTotal {
  const goal = target * periodsStarted;
  const percentage = goal > 0 ? Math.round((total / goal) * 100) : 0;
  return { total, goal, percentage, remaining: Math.max(0, goal - total) };
}

export function computeCrmMonthlyPerformance(
  year: number,
  month: number,
  periodBreakdown: CrmPeriodRecord[]
): CrmMonthlyPerformance {
  const startedPeriods = periodBreakdown.filter((period) => period.status !== "future");
  const completedPeriodsCount = periodBreakdown.filter((period) => period.status === "completed").length;

  const periodsStarted = startedPeriods.length;
  const totalConsultationsBooked = startedPeriods.reduce((sum, period) => sum + period.consultationsBooked, 0);
  const totalLeadsAdded = startedPeriods.reduce((sum, period) => sum + period.leadsAdded, 0);
  const totalEmailsDelivered = startedPeriods.reduce((sum, period) => sum + period.emailsDelivered, 0);
  const bestPeriod = startedPeriods.reduce<CrmPeriodRecord | null>(
    (best, period) => (!best || period.overallPercentage > best.overallPercentage ? period : best),
    null
  );

  const consultationsBooked = metricTotal(totalConsultationsBooked, CRM_WEEKLY_CONSULTATIONS_TARGET, periodsStarted);
  const leadsAdded = metricTotal(totalLeadsAdded, CRM_WEEKLY_LEADS_ADDED_TARGET, periodsStarted);
  const emailsDelivered = metricTotal(totalEmailsDelivered, CRM_WEEKLY_EMAILS_DELIVERED_TARGET, periodsStarted);

  const cappedPercentages = [
    Math.min(100, consultationsBooked.percentage),
    Math.min(100, leadsAdded.percentage),
    Math.min(100, emailsDelivered.percentage),
  ];
  const monthlyOverallPercentage = Math.round(cappedPercentages.reduce((sum, p) => sum + p, 0) / cappedPercentages.length);
  const monthlyTier = crmPerformanceTier(monthlyOverallPercentage);

  return {
    year,
    month,
    monthLabel: crmMonthLabel(year, month),
    periodsStarted,
    completedPeriodsCount,
    consultationsBooked,
    leadsAdded,
    emailsDelivered,
    bestPeriod,
    monthlyTier,
    monthlyOverallPercentage,
    periodBreakdown,
  };
}

// Inclusive list of {year, month} from one month up to another, walking
// forward - used to build the Monthly History table's row list.
export function crmMonthsInRange(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number
): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  let year = fromYear;
  let month = fromMonth;
  while (year < toYear || (year === toYear && month <= toMonth)) {
    months.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
