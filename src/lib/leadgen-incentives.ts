// Weekly Agent Incentive (Lead Gen CRM half): pure, client-safe bonus
// math over a batch of leadgen_appointments rows, mirroring the existing
// Agent Performance Report's split (lib/leadgen-performance.ts computes;
// the pages fetch and pass the batch in). Deliberately its own file for
// the same reason leadgen-performance.ts is its own file - this
// feature's qualification/bonus math stays easy to find and test in
// isolation. The flat weekly-bonus math itself lives in the CRM-agnostic
// lib/agent-incentive-shared.ts, shared with the Cleaning CRM's
// lib/crm-incentives.ts so both sides can never compute a "quota met"
// bonus differently.
//
// Every count here is gated by leadgen_appointments.incentive_status
// (migration 0057), an admin-only review field entirely separate from
// the scheduling `status` column - see that migration's header comment.
// An appointment only ever counts once, toward at most one agent, via
// booking_agent_id (migration 0050) - the exact same "credited agent"
// rule the existing performance report uses, so the two features can
// never disagree about who booked what.
//
// Week bucketing intentionally reuses leadgen-performance.ts's helpers
// (leadgenDateKey/leadgenMondayOf/addDays, America/Toronto, Monday-
// Sunday) rather than redefining them, so "this week" always means the
// exact same calendar week in both features.

import { addDays, leadgenDateKey, leadgenMondayOf, type LeadgenPerformanceAppointment } from "./leadgen-performance";
import { computeWeeklyIncentiveBonus } from "./agent-incentive-shared";
import { isLeadgenAppointmentCountable, type LeadgenAppointmentIncentiveStatus } from "./leadgen-types";

export type LeadgenIncentiveAppointment = Pick<LeadgenPerformanceAppointment, "id" | "created_at" | "booking_agent_id" | "status"> & {
  incentive_status: LeadgenAppointmentIncentiveStatus | null;
};

// A null incentive_status (never reviewed) or any of Cancelled/Invalid/
// Duplicate/Unqualified never counts toward the weekly quota (brief).
// Only 'Qualified' does.
export function isLeadgenIncentiveQualifying(status: LeadgenAppointmentIncentiveStatus | null): boolean {
  return status === "Qualified";
}

export type LeadgenWeeklyIncentive = {
  agentId: string;
  weekStart: string; // YYYY-MM-DD, Monday
  weekEnd: string; // YYYY-MM-DD, Sunday
  qualifiedCount: number;
  quota: number;
  quotaMet: boolean;
  remainingToQuota: number;
  percentage: number; // toward the weekly quota, capped at 100
  calculatedBonus: number;
};

// "Do not count the same appointment twice" (brief) - filters to exactly
// what the given agent was credited with booking, the same
// booking_agent_id rule computeLeadgenAgentPerformance uses, so this
// feature's counts can never drift from the Agent Performance Report's.
// Also excludes Cancelled/Replaced appointments (isLeadgenAppointmentCountable,
// leadgen-types.ts) - a corrected or cancelled appointment can never
// qualify for an incentive bonus, even if it was reviewed as "Qualified"
// before the correction happened.
function creditedTo(appointments: LeadgenIncentiveAppointment[], agentId: string): LeadgenIncentiveAppointment[] {
  return appointments.filter((appt) => appt.booking_agent_id === agentId && isLeadgenAppointmentCountable(appt.status));
}

// One agent's weekly incentive snapshot for [weekStart, weekEnd]
// (inclusive, both YYYY-MM-DD), bucketed by created_at - "qualified
// appointments booked this week" (brief), matching how the existing
// weekly performance report buckets "booked this week".
export function computeLeadgenWeeklyIncentive(
  appointments: LeadgenIncentiveAppointment[],
  agentId: string,
  weekStart: string,
  weekEnd: string,
  weeklyQuota: number,
  weeklyBonusAmount: number
): LeadgenWeeklyIncentive {
  const qualifiedCount = creditedTo(appointments, agentId).filter((appt) => {
    const key = leadgenDateKey(appt.created_at);
    return key >= weekStart && key <= weekEnd && isLeadgenIncentiveQualifying(appt.incentive_status);
  }).length;

  const { quotaMet, calculatedBonus } = computeWeeklyIncentiveBonus(qualifiedCount, weeklyQuota, weeklyBonusAmount);

  return {
    agentId,
    weekStart,
    weekEnd,
    qualifiedCount,
    quota: weeklyQuota,
    quotaMet,
    remainingToQuota: Math.max(0, weeklyQuota - qualifiedCount),
    percentage: Math.min(100, Math.round((qualifiedCount / weeklyQuota) * 100)),
    calculatedBonus,
  };
}

// Current Monday-Sunday week containing `now`, in the same
// America/Toronto calendar the rest of this CRM's reporting uses.
export function leadgenCurrentIncentiveWeek(now: Date = new Date()): { weekStart: string; weekEnd: string } {
  const weekStart = leadgenMondayOf(leadgenDateKey(now));
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

export type LeadgenWeeklyRecordCounts = {
  rawCount: number; // every appointment credited to this agent in the week, any review status
  rejectedCount: number; // explicitly reviewed and marked as a non-Qualified value
};

// Admin table's "Raw Total"/"Rejected" columns - purely descriptive
// counts alongside computeLeadgenWeeklyIncentive's qualifiedCount
// (the "Verified" column); never feeds into the bonus calculation.
export function computeLeadgenWeeklyRecordCounts(
  appointments: LeadgenIncentiveAppointment[],
  agentId: string,
  weekStart: string,
  weekEnd: string
): LeadgenWeeklyRecordCounts {
  const inWeek = creditedTo(appointments, agentId).filter((appt) => {
    const key = leadgenDateKey(appt.created_at);
    return key >= weekStart && key <= weekEnd;
  });
  let rejectedCount = 0;
  for (const appt of inWeek) {
    if (appt.incentive_status !== null && appt.incentive_status !== "Qualified") rejectedCount++;
  }
  return { rawCount: inWeek.length, rejectedCount };
}
