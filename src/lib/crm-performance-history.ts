// Monthly Performance (Cleaning CRM): reads the permanent biweekly
// ledger (crm_agent_biweekly_performance, migration 0052) plus the
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
  CRM_BIWEEKLY_QUOTES_RECEIVED_TARGET,
  CRM_BIWEEKLY_QUOTES_SENT_TARGET,
  addDays,
  biweeklyPeriodStartOf,
  computeCrmPeriodPerformance,
  crmPerformanceTier,
  type CrmPerformanceQuoteRecord,
  type CrmPerformanceTier,
} from "./crm-performance";

// Where a period sits relative to "today" - a period that hasn't
// started yet has no result to judge (brief: future periods "must show
// 'Not Started' and must not reduce the current monthly percentage"),
// so it's never given a green/yellow/red tier - only "completed"
// periods are. "current" is the one still-open period in progress.
export type CrmPeriodStatus = "completed" | "current" | "future";

export type CrmBiweeklyHistoryRow = {
  agent_id: string | null;
  agent_name: string;
  period_start: string;
  period_end: string;
  quotes_sent: number;
  quotes_sent_target: number;
  quotes_sent_percentage: number;
  quotes_received: number;
  quotes_received_target: number;
  quotes_received_percentage: number;
  overall_percentage: number;
  status: CrmPerformanceTier;
};

export type CrmPeriodRecord = {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD, 13 days after periodStart
  quotesSent: number;
  quotesSentTarget: number;
  quotesSentPercentage: number;
  quotesReceived: number;
  quotesReceivedTarget: number;
  quotesReceivedPercentage: number;
  overallPercentage: number;
  tier: CrmPerformanceTier;
  status: CrmPeriodStatus;
  // true = a closed period's permanently saved result (from
  // crm_agent_biweekly_performance); false = computed live from the
  // currently-visible quote records (the still-open current period, or
  // any completed period that hasn't been frozen yet).
  frozen: boolean;
};

export type CrmMonthlyPerformance = {
  year: number;
  month: number; // 1-12
  monthLabel: string;
  periodsStarted: number; // completed + current - what goals/percentages/average are based on
  completedPeriodsCount: number; // strictly completed (excludes the current in-progress period)
  totalSent: number;
  sentGoal: number;
  sentPercentage: number;
  remainingSent: number;
  totalReceived: number;
  receivedGoal: number;
  receivedPercentage: number;
  remainingReceived: number;
  averageSentPerPeriod: number;
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

// Every two-week period belongs to exactly one month: whichever month
// contains its start date. Periods are fixed 14-day blocks anchored to
// a global epoch (BIWEEKLY_EPOCH_MONDAY in crm-performance.ts), not
// month-relative, so unlike calendar weeks a period can span a month
// boundary - it's still counted toward the month its start date falls
// in, the same "own the month of its start" partition rule the Lead Gen
// CRM's weekly report uses for weeks.
export function crmPeriodStartsInMonth(year: number, month: number): string[] {
  const firstOfMonth = `${year}-${pad2(month)}-01`;
  let periodStart = biweeklyPeriodStartOf(firstOfMonth);
  if (periodStart < firstOfMonth) periodStart = addDays(periodStart, 14);

  const starts: string[] = [];
  while (true) {
    const [periodYear, periodMonth] = periodStart.split("-").map(Number);
    if (periodYear !== year || periodMonth !== month) break;
    starts.push(periodStart);
    periodStart = addDays(periodStart, 14);
  }
  return starts;
}

// Builds one agent's period records for a list of period-start dates -
// the frozen ledger row for any already-closed period, or a live
// computation (over the same quote records batch the caller already
// fetched) for the current, still-open period or any period that hasn't
// been frozen yet. A future period is always zero regardless of what's
// in `records` (a quote can't be sent/received before its period
// starts) so it unambiguously shows "Not Started" rather than a
// misleading 0%.
export function buildCrmPeriodRecords(
  periodStarts: string[],
  historyRows: CrmBiweeklyHistoryRow[],
  records: CrmPerformanceQuoteRecord[],
  agentId: string,
  currentPeriodStart: string
): CrmPeriodRecord[] {
  const historyByPeriod = new Map(
    historyRows.filter((row) => row.agent_id === agentId).map((row) => [row.period_start, row] as const)
  );

  return periodStarts.map((periodStart) => {
    const periodEnd = addDays(periodStart, 13);
    const status: CrmPeriodStatus =
      periodStart < currentPeriodStart ? "completed" : periodStart === currentPeriodStart ? "current" : "future";
    const frozenRow = status === "completed" ? historyByPeriod.get(periodStart) : undefined;

    if (frozenRow) {
      return {
        periodStart,
        periodEnd,
        quotesSent: frozenRow.quotes_sent,
        quotesSentTarget: frozenRow.quotes_sent_target,
        quotesSentPercentage: frozenRow.quotes_sent_percentage,
        quotesReceived: frozenRow.quotes_received,
        quotesReceivedTarget: frozenRow.quotes_received_target,
        quotesReceivedPercentage: frozenRow.quotes_received_percentage,
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
        quotesSent: 0,
        quotesSentTarget: CRM_BIWEEKLY_QUOTES_SENT_TARGET,
        quotesSentPercentage: 0,
        quotesReceived: 0,
        quotesReceivedTarget: CRM_BIWEEKLY_QUOTES_RECEIVED_TARGET,
        quotesReceivedPercentage: 0,
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
      quotesSent: period.quotesSent,
      quotesSentTarget: CRM_BIWEEKLY_QUOTES_SENT_TARGET,
      quotesSentPercentage: period.sentPercentage,
      quotesReceived: period.quotesReceived,
      quotesReceivedTarget: CRM_BIWEEKLY_QUOTES_RECEIVED_TARGET,
      quotesReceivedPercentage: period.receivedPercentage,
      overallPercentage: period.overallPercentage,
      tier: crmPerformanceTier(period.overallPercentage),
      status,
      frozen: false,
    };
  });
}

// periodBreakdown covers every two-week period whose start falls in the
// month, including any that haven't started yet ("future") - kept as-is
// on the returned object so the UI can still list/label them. But a
// period that hasn't begun has no result to weigh the month's numbers
// down with (brief: "Calculate the monthly goals based only on biweekly
// periods that have started" / "future periods... must not reduce the
// current monthly percentage"), so every goal/percentage/average below
// is computed only over periods that have started (completed or the
// current in-progress one) - otherwise picking a month on day one would
// show a misleadingly low percentage purely because most of its periods
// hadn't started. "completedPeriodsCount" is reported separately,
// strictly completed periods only, since the brief asks for that as its
// own figure distinct from the goal/percentage denominator.
export function computeCrmMonthlyPerformance(
  year: number,
  month: number,
  periodBreakdown: CrmPeriodRecord[]
): CrmMonthlyPerformance {
  const startedPeriods = periodBreakdown.filter((period) => period.status !== "future");
  const completedPeriodsCount = periodBreakdown.filter((period) => period.status === "completed").length;

  const periodsStarted = startedPeriods.length;
  const totalSent = startedPeriods.reduce((sum, period) => sum + period.quotesSent, 0);
  const totalReceived = startedPeriods.reduce((sum, period) => sum + period.quotesReceived, 0);
  const sentGoal = CRM_BIWEEKLY_QUOTES_SENT_TARGET * periodsStarted;
  const receivedGoal = CRM_BIWEEKLY_QUOTES_RECEIVED_TARGET * periodsStarted;
  const sentPercentage = sentGoal > 0 ? Math.round((totalSent / sentGoal) * 100) : 0;
  const receivedPercentage = receivedGoal > 0 ? Math.round((totalReceived / receivedGoal) * 100) : 0;
  const remainingSent = Math.max(0, sentGoal - totalSent);
  const remainingReceived = Math.max(0, receivedGoal - totalReceived);
  const averageSentPerPeriod = periodsStarted > 0 ? Math.round((totalSent / periodsStarted) * 10) / 10 : 0;
  const bestPeriod = startedPeriods.reduce<CrmPeriodRecord | null>(
    (best, period) => (!best || period.overallPercentage > best.overallPercentage ? period : best),
    null
  );

  // Same "average of the two capped percentages" formula the existing
  // per-period overallPercentage already uses (crm-performance.ts), so
  // the monthly status agrees with how a single period's status is
  // already derived.
  const monthlyOverallPercentage = Math.round((Math.min(100, sentPercentage) + Math.min(100, receivedPercentage)) / 2);
  const monthlyTier = crmPerformanceTier(monthlyOverallPercentage);

  return {
    year,
    month,
    monthLabel: crmMonthLabel(year, month),
    periodsStarted,
    completedPeriodsCount,
    totalSent,
    sentGoal,
    sentPercentage,
    remainingSent,
    totalReceived,
    receivedGoal,
    receivedPercentage,
    remainingReceived,
    averageSentPerPeriod,
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
