// Agent Performance Report (Lead Gen CRM): pure, client-safe stats over a
// batch of leadgen_appointments rows. Deliberately its own file, not an
// extension of leadgen-types.ts, so this feature's date-bucketing logic
// stays easy to find and doesn't bloat the shared types module - see the
// header comment on leadgen-types.ts for why this CRM's lib files stay
// self-contained.
//
// booking_agent_id (added by supabase/migrations/0050_leadgen_agent_performance.sql)
// is what every count below is keyed on - it's set once, automatically,
// at the moment an appointment is booked, to whichever agent was
// responsible for the lead at that time (see that migration for why).
// A cancelled or replaced appointment (isLeadgenAppointmentCountable,
// leadgen-types.ts) is excluded from every total here, so cancelling or
// replacing one immediately corrects an agent's counts without any
// separate "undo" bookkeeping.

import { isLeadgenAppointmentCountable, type LeadgenAppointmentStatus } from "./leadgen-types";

export const LEADGEN_WEEKLY_APPOINTMENT_TARGET = 4;

// Matches LEADGEN_BOOKING_TIMEZONE (lib/leadgen-booking.ts) - "this week"
// should mean the same calendar week an agent or admin sees on their own
// clock, not whatever timezone the server happens to run in.
export const LEADGEN_PERFORMANCE_TIMEZONE = "America/Toronto";

export type LeadgenPerformanceAppointment = {
  id: string;
  business_name: string;
  contact_name: string | null;
  appointment_date: string;
  appointment_time: string;
  status: LeadgenAppointmentStatus;
  created_at: string;
  booking_agent_id: string | null;
};

export type LeadgenPerformanceDay = {
  date: string; // YYYY-MM-DD
  label: string; // "Mon, Aug 3"
  count: number;
};

export type LeadgenAgentPerformance = {
  agentId: string;
  bookedThisWeek: number;
  target: number;
  percentage: number;
  remainingToTarget: number;
  weekStart: string; // YYYY-MM-DD, Monday
  weekEnd: string; // YYYY-MM-DD, Sunday
  dailyBreakdown: LeadgenPerformanceDay[];
  previousWeekTotal: number;
  monthlyTotal: number;
  appointments: LeadgenPerformanceAppointment[];
};

export type LeadgenPerformanceTier = "green" | "yellow" | "red";

// 70%+ = Green, 40-69% = Yellow, 0-39% = Red. Drives the percentage badge,
// progress bar, and performance status label together so the three never
// show conflicting colors for the same agent.
export function leadgenPerformanceTier(percentage: number): LeadgenPerformanceTier {
  if (percentage >= 70) return "green";
  if (percentage >= 40) return "yellow";
  return "red";
}

export const LEADGEN_PERFORMANCE_TIER_LABEL: Record<LeadgenPerformanceTier, string> = {
  green: "On Track",
  yellow: "Needs Improvement",
  red: "Behind Target",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD" calendar date a timestamp falls on in
// LEADGEN_PERFORMANCE_TIMEZONE.
export function leadgenDateKey(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LEADGEN_PERFORMANCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

// Monday of the calendar week containing dateKey - the report's week
// always starts Monday and resets there (brief: "Reset the weekly count
// every Monday").
export function leadgenMondayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(dateKey, diffToMonday);
}

function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function leadgenWeekRangeLabel(weekStart: string, weekEnd: string): string {
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = weekEnd.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = new Date(ey, em - 1, ed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${start} – ${end}`;
}

// Computes one agent's full performance snapshot from a shared batch of
// appointments (the caller fetches once and calls this per agent, rather
// than one query per agent). `now` is only ever overridden by tests -
// production callers always use the default (real "now").
export function computeLeadgenAgentPerformance(
  appointments: LeadgenPerformanceAppointment[],
  agentId: string,
  now: Date = new Date()
): LeadgenAgentPerformance {
  const todayKey = leadgenDateKey(now);
  const weekStart = leadgenMondayOf(todayKey);
  const weekEnd = addDays(weekStart, 6);
  const previousWeekStart = addDays(weekStart, -7);
  const previousWeekEnd = addDays(weekStart, -1);
  const monthPrefix = todayKey.slice(0, 7); // YYYY-MM

  const dailyCounts = new Map<string, number>();
  for (let i = 0; i < 7; i++) dailyCounts.set(addDays(weekStart, i), 0);

  let bookedThisWeek = 0;
  let previousWeekTotal = 0;
  let monthlyTotal = 0;

  // "Do not count the same appointment twice" - each row is credited to
  // at most one agent (booking_agent_id), so a simple filter here can
  // never double-count an appointment across two agents' reports.
  const credited = appointments.filter((appt) => appt.booking_agent_id === agentId && isLeadgenAppointmentCountable(appt.status));

  for (const appt of credited) {
    const key = leadgenDateKey(appt.created_at);
    if (key >= weekStart && key <= weekEnd) {
      bookedThisWeek++;
      dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
    } else if (key >= previousWeekStart && key <= previousWeekEnd) {
      previousWeekTotal++;
    }
    if (key.slice(0, 7) === monthPrefix) monthlyTotal++;
  }

  const dailyBreakdown: LeadgenPerformanceDay[] = Array.from(dailyCounts.entries()).map(([date, count]) => ({
    date,
    label: dayLabel(date),
    count,
  }));

  const sortedAppointments = [...credited].sort((a, b) => {
    if (a.appointment_date !== b.appointment_date) return a.appointment_date < b.appointment_date ? 1 : -1;
    return a.appointment_time < b.appointment_time ? 1 : a.appointment_time > b.appointment_time ? -1 : 0;
  });

  return {
    agentId,
    bookedThisWeek,
    target: LEADGEN_WEEKLY_APPOINTMENT_TARGET,
    percentage: Math.round((bookedThisWeek / LEADGEN_WEEKLY_APPOINTMENT_TARGET) * 100),
    remainingToTarget: Math.max(0, LEADGEN_WEEKLY_APPOINTMENT_TARGET - bookedThisWeek),
    weekStart,
    weekEnd,
    dailyBreakdown,
    previousWeekTotal,
    monthlyTotal,
    appointments: sortedAppointments,
  };
}

// Same "credited to this agent" rule as computeLeadgenAgentPerformance
// above (booking_agent_id match, isLeadgenAppointmentCountable) - pulled out so
// the Monthly Performance history (leadgen-performance-history.ts) can
// count an arbitrary Monday-Sunday week the same way the live weekly
// report does, without duplicating or drifting from this filter.
export function leadgenCreditedAppointments(
  appointments: LeadgenPerformanceAppointment[],
  agentId: string
): LeadgenPerformanceAppointment[] {
  return appointments.filter((appt) => appt.booking_agent_id === agentId && isLeadgenAppointmentCountable(appt.status));
}

// Count of an agent's valid (credited, countable) appointments whose
// created_at - the same "booked on" date the live weekly report buckets
// by - falls within [weekStart, weekEnd] (inclusive, both YYYY-MM-DD).
export function computeLeadgenWeekBookedCount(
  appointments: LeadgenPerformanceAppointment[],
  agentId: string,
  weekStart: string,
  weekEnd: string
): number {
  return leadgenCreditedAppointments(appointments, agentId).filter((appt) => {
    const key = leadgenDateKey(appt.created_at);
    return key >= weekStart && key <= weekEnd;
  }).length;
}
