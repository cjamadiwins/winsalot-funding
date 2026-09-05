// Shared, pure Leave Requests logic used by both the Winsalot Growth CRM
// (crm_leave_requests) and the Lead Generation CRM (leadgen_leave_requests,
// migrations 0069/0070). The two tables are entirely separate (separate
// agent pools, separate RLS), but the policy text, notice-period math, and
// deduction calculation are identical, so they live here once instead of
// being duplicated per CRM - same pattern as src/lib/payroll.ts.

import { dailyRate, hourlyRate, weekdaysInRange } from "./payroll";
import { SCHEDULED_PAID_MINUTES_PER_SHIFT } from "./attendance-pay";

export type LeaveType = "planned" | "emergency";
// Leave Status: management's decision on the time-off request itself,
// independent of whether it's paid - see PayStatus below. This is the
// "two-part leave decision": a request can be Approved + Paid, Approved
// + Unpaid, or Declined, decided as two separate fields rather than one.
export type LeaveStatus = "pending" | "approved" | "declined";
// Pay Status: whether an *approved* leave's workdays are paid. Only ever
// meaningfully Paid/Unpaid once Leave Status is "approved" - a
// pending or declined request has nothing to decide yet and stays
// "pending" (see the DB check constraint requiring exactly this).
export type PayStatus = "pending" | "paid" | "unpaid";
// "none": nothing marked yet (pending, or approved/declined but not yet
// applied to attendance). "paid_leave": Approved + Paid. "unpaid_leave":
// Approved + Unpaid - a genuinely approved absence that just isn't paid,
// distinct from "unpaid_absence": a *declined* request the agent was
// absent for anyway, handled under the pre-existing attendance/absence
// rules this feature never touches.
export type LeaveAttendanceStatus = "none" | "paid_leave" | "unpaid_leave" | "unpaid_absence";

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

export const PAY_STATUS_LABELS: Record<PayStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  unpaid: "Unpaid",
};

export const PAY_STATUS_STYLES: Record<PayStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  unpaid: "bg-orange-100 text-orange-800",
};

export const LEAVE_ATTENDANCE_STATUS_LABELS: Record<LeaveAttendanceStatus, string> = {
  none: "Not marked",
  paid_leave: "Paid Leave",
  unpaid_leave: "Unpaid Leave",
  unpaid_absence: "Unapproved Absence — Unpaid",
};

// The single combined label the agent-facing history shows per the spec's
// own examples ("Approved / Paid", "Approved / Unpaid", "Declined",
// "Pending") - Pay Status is only ever shown alongside an Approved Leave
// Status, since it's the only state where it means anything.
export function formatLeaveDecisionLabel(status: LeaveStatus, payStatus: PayStatus): string {
  if (status === "approved") return `Approved / ${PAY_STATUS_LABELS[payStatus === "pending" ? "pending" : payStatus]}`;
  return LEAVE_STATUS_LABELS[status];
}

// The minimum number of days' advance notice a Planned Leave request must
// give to avoid the Short Notice flag - "Planned leave must be requested
// at least seven days in advance."
export const REQUIRED_PLANNED_NOTICE_DAYS = 7;

// Exact policy copy from the spec, shown at the top of every Leave
// Requests page (agent and admin, both CRMs) - kept here once so it can
// never drift between the four places it's rendered.
//
// The agent page shows the SAME full current policy the admin page does
// (spec: "Replace it with the SAME full current Leave and Attendance
// Policy shown on the admin page"), just split into two paragraphs so the
// existing, useful agent-facing explanation (paragraph 1,
// AGENT_LEAVE_POLICY_BODY) still reads first, followed by the policy's
// notice-period/decline mechanics (paragraph 2, LEAVE_POLICY_NOTICE_BODY) -
// see each agent client component. ADMIN_LEAVE_POLICY_BODY is built by
// concatenating its own lead-in sentences with this same
// LEAVE_POLICY_NOTICE_BODY, so the notice-period wording can never drift
// between the two pages.
export const LEAVE_POLICY_TITLE = "Leave and Attendance Policy";
export const AGENT_LEAVE_POLICY_BODY =
  "Management will review both your request for time off and whether the leave will be paid. Approved leave may be paid or unpaid.";
export const LEAVE_POLICY_NOTICE_BODY =
  "Planned leave should normally be requested at least seven days in advance. Emergency leave may be reviewed afterward at management's discretion. If leave is declined, any absence will be handled under the company's normal attendance and payroll rules.";
export const ADMIN_LEAVE_POLICY_BODY =
  `Leave approval and pay approval are reviewed separately. Approved leave may be paid or unpaid. ${LEAVE_POLICY_NOTICE_BODY}`;

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

// The scheduled paid hours (Mon-Fri weekdays x 7.5 paid hours/day) an
// unpaid absence or unapproved leave request covers - "Unapproved
// absence and unpaid leave must reduce wages," at the same per-minute
// hourly rate every other attendance shortfall is billed at (see
// src/lib/attendance-pay.ts). Approved paid leave never calls this - it
// "counts as paid time and must not reduce wages" instead (see
// countScheduledLeaveDays below).
export function calculateLeaveDeductionHours(startDate: string, endDate: string): number {
  return weekdaysInRange(startDate, endDate).length * (SCHEDULED_PAID_MINUTES_PER_SHIFT / 60);
}

// Hourly-rate counterpart of calculateLeaveDeductionAmount above - the
// payroll deduction for an unpaid absence, at the agent's own internal
// hourly rate (standardBiweeklyWage ÷ standardPaidHours), rounded to the
// nearest cent only at this final step, never per day.
export function calculateLeaveDeductionAmountHourly(
  startDate: string,
  endDate: string,
  standardBiweeklyWage: number,
  standardPaidHours: number
): { amount: number; hours: number; scheduledDays: number } {
  const scheduledDays = weekdaysInRange(startDate, endDate).length;
  const hours = calculateLeaveDeductionHours(startDate, endDate);
  const rate = hourlyRate(standardBiweeklyWage, standardPaidHours);
  return { amount: Math.round(hours * rate * 100) / 100, hours, scheduledDays };
}

// Scheduled (Mon-Fri) working days an approved leave request covers -
// the count added to a payroll record's approved_paid_days when the
// paid-leave attendance marking is applied to payroll.
export function countScheduledLeaveDays(startDate: string, endDate: string): number {
  return weekdaysInRange(startDate, endDate).length;
}

// Hourly-rate counterpart of countScheduledLeaveDays above - the paid
// hours (7.5/day) an approved leave request adds to a payroll record's
// approved_paid_leave_hours when the paid-leave attendance marking is
// applied to payroll.
export function countScheduledLeaveHours(startDate: string, endDate: string): number {
  return calculateLeaveDeductionHours(startDate, endDate);
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
  | "attendance_marked_unpaid_leave"
  | "attendance_marked_unpaid_absence"
  | "deduction_confirmed"
  | "payroll_applied"
  | "edited"
  | "deleted";

export const LEAVE_AUDIT_ACTION_LABELS: Record<LeaveRequestAuditAction, string> = {
  submitted: "Request submitted",
  approved: "Request approved",
  declined: "Request declined",
  attendance_marked_paid_leave: "Marked Paid Leave",
  attendance_marked_unpaid_leave: "Marked Unpaid Leave",
  attendance_marked_unpaid_absence: "Marked Unapproved Absence — Unpaid",
  deduction_confirmed: "Deduction confirmed",
  payroll_applied: "Applied to payroll",
  edited: "Request edited",
  deleted: "Request deleted",
};

// What attendance_status must become when an admin edits a request's
// Leave Status and/or Pay Status (directly, or as a side effect of
// reversing/redeciding it) - "Approved + Paid must remain recorded as
// Paid Leave," "Approved + Unpaid must be recorded as Unpaid Leave,"
// "Declined must not count as approved leave." A request that was never
// attendance-marked (`none`) stays `none` - editing never invents a
// marking that was never made; it only ever keeps an *existing* marking
// truthful to the current decision.
export function reconcileAttendanceStatusForStatusChange(
  oldAttendanceStatus: LeaveAttendanceStatus,
  newStatus: LeaveStatus,
  newPayStatus: PayStatus
): LeaveAttendanceStatus {
  if (oldAttendanceStatus === "none") return "none";
  if (newStatus === "approved") {
    if (newPayStatus === "paid") return "paid_leave";
    if (newPayStatus === "unpaid") return "unpaid_leave";
    return "none"; // approved but pay not yet decided - nothing to record yet
  }
  if (newStatus === "declined") return "unpaid_absence";
  return "none"; // pending - nothing decided, nothing to record yet
}
