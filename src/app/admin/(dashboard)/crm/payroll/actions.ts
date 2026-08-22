"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { AgentAttendanceRow, CrmUserRow } from "@/lib/crm-types";
import {
  attendanceDateKey,
  buildPayPeriodAttendanceSummary,
  buildPayPeriodHourlySummary,
  type PayPeriodAttendanceSummary,
  type PayPeriodHourlySummary,
} from "@/lib/crm-attendance-report";
import {
  buildPayrollAdjustmentAuditRows,
  getPayPeriodForPayday,
  STANDARD_BIWEEKLY_PAY,
  STANDARD_BIWEEKLY_WAGE,
  STANDARD_PAID_HOURS,
  STANDARD_WORKING_DAYS,
  type PayrollAdjustableFields,
  type PayrollAuditAction,
} from "@/lib/payroll";

// Every action below returns { error } instead of throwing, matching the
// pattern in crm/training/actions.ts - Next.js redacts thrown Server
// Action errors to a generic message in production.
type ActionResult = { error?: string };

function performedByName(admin: CrmUserRow): string {
  return admin.full_name || admin.email;
}

async function insertAuditRow(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  params: {
    payrollId: string;
    agentId: string;
    action: PayrollAuditAction;
    admin: CrmUserRow;
    reason: string | null;
    details: Record<string, unknown> | null;
  }
) {
  await supabase.from("crm_payroll_audit_log").insert({
    payroll_id: params.payrollId,
    agent_id: params.agentId,
    action: params.action,
    performed_by: params.admin.id,
    performed_by_name: performedByName(params.admin),
    reason: params.reason,
    details: params.details,
  });
}

function parseNonNegativeInt(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || String(raw).trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

function parseNonNegativeAmount(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || String(raw).trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

// Attendance-derived suggestion for the "Load Attendance" step of the
// admin's Draft form - never writes anything, purely a read used to
// pre-fill days_present/flagged sessions before the admin reviews and
// (optionally) overrides them.
export async function loadAttendanceSummaryAction(
  agentId: string,
  payday: string
): Promise<{ error?: string; summary?: PayPeriodAttendanceSummary; hourlySummary?: PayPeriodHourlySummary }> {
  await requireCrmAdmin();

  if (!agentId || !payday) return { error: "Agent and payday are required." };

  const { start, end } = getPayPeriodForPayday(payday);
  const supabase = await createSupabaseServerClient();

  // Padded by a day on each side so a clock-in near the UTC/Toronto day
  // boundary is never missed by this raw timestamp filter - the actual
  // per-day bucketing (and therefore the padding rows' exclusion) happens
  // in buildPayPeriodAttendanceSummary via the Toronto-timezone date key.
  const paddedStart = new Date(`${start}T00:00:00.000Z`);
  paddedStart.setUTCDate(paddedStart.getUTCDate() - 1);
  const paddedEnd = new Date(`${end}T23:59:59.999Z`);
  paddedEnd.setUTCDate(paddedEnd.getUTCDate() + 1);

  const [{ data, error }, { data: agentRow, error: agentError }] = await Promise.all([
    supabase
      .from("agent_attendance")
      .select("*")
      .eq("agent_id", agentId)
      .gte("clock_in", paddedStart.toISOString())
      .lte("clock_in", paddedEnd.toISOString())
      .order("clock_in", { ascending: true }),
    supabase.from("crm_users").select("scheduled_start_time").eq("id", agentId).maybeSingle(),
  ]);

  if (error) return { error: `Failed to load attendance: ${error.message}` };
  if (agentError) return { error: `Failed to load agent: ${agentError.message}` };

  const todayKey = attendanceDateKey(new Date().toISOString());
  const rows = (data ?? []) as AgentAttendanceRow[];
  const summary = buildPayPeriodAttendanceSummary(rows, start, end, todayKey);
  const hourlySummary = buildPayPeriodHourlySummary(
    rows,
    start,
    end,
    todayKey,
    agentRow?.scheduled_start_time ?? null
  );
  return { summary, hourlySummary };
}

export async function createPayrollAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();

  const agentId = String(formData.get("agent_id") ?? "").trim();
  const payday = String(formData.get("payday") ?? "").trim();
  const standardBiweeklyPay = parseNonNegativeAmount(formData, "standard_biweekly_pay") || STANDARD_BIWEEKLY_PAY;
  const standardWorkingDays = parseNonNegativeInt(formData, "standard_working_days") || STANDARD_WORKING_DAYS;
  const standardBiweeklyWage = parseNonNegativeAmount(formData, "standard_biweekly_wage") ?? STANDARD_BIWEEKLY_WAGE;
  const standardPaidHours = parseNonNegativeAmount(formData, "standard_paid_hours") || STANDARD_PAID_HOURS;
  const daysPresent = parseNonNegativeInt(formData, "days_present");
  const approvedPaidDays = parseNonNegativeInt(formData, "approved_paid_days");
  const unpaidAbsenceDays = parseNonNegativeInt(formData, "unpaid_absence_days");
  const regularPaidHours = parseNonNegativeAmount(formData, "regular_paid_hours");
  const unpaidHours = parseNonNegativeAmount(formData, "unpaid_hours");
  const approvedPaidLeaveHours = parseNonNegativeAmount(formData, "approved_paid_leave_hours");
  const internetAllowance = parseNonNegativeAmount(formData, "internet_allowance");
  const bonusCommission = parseNonNegativeAmount(formData, "bonus_commission");
  const otherAdditions = parseNonNegativeAmount(formData, "other_additions");
  const deductions = parseNonNegativeAmount(formData, "deductions");
  const adminNotes = String(formData.get("admin_notes") ?? "").trim() || null;
  const adjustmentReason = String(formData.get("adjustment_reason") ?? "").trim();

  if (!agentId || !payday) {
    return { error: "Agent and payday are required." };
  }
  if (
    daysPresent === null ||
    approvedPaidDays === null ||
    unpaidAbsenceDays === null ||
    regularPaidHours === null ||
    unpaidHours === null ||
    approvedPaidLeaveHours === null ||
    internetAllowance === null ||
    bonusCommission === null ||
    otherAdditions === null ||
    deductions === null
  ) {
    return { error: "Amounts and day/hour counts must be zero or a positive number." };
  }
  if (!adjustmentReason) {
    return { error: "A reason is required for this payroll entry." };
  }

  const totalPayableDays = daysPresent + approvedPaidDays;
  // Gross wage earnings: the full standard biweekly wage - every
  // shortfall (absence, late arrival, early departure, excess break
  // time) is captured in `deductions` instead (see
  // src/lib/attendance-pay.ts), never by shrinking this figure itself.
  const basePayEarned = Math.round(standardBiweeklyWage * 100) / 100;
  const { start, end } = getPayPeriodForPayday(payday);

  const supabase = await createSupabaseServerClient();
  const { data: inserted, error } = await supabase
    .from("crm_payroll")
    .insert({
      agent_id: agentId,
      pay_period_start: start,
      pay_period_end: end,
      payday,
      status: "draft",
      standard_biweekly_pay: standardBiweeklyPay,
      standard_working_days: standardWorkingDays,
      standard_biweekly_wage: standardBiweeklyWage,
      standard_paid_hours: standardPaidHours,
      days_present: daysPresent,
      approved_paid_days: approvedPaidDays,
      unpaid_absence_days: unpaidAbsenceDays,
      total_payable_days: totalPayableDays,
      regular_paid_hours: regularPaidHours,
      unpaid_hours: unpaidHours,
      approved_paid_leave_hours: approvedPaidLeaveHours,
      base_pay_earned: basePayEarned,
      internet_allowance: internetAllowance,
      bonus_commission: bonusCommission,
      other_additions: otherAdditions,
      deductions,
      admin_notes: adminNotes,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    if (error?.code === "23505") {
      return { error: "A payroll record for this agent and payday already exists." };
    }
    return { error: `Failed to save the payroll record: ${error?.message ?? "unknown error"}` };
  }

  await insertAuditRow(supabase, {
    payrollId: inserted.id,
    agentId,
    action: "created",
    admin,
    reason: adjustmentReason,
    details: {
      days_present: daysPresent,
      approved_paid_days: approvedPaidDays,
      unpaid_absence_days: unpaidAbsenceDays,
      total_payable_days: totalPayableDays,
      regular_paid_hours: regularPaidHours,
      unpaid_hours: unpaidHours,
      approved_paid_leave_hours: approvedPaidLeaveHours,
      base_pay_earned: basePayEarned,
      bonus_commission: bonusCommission,
      other_additions: otherAdditions,
      deductions,
    },
  });

  revalidatePath("/admin/crm/payroll");
  revalidatePath("/agent/pay");
  return {};
}

export async function updatePayrollAction(recordId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("crm_payroll")
    .select("*")
    .eq("id", recordId)
    .single();

  if (fetchError || !existing) {
    return { error: "Payroll record not found." };
  }
  if (existing.status === "paid") {
    return { error: "Paid records can't be edited directly. Reopen the record first." };
  }
  if (existing.status === "cancelled") {
    return { error: "Cancelled records can't be edited." };
  }
  if (existing.status === "approved" && formData.get("confirm_approved_edit") !== "true") {
    return { error: "Confirm you want to change this Approved record before saving." };
  }

  const payday = String(formData.get("payday") ?? "").trim();
  const standardBiweeklyPay = parseNonNegativeAmount(formData, "standard_biweekly_pay") || STANDARD_BIWEEKLY_PAY;
  const standardWorkingDays = parseNonNegativeInt(formData, "standard_working_days") || STANDARD_WORKING_DAYS;
  const standardBiweeklyWage = parseNonNegativeAmount(formData, "standard_biweekly_wage") ?? STANDARD_BIWEEKLY_WAGE;
  const standardPaidHours = parseNonNegativeAmount(formData, "standard_paid_hours") || STANDARD_PAID_HOURS;
  const daysPresent = parseNonNegativeInt(formData, "days_present");
  const approvedPaidDays = parseNonNegativeInt(formData, "approved_paid_days");
  const unpaidAbsenceDays = parseNonNegativeInt(formData, "unpaid_absence_days");
  const regularPaidHours = parseNonNegativeAmount(formData, "regular_paid_hours");
  const unpaidHours = parseNonNegativeAmount(formData, "unpaid_hours");
  const approvedPaidLeaveHours = parseNonNegativeAmount(formData, "approved_paid_leave_hours");
  const internetAllowance = parseNonNegativeAmount(formData, "internet_allowance");
  const bonusCommission = parseNonNegativeAmount(formData, "bonus_commission");
  const otherAdditions = parseNonNegativeAmount(formData, "other_additions");
  const deductions = parseNonNegativeAmount(formData, "deductions");
  const adminNotes = String(formData.get("admin_notes") ?? "").trim() || null;
  const adjustmentReason = String(formData.get("adjustment_reason") ?? "").trim();

  if (!payday) {
    return { error: "Payday is required." };
  }
  if (
    daysPresent === null ||
    approvedPaidDays === null ||
    unpaidAbsenceDays === null ||
    regularPaidHours === null ||
    unpaidHours === null ||
    approvedPaidLeaveHours === null ||
    internetAllowance === null ||
    bonusCommission === null ||
    otherAdditions === null ||
    deductions === null
  ) {
    return { error: "Amounts and day/hour counts must be zero or a positive number." };
  }
  if (!adjustmentReason) {
    return { error: "A reason is required for this payroll adjustment." };
  }

  const totalPayableDays = daysPresent + approvedPaidDays;
  const basePayEarned = Math.round(standardBiweeklyWage * 100) / 100;
  const { start, end } = getPayPeriodForPayday(payday);

  const { error } = await supabase
    .from("crm_payroll")
    .update({
      pay_period_start: start,
      pay_period_end: end,
      payday,
      standard_biweekly_pay: standardBiweeklyPay,
      standard_working_days: standardWorkingDays,
      standard_biweekly_wage: standardBiweeklyWage,
      standard_paid_hours: standardPaidHours,
      days_present: daysPresent,
      approved_paid_days: approvedPaidDays,
      unpaid_absence_days: unpaidAbsenceDays,
      total_payable_days: totalPayableDays,
      regular_paid_hours: regularPaidHours,
      unpaid_hours: unpaidHours,
      approved_paid_leave_hours: approvedPaidLeaveHours,
      base_pay_earned: basePayEarned,
      internet_allowance: internetAllowance,
      bonus_commission: bonusCommission,
      other_additions: otherAdditions,
      deductions,
      admin_notes: adminNotes,
    })
    .eq("id", recordId);

  if (error) {
    if (error.code === "23505") {
      return { error: "A payroll record for this agent and payday already exists." };
    }
    return { error: `Failed to update the payroll record: ${error.message}` };
  }

  const before: PayrollAdjustableFields = {
    days_present: existing.days_present,
    approved_paid_days: existing.approved_paid_days,
    unpaid_absence_days: existing.unpaid_absence_days,
    total_payable_days: existing.total_payable_days,
    regular_paid_hours: existing.regular_paid_hours,
    unpaid_hours: existing.unpaid_hours,
    approved_paid_leave_hours: existing.approved_paid_leave_hours,
    bonus_commission: existing.bonus_commission,
    other_additions: existing.other_additions,
    internet_allowance: existing.internet_allowance,
    deductions: existing.deductions,
    admin_notes: existing.admin_notes,
  };
  const after: PayrollAdjustableFields = {
    days_present: daysPresent,
    approved_paid_days: approvedPaidDays,
    unpaid_absence_days: unpaidAbsenceDays,
    total_payable_days: totalPayableDays,
    regular_paid_hours: regularPaidHours,
    unpaid_hours: unpaidHours,
    approved_paid_leave_hours: approvedPaidLeaveHours,
    bonus_commission: bonusCommission,
    other_additions: otherAdditions,
    internet_allowance: internetAllowance,
    deductions,
    admin_notes: adminNotes,
  };

  for (const change of buildPayrollAdjustmentAuditRows(before, after)) {
    await insertAuditRow(supabase, {
      payrollId: recordId,
      agentId: existing.agent_id,
      action: change.action,
      admin,
      reason: change.action === "notes_updated" ? null : adjustmentReason,
      details: change.details,
    });
  }

  revalidatePath("/admin/crm/payroll");
  revalidatePath("/agent/pay");
  return {};
}

export async function approvePayrollAction(recordId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("crm_payroll")
    .select("agent_id, status")
    .eq("id", recordId)
    .single();
  if (fetchError || !existing) return { error: "Payroll record not found." };
  if (existing.status !== "draft") return { error: "Only Draft records can be approved." };

  const note = String(formData.get("note") ?? "").trim() || null;

  const { error } = await supabase
    .from("crm_payroll")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: admin.id })
    .eq("id", recordId);
  if (error) return { error: `Failed to approve this payroll record: ${error.message}` };

  await insertAuditRow(supabase, {
    payrollId: recordId,
    agentId: existing.agent_id,
    action: "approved",
    admin,
    reason: note,
    details: null,
  });

  revalidatePath("/admin/crm/payroll");
  revalidatePath("/agent/pay");
  return {};
}

export async function markPayrollPaidAction(recordId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("crm_payroll")
    .select("agent_id, status")
    .eq("id", recordId)
    .single();
  if (fetchError || !existing) return { error: "Payroll record not found." };
  if (existing.status !== "approved") return { error: "Only Approved records can be marked as paid." };

  const actualPaymentDate = String(formData.get("actual_payment_date") ?? "").trim();
  const paymentMethod = String(formData.get("payment_method") ?? "").trim();
  if (!actualPaymentDate) return { error: "Actual payment date is required." };
  if (!paymentMethod) return { error: "Payment method is required." };

  const { error } = await supabase
    .from("crm_payroll")
    .update({ status: "paid", actual_payment_date: actualPaymentDate, payment_method: paymentMethod })
    .eq("id", recordId);
  if (error) return { error: `Failed to mark this payroll record as paid: ${error.message}` };

  await insertAuditRow(supabase, {
    payrollId: recordId,
    agentId: existing.agent_id,
    action: "marked_paid",
    admin,
    reason: null,
    details: { actual_payment_date: actualPaymentDate, payment_method: paymentMethod },
  });

  revalidatePath("/admin/crm/payroll");
  revalidatePath("/agent/pay");
  return {};
}

export async function cancelPayrollAction(recordId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("crm_payroll")
    .select("agent_id, status")
    .eq("id", recordId)
    .single();
  if (fetchError || !existing) return { error: "Payroll record not found." };
  if (existing.status !== "draft" && existing.status !== "approved") {
    return { error: "Only Draft or Approved records can be cancelled." };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "A reason is required to cancel a payroll record." };

  const { error } = await supabase.from("crm_payroll").update({ status: "cancelled" }).eq("id", recordId);
  if (error) return { error: `Failed to cancel this payroll record: ${error.message}` };

  await insertAuditRow(supabase, {
    payrollId: recordId,
    agentId: existing.agent_id,
    action: "cancelled",
    admin,
    reason,
    details: null,
  });

  revalidatePath("/admin/crm/payroll");
  revalidatePath("/agent/pay");
  return {};
}

// Only path back out of a Paid record (crm_payroll_prevent_paid_edit_trigger,
// migration 0063, blocks every other update once status = 'paid'). Takes
// the record back to Draft so it goes through ordinary review/approval
// again rather than silently re-marking itself Paid with stale numbers.
export async function reopenPayrollAction(recordId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("crm_payroll")
    .select("agent_id, status")
    .eq("id", recordId)
    .single();
  if (fetchError || !existing) return { error: "Payroll record not found." };
  if (existing.status !== "paid") return { error: "Only Paid records can be reopened." };
  if (formData.get("confirm_reopen") !== "true") {
    return { error: "Confirm you want to reopen this finalized payroll record." };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "A reason is required to reopen a finalized payroll record." };

  const { error } = await supabase
    .from("crm_payroll")
    .update({
      status: "draft",
      actual_payment_date: null,
      payment_method: null,
      reopened_at: new Date().toISOString(),
      reopened_by: admin.id,
      reopen_reason: reason,
    })
    .eq("id", recordId);
  if (error) return { error: `Failed to reopen this payroll record: ${error.message}` };

  await insertAuditRow(supabase, {
    payrollId: recordId,
    agentId: existing.agent_id,
    action: "reopened",
    admin,
    reason,
    details: null,
  });

  revalidatePath("/admin/crm/payroll");
  revalidatePath("/agent/pay");
  return {};
}
