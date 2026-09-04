// Holiday Pay: shared types and pure calculation logic for the holiday
// calendar/assignment feature used by both CRMs' payroll areas. See
// supabase/migrations/0106_holiday_pay.sql for the schema this mirrors -
// holidays and holiday_pay_assignments are single shared tables (not
// duplicated per CRM), unlike crm_payroll/leadgen_payroll.

import { STANDARD_BIWEEKLY_WAGE, STANDARD_WORKING_DAYS, dailyRate } from "./payroll";

// The one currency Winsalot Corp actually pays agents in today, in both
// CRMs (see payroll.ts's formatNgn - the same NGN formatting is shared,
// unconditionally, by crm_payroll and leadgen_payroll). A holiday's
// jurisdiction (e.g. "Canada/Ontario", which calendar it follows) is
// independent of this - Winsalot can observe an Ontario statutory holiday
// while still paying every agent's holiday pay in NGN, because that's
// their payroll currency, not the jurisdiction's. Not admin-editable per
// holiday - see createHolidayAction/updateHolidayAction, which always
// write this constant regardless of what a form submits.
export const HOLIDAY_PAY_CURRENCY = "NGN" as const;

export const HOLIDAY_PAYMENT_TYPES = ["regular_paid_day", "fixed_amount", "percentage_premium", "unpaid"] as const;

export type HolidayPaymentType = (typeof HOLIDAY_PAYMENT_TYPES)[number];

export const HOLIDAY_PAYMENT_TYPE_LABELS: Record<HolidayPaymentType, string> = {
  regular_paid_day: "Regular paid day",
  fixed_amount: "Fixed holiday amount",
  percentage_premium: "Percentage premium",
  unpaid: "Unpaid holiday",
};

export type HolidayRow = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  holiday_date: string;
  jurisdiction: string;
  description: string | null;
  payment_type: HolidayPaymentType;
  amount: number | null;
  percentage: number | null;
  currency: string;
  payroll_period_payday: string | null;
  eligibility_notes: string | null;
  is_active: boolean;
  created_by_crm_user: string | null;
  created_by_leadgen_user: string | null;
  deleted_at: string | null;
  deleted_by_crm_user: string | null;
  deleted_by_leadgen_user: string | null;
};

export type HolidayAssignmentStatus = "assigned" | "cancelled";

export type HolidayPayAssignmentRow = {
  id: string;
  created_at: string;
  updated_at: string;
  holiday_id: string;
  crm_user_id: string | null;
  leadgen_user_id: string | null;
  shared_identity_key: string;
  calculated_amount: number;
  override_amount: number | null;
  override_reason: string | null;
  effective_amount: number;
  status: HolidayAssignmentStatus;
  assigned_by_crm_user: string | null;
  assigned_by_leadgen_user: string | null;
};

export type HolidayPayAssignmentWithHoliday = HolidayPayAssignmentRow & {
  holidays: HolidayRow | null;
};

export type HolidayPayAuditAction =
  | "holiday_created"
  | "holiday_updated"
  | "holiday_deactivated"
  | "holiday_reactivated"
  | "holiday_deleted"
  | "agent_assigned"
  | "assignment_removed"
  | "amount_overridden";

export const HOLIDAY_PAY_AUDIT_ACTION_LABELS: Record<HolidayPayAuditAction, string> = {
  holiday_created: "Holiday created",
  holiday_updated: "Holiday updated",
  holiday_deactivated: "Holiday deactivated",
  holiday_reactivated: "Holiday reactivated",
  holiday_deleted: "Holiday deleted",
  agent_assigned: "Agent assigned",
  assignment_removed: "Assignment removed",
  amount_overridden: "Amount overridden",
};

export type HolidayPayAuditLogRow = {
  id: string;
  created_at: string;
  holiday_id: string | null;
  assignment_id: string | null;
  action: HolidayPayAuditAction;
  performed_by_crm_user: string | null;
  performed_by_leadgen_user: string | null;
  performed_by_name: string;
  reason: string | null;
  details: Record<string, unknown> | null;
};

// Which CRM a given assignment belongs to - exactly one of crm_user_id /
// leadgen_user_id is ever set (enforced by the migration's check
// constraint), never both.
export function assignmentCrm(row: Pick<HolidayPayAssignmentRow, "crm_user_id" | "leadgen_user_id">): "growth" | "leadgen" {
  return row.crm_user_id ? "growth" : "leadgen";
}

// The one piece of information that can identify "the same real person"
// across the two otherwise-unlinked crm_users/leadgen_users tables - see
// the migration's header comment. Always lower-cased/trimmed so two
// differently-cased emails for the same mailbox still match.
export function sharedIdentityKeyForEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Pure calculation of a holiday's baseline pay amount before any
// per-agent override. Independent of any specific payroll record's
// numbers - deliberately uses the standard biweekly wage/working-day
// constants (the same ones every new payroll record defaults to), since
// an assignment is created before a payroll record for that period may
// even exist. An admin can always override the result with a required
// explanation (holiday_pay_assignments.override_amount/override_reason)
// if a specific agent's real pay structure differs.
export function calculateHolidayPayAmount(
  paymentType: HolidayPaymentType,
  amount: number | null,
  percentage: number | null
): number {
  const standardDailyRate = dailyRate(STANDARD_BIWEEKLY_WAGE, STANDARD_WORKING_DAYS);
  switch (paymentType) {
    case "unpaid":
      return 0;
    case "fixed_amount":
      return Math.max(0, amount ?? 0);
    case "percentage_premium":
      return Math.round(standardDailyRate * (Math.max(0, percentage ?? 0) / 100) * 100) / 100;
    case "regular_paid_day":
    default:
      return standardDailyRate;
  }
}

export function isHolidayActive(holiday: Pick<HolidayRow, "is_active" | "deleted_at">): boolean {
  return holiday.is_active && !holiday.deleted_at;
}

export function isAssignmentActive(assignment: Pick<HolidayPayAssignmentRow, "status">): boolean {
  return assignment.status === "assigned";
}
