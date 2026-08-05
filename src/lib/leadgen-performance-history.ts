// Monthly Performance (Lead Gen CRM): reads the permanent weekly ledger
// (leadgen_agent_weekly_performance, migration 0051) plus the current,
// still-open week (computed live, the same way the existing Agent
// Performance Report does in leadgen-performance.ts) to build a month's
// worth of history. Pure, client-safe - MonthlyPerformanceSection
// renders straight from this file's exports, the same way
// AgentPerformanceCard renders from leadgen-performance.ts. The write
// side (freezing a completed week into that table) is a separate,
// server-only module - leadgen-performance-history-sync.ts - so this
// file can be imported from a "use client" component without pulling in
// service-role code.

import {
  LEADGEN_WEEKLY_APPOINTMENT_TARGET,
  addDays,
  computeLeadgenWeekBookedCount,
  leadgenMondayOf,
  leadgenPerformanceTier,
  type LeadgenPerformanceAppointment,
  type LeadgenPerformanceTier,
} from "./leadgen-performance";

export type LeadgenWeeklyHistoryRow = {
  agent_id: string | null;
  agent_name: string;
  week_start: string;
  week_end: string;
  booked_count: number;
  target: number;
  percentage: number;
  status: LeadgenPerformanceTier;
};

// Where a week sits relative to "today": a week that hasn't started yet
// has no result to judge (brief: "future weekly periods... must not
// display 0% or 'Behind Target'"), so it's never given a green/yellow/red
// tier - only "completed" weeks are. "current" is the one still-open
// week in progress; the UI has its own "In Progress" label for it
// distinct from the completed-week tier labels.
export type LeadgenWeekPeriod = "completed" | "current" | "future";

export type LeadgenWeeklyRecord = {
  weekStart: string; // YYYY-MM-DD, Monday
  weekEnd: string; // YYYY-MM-DD, Sunday
  bookedCount: number;
  target: number;
  percentage: number;
  tier: LeadgenPerformanceTier;
  period: LeadgenWeekPeriod;
  // true = a closed week's permanently saved result (from
  // leadgen_agent_weekly_performance); false = the current, still-open
  // week, computed live from appointments the same way the weekly
  // report's "this week" total is.
  frozen: boolean;
};

export type LeadgenMonthlyPerformance = {
  year: number;
  month: number; // 1-12
  monthLabel: string;
  weeksIncluded: number;
  totalBooked: number;
  monthlyGoal: number;
  percentage: number;
  weeklyAverage: number;
  bestWeek: LeadgenWeeklyRecord | null;
  weeklyBreakdown: LeadgenWeeklyRecord[];
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

export function leadgenMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Every Monday-Sunday week belongs to exactly one month: whichever
// month contains its Monday. That's what the brief's monthly goal
// calculation implies ("...based on the number of Monday-to-Sunday
// reporting weeks included in the selected month") - it partitions all
// weeks with no overlap and no gaps, so a week's total is never counted
// toward two different months.
export function leadgenWeekStartsInMonth(year: number, month: number): string[] {
  const firstOfMonth = `${year}-${pad2(month)}-01`;
  let monday = leadgenMondayOf(firstOfMonth);
  if (monday < firstOfMonth) monday = addDays(monday, 7);

  const weeks: string[] = [];
  while (true) {
    const [weekYear, weekMonth] = monday.split("-").map(Number);
    if (weekYear !== year || weekMonth !== month) break;
    weeks.push(monday);
    monday = addDays(monday, 7);
  }
  return weeks;
}

// Builds one agent's weekly records for a list of week-start dates -
// the frozen ledger row for any already-closed week, or a live
// computation (over the same appointments batch the caller already
// fetched) for the current, still-open week or any week that hasn't
// been frozen yet.
export function buildLeadgenWeeklyRecords(
  weekStarts: string[],
  historyRows: LeadgenWeeklyHistoryRow[],
  appointments: LeadgenPerformanceAppointment[],
  agentId: string,
  currentWeekStart: string
): LeadgenWeeklyRecord[] {
  const historyByWeek = new Map(
    historyRows.filter((row) => row.agent_id === agentId).map((row) => [row.week_start, row] as const)
  );

  return weekStarts.map((weekStart) => {
    const weekEnd = addDays(weekStart, 6);
    const period: LeadgenWeekPeriod = weekStart < currentWeekStart ? "completed" : weekStart === currentWeekStart ? "current" : "future";
    const frozenRow = period === "completed" ? historyByWeek.get(weekStart) : undefined;

    if (frozenRow) {
      return {
        weekStart,
        weekEnd,
        bookedCount: frozenRow.booked_count,
        target: frozenRow.target,
        percentage: frozenRow.percentage,
        tier: frozenRow.status,
        period,
        frozen: true,
      };
    }

    // A future week hasn't started - there is nothing to count yet, so
    // it's always 0 regardless of what's in `appointments` (created_at
    // can never be in the future, but this keeps the "not started" state
    // unambiguous rather than depending on that).
    const bookedCount = period === "future" ? 0 : computeLeadgenWeekBookedCount(appointments, agentId, weekStart, weekEnd);
    const percentage = Math.round((bookedCount / LEADGEN_WEEKLY_APPOINTMENT_TARGET) * 100);
    return {
      weekStart,
      weekEnd,
      bookedCount,
      target: LEADGEN_WEEKLY_APPOINTMENT_TARGET,
      percentage,
      tier: leadgenPerformanceTier(percentage),
      period,
      frozen: false,
    };
  });
}

// weeklyBreakdown covers every Mon-Sun week in the month, including any
// that haven't started yet (period "future") - kept as-is on the
// returned object so the UI can still list/label them. But a week that
// hasn't begun has no result to weigh the month's numbers down with
// (brief: "future weeks must be excluded from the current monthly
// performance percentage, weekly average, and overall monthly status
// until those weeks begin"), so every aggregate below is computed only
// over weeks that have begun (completed or the current in-progress
// week) - otherwise, e.g., picking a month on day one would show a
// misleadingly low percentage/red status purely because most of its
// weeks hadn't started.
export function computeLeadgenMonthlyPerformance(
  year: number,
  month: number,
  weeklyBreakdown: LeadgenWeeklyRecord[]
): LeadgenMonthlyPerformance {
  const begunWeeks = weeklyBreakdown.filter((week) => week.period !== "future");

  const weeksIncluded = begunWeeks.length;
  const totalBooked = begunWeeks.reduce((sum, week) => sum + week.bookedCount, 0);
  const monthlyGoal = LEADGEN_WEEKLY_APPOINTMENT_TARGET * weeksIncluded;
  const percentage = monthlyGoal > 0 ? Math.round((totalBooked / monthlyGoal) * 100) : 0;
  const weeklyAverage = weeksIncluded > 0 ? Math.round((totalBooked / weeksIncluded) * 10) / 10 : 0;
  const bestWeek = begunWeeks.reduce<LeadgenWeeklyRecord | null>(
    (best, week) => (!best || week.bookedCount > best.bookedCount ? week : best),
    null
  );

  return {
    year,
    month,
    monthLabel: leadgenMonthLabel(year, month),
    weeksIncluded,
    totalBooked,
    monthlyGoal,
    percentage,
    weeklyAverage,
    bestWeek,
    weeklyBreakdown,
  };
}

// Inclusive list of {year, month} from one month up to another, walking
// forward - used to build the Monthly History table's row list.
export function leadgenMonthsInRange(
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
