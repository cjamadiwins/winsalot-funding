// Weekly Agent Incentive (Winsalot Growth CRM half): pure, client-safe
// bonus math over a batch of winsalot_appointments records, mirroring
// lib/leadgen-incentives.ts for the Lead Gen CRM exactly. Deliberately
// its own file for the same reason crm-performance.ts is its own file,
// separate from crm-types.ts.
//
// A qualifying event is a consultation appointment an admin has
// reviewed as Qualified (winsalot_appointments.incentive_status,
// migration 0090) - this replaces the incentive's previous qualifying
// event for this CRM, an opportunity closed as Client Won. The CRM's
// product moved from selling cleaning services to booking growth
// consultations, so the incentive now rewards the same behavior the CRM
// is built around: booking qualified appointments, not closing deals.
// A null incentive_status (never reviewed) or any of
// Cancelled/Invalid/Duplicate/Unqualified never counts toward the
// weekly quota - only 'Qualified' does, exactly matching
// isLeadgenIncentiveQualifying.
//
// Week bucketing uses created_at (when the appointment was booked, not
// the appointment's scheduled date) in America/Toronto, Monday-Sunday -
// matching CRM_PERFORMANCE_TIMEZONE (crm-performance.ts) and the same
// "booked this week" bucketing leadgen-incentives.ts uses.

import { addDays, crmDateKey, CRM_PERFORMANCE_TIMEZONE } from "./crm-performance";
import { computeWeeklyIncentiveBonus } from "./agent-incentive-shared";
import { isWinsalotAppointmentCountable, type WinsalotAppointmentIncentiveStatus, type WinsalotAppointmentStatus } from "./winsalot-consultation-types";

export { CRM_PERFORMANCE_TIMEZONE as CRM_INCENTIVE_TIMEZONE };

export type CrmIncentiveAppointment = {
  id: string;
  assignedAgentId: string | null; // winsalot_appointments.assigned_agent_id
  createdAt: string;
  status: WinsalotAppointmentStatus;
  incentiveStatus: WinsalotAppointmentIncentiveStatus | null;
};

export function isCrmAppointmentIncentiveQualifying(status: WinsalotAppointmentIncentiveStatus | null): boolean {
  return status === "Qualified";
}

export type CrmWeeklyIncentive = {
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

// Monday of the calendar week containing dateKey - same algorithm as
// leadgenMondayOf (lib/leadgen-performance.ts), duplicated here rather
// than imported since crm-performance.ts intentionally has no plain
// Monday-Sunday week concept of its own (it anchors 14-day biweekly
// periods to a fixed epoch instead - see BIWEEKLY_EPOCH_MONDAY there).
// The Weekly Incentive brief is explicitly Monday-Sunday, a different
// cadence from that existing biweekly report.
export function crmMondayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(dateKey, diffToMonday);
}

// "Do not count the same appointment twice" (brief) - filters to
// exactly what the given agent was credited with booking (the same
// assigned_agent_id rule the appointment list views use), and excludes
// cancelled appointments (isWinsalotAppointmentCountable) - a cancelled
// appointment can never qualify for an incentive bonus, even if it was
// reviewed as Qualified before it was cancelled.
function creditedTo(appointments: CrmIncentiveAppointment[], agentId: string): CrmIncentiveAppointment[] {
  return appointments.filter((appointment) => appointment.assignedAgentId === agentId && isWinsalotAppointmentCountable(appointment.status));
}

export function computeCrmWeeklyIncentive(
  appointments: CrmIncentiveAppointment[],
  agentId: string,
  weekStart: string,
  weekEnd: string,
  weeklyQuota: number,
  weeklyBonusAmount: number
): CrmWeeklyIncentive {
  const qualifiedCount = creditedTo(appointments, agentId).filter((appointment) => {
    const key = crmDateKey(appointment.createdAt);
    return key >= weekStart && key <= weekEnd && isCrmAppointmentIncentiveQualifying(appointment.incentiveStatus);
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

export function crmCurrentIncentiveWeek(now: Date = new Date()): { weekStart: string; weekEnd: string } {
  const weekStart = crmMondayOf(crmDateKey(now));
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

export type CrmWeeklyRecordCounts = {
  rawCount: number; // every appointment credited to this agent and booked during the week, any review status
  rejectedCount: number; // explicitly reviewed and marked as a non-Qualified value
};

// Admin table's "Raw Total"/"Rejected" columns - purely descriptive
// counts alongside computeCrmWeeklyIncentive's qualifiedCount (the
// "Verified" column); never feeds into the bonus calculation. Bucketed
// the same way as computeCrmWeeklyIncentive (createdAt within the week).
export function computeCrmWeeklyRecordCounts(
  appointments: CrmIncentiveAppointment[],
  agentId: string,
  weekStart: string,
  weekEnd: string
): CrmWeeklyRecordCounts {
  const inWeek = creditedTo(appointments, agentId).filter((appointment) => {
    const key = crmDateKey(appointment.createdAt);
    return key >= weekStart && key <= weekEnd;
  });
  let rejectedCount = 0;
  for (const appointment of inWeek) {
    if (appointment.incentiveStatus !== null && appointment.incentiveStatus !== "Qualified") rejectedCount++;
  }
  return { rawCount: inWeek.length, rejectedCount };
}
