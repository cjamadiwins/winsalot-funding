// Shared, pure Leave Requests logic used by both the Cleaning CRM
// (crm_leave_requests) and the Lead Generation CRM (leadgen_leave_requests,
// migrations 0069/0070). The two tables are entirely separate (separate
// agent pools, separate RLS), but the policy text, notice-period math, and
// deduction calculation are identical, so they live here once instead of
// being duplicated per CRM - same pattern as src/lib/payroll.ts.

import { dailyRate, weekdaysInRange } from "./payroll";

export type LeaveType = "planned" | "emergency";
export type LeaveStatus = "pending" | "approved" | "declined";
export type LeaveAttendanceStatus = "none" | "paid_leave" | "unpaid_absence";

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  planned: "Planned Leave",
  emergency: "Emergency Leave",
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
};

export const LEAVE_STATUS_STYLES: Record<LeaveStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  declined: "bg-rose-100 text-rose-800",
};

export const LEAVE_ATTENDANCE_STATUS_LABELS: Record<LeaveAttendanceStatus, string> = {
  none: "Not marked",
  paid_leave: "Paid Leave",
  unpaid_absence: "Unapproved Absence — Unpaid",
};

// The minimum number of days' advance notice a Planned Leave request must
// give to avoid the Short Notice flag - "Planned leave must be requested
// at least seven days in advance."
export const REQUIRED_PLANNED_NOTICE_DAYS = 7;

// Exact policy copy from the spec, shown at the top of every Leave
// Requests page (agent and admin, both CRMs) - kept here once so it can
// never drift between the four places it's rendered.
export const LEAVE_POLICY_TITLE = "Leave and Attendance Policy";
export const LEAVE_POLICY_BODY =
  "Approved leave is paid. Planned leave must be requested at least seven days in advance and approved by management. Emergency leave may be approved afterward at management's discretion. Absences without approval are unpaid.";

function parseIsoDateUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Whole calendar days between the date a request is submitted and the
// requested start date (e.g. submitted the 1st for a start date of the
// 8th is 7 days' notice). `submittedAtIso` is a full timestamp; only its
// calendar date matters here, same date-only comparison payroll.ts uses
// for weekday/pay-period math.
export function computeNoticeDays(submittedAtIso: string, startDateIso: string): number {
  const submittedDateIso = submittedAtIso.slice(0, 10);
  const submitted = parseIsoDateUtc(submittedDateIso);
  const start = parseIsoDateUtc(startDateIso);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((start.getTime() - submitted.getTime()) / msPerDay);
}

// "Short Notice" only ever applies to Planned Leave - Emergency Leave is,
// by definition, requested without seven days' notice and is judged on
// management's discretion instead (spec: "Emergency leave may be
// approved afterward at management's discretion").
export function isShortNotice(leaveType: LeaveType, noticeDays: number): boolean {
  return leaveType === "planned" && noticeDays < REQUIRED_PLANNED_NOTICE_DAYS;
}

// The payroll deduction for an unpaid absence: scheduled working days
// (Mon-Fri) within the leave's date range, at the agent's own current
// daily rate - "Calculate the daily rate as: salary for the pay period ÷
// scheduled working days in that pay period," never a hard-coded figure.
// Rounded to the nearest cent, matching calculateBasePayEarned.
export function calculateLeaveDeductionAmount(
  startDate: string,
  endDate: string,
  standardBiweeklyPay: number,
  standardWorkingDays: number
): { amount: number; scheduledDays: number } {
  const scheduledDays = weekdaysInRange(startDate, endDate).length;
  const rate = dailyRate(standardBiweeklyPay, standardWorkingDays);
  return { amount: Math.round(scheduledDays * rate * 100) / 100, scheduledDays };
}

// Scheduled (Mon-Fri) working days an approved leave request covers -
// the count added to a payroll record's approved_paid_days when the
// paid-leave attendance marking is applied to payroll.
export function countScheduledLeaveDays(startDate: string, endDate: string): number {
  return weekdaysInRange(startDate, endDate).length;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "September 4–7, 2026" (same month/year, en dash - matches the spec's
// own example verbatim) / "September 30 - October 2, 2026" (crosses
// months) / "December 30, 2026 - January 2, 2027" (crosses years) /
// "September 4, 2026" (single day) - used verbatim in every
// notification message this feature sends ("submitted a leave request
// for ...", "Your leave request for ... was approved").
export function formatLeaveDateRangeLabel(startDate: string, endDate: string): string {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

  if (startDate === endDate) {
    return `${MONTH_NAMES[startMonth - 1]} ${startDay}, ${startYear}`;
  }
  if (startYear === endYear && startMonth === endMonth) {
    return `${MONTH_NAMES[startMonth - 1]} ${startDay}–${endDay}, ${startYear}`;
  }
  if (startYear === endYear) {
    return `${MONTH_NAMES[startMonth - 1]} ${startDay} - ${MONTH_NAMES[endMonth - 1]} ${endDay}, ${startYear}`;
  }
  return `${MONTH_NAMES[startMonth - 1]} ${startDay}, ${startYear} - ${MONTH_NAMES[endMonth - 1]} ${endDay}, ${endYear}`;
}

export type LeaveRequestAuditAction =
  | "submitted"
  | "approved"
  | "declined"
  | "attendance_marked_paid_leave"
  | "attendance_marked_unpaid_absence"
  | "deduction_confirmed"
  | "payroll_applied";

export const LEAVE_AUDIT_ACTION_LABELS: Record<LeaveRequestAuditAction, string> = {
  submitted: "Request submitted",
  approved: "Request approved",
  declined: "Request declined",
  attendance_marked_paid_leave: "Marked Paid Leave",
  attendance_marked_unpaid_absence: "Marked Unapproved Absence — Unpaid",
  deduction_confirmed: "Deduction confirmed",
  payroll_applied: "Applied to payroll",
};
