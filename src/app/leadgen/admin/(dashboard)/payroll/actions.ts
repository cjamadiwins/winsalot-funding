"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import type { LeadgenAgentAttendanceRow, LeadgenUserRow } from "@/lib/leadgen-types";
import {
  attendanceDateKey,
  buildPayPeriodAttendanceSummary,
  type PayPeriodAttendanceSummary,
} from "@/lib/leadgen-attendance-report";
import {
  buildPayrollAdjustmentAuditRows,
  calculateBasePayEarned,
  getPayPeriodForPayday,
  STANDARD_BIWEEKLY_PAY,
  STANDARD_WORKING_DAYS,
  type PayrollAdjustableFields,
  type PayrollAuditAction,
} from "@/lib/payroll";

// Mirrors src/app/admin/(dashboard)/crm/payroll/actions.ts exactly, but
// against leadgen_payroll / leadgen_payroll_audit_log / leadgen_users /
// leadgen_agent_attendance - this CRM's own, entirely separate agent pool
// and tables (see migration 0063's header comment).
type ActionResult = { error?: string };

function performedByName(admin: LeadgenUserRow): string {
  return admin.full_name || admin.email;
}

async function insertAuditRow(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  params: {
    payrollId: string;
    agentId: string;
    action: PayrollAuditAction;
    admin: LeadgenUserRow;
    reason: string | null;
    details: Record<string, unknown> | null;
  }
) {
  await supabase.from("leadgen_payroll_audit_log").insert({
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

export async function loadLeadgenAttendanceSummaryAction(
  agentId: string,
  payday: string
): Promise<{ error?: string; summary?: PayPeriodAttendanceSummary }> {
  await requireLeadgenAdmin();

  if (!agentId || !payday) return { error: "Agent and payday are required." };

  const { start, end } = getPayPeriodForPayday(payday);
  const supabase = await createSupabaseServerClient();

  const paddedStart = new Date(`${start}T00:00:00.000Z`);
  paddedStart.setUTCDate(paddedStart.getUTCDate() - 1);
  const paddedEnd = new Date(`${end}T23:59:59.999Z`);
  paddedEnd.setUTCDate(paddedEnd.getUTCDate() + 1);

  const { data, error } = await supabase
    .from("leadgen_agent_attendance")
    .select("*")
    .eq("agent_id", agentId)
    .gte("clock_in", paddedStart.toISOString())
    .lte("clock_in", paddedEnd.toISOString())
    .order("clock_in", { ascending: true });

  if (error) return { error: `Failed to load attendance: ${error.message}` };

  const todayKey = attendanceDateKey(new Date().toISOString());
  const summary = buildPayPeriodAttendanceSummary((data ?? []) as LeadgenAgentAttendanceRow[], start, end, todayKey);
  return { summary };
}

export async function createLeadgenPayrollAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();

  const agentId = String(formData.get("agent_id") ?? "").trim();
  const payday = String(formData.get("payday") ?? "").trim();
  const standardBiweeklyPay = parseNonNegativeAmount(formData, "standard_biweekly_pay") ?? STANDARD_BIWEEKLY_PAY;
  const standardWorkingDays = parseNonNegativeInt(formData, "standard_working_days") || STANDARD_WORKING_DAYS;
  const daysPresent = parseNonNegativeInt(formData, "days_present");
  const approvedPaidDays = parseNonNegativeInt(formData, "approved_paid_days");
  const unpaidAbsenceDays = parseNonNegativeInt(formData, "unpaid_absence_days");
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
    internetAllowance === null ||
    bonusCommission === null ||
    otherAdditions === null ||
    deductions === null
  ) {
    return { error: "Amounts and day counts must be zero or a positive number." };
  }
  if (!adjustmentReason) {
    return { error: "A reason is required for this payroll entry." };
  }

  const totalPayableDays = daysPresent + approvedPaidDays;
  const basePayEarned = calculateBasePayEarned(totalPayableDays, standardBiweeklyPay, standardWorkingDays);
  const { start, end } = getPayPeriodForPayday(payday);

  const supabase = await createSupabaseServerClient();
  const { data: inserted, error } = await supabase
    .from("leadgen_payroll")
    .insert({
      agent_id: agentId,
      pay_period_start: start,
      pay_period_end: end,
      payday,
      status: "draft",
      standard_biweekly_pay: standardBiweeklyPay,
      standard_working_days: standardWorkingDays,
      days_present: daysPresent,
      approved_paid_days: approvedPaidDays,
      unpaid_absence_days: unpaidAbsenceDays,
      total_payable_days: totalPayableDays,
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
      base_pay_earned: basePayEarned,
      bonus_commission: bonusCommission,
      other_additions: otherAdditions,
      deductions,
    },
  });

  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}

export async function updateLeadgenPayrollAction(recordId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("leadgen_payroll")
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
  const standardBiweeklyPay = parseNonNegativeAmount(formData, "standard_biweekly_pay") ?? STANDARD_BIWEEKLY_PAY;
  const standardWorkingDays = parseNonNegativeInt(formData, "standard_working_days") || STANDARD_WORKING_DAYS;
  const daysPresent = parseNonNegativeInt(formData, "days_present");
  const approvedPaidDays = parseNonNegativeInt(formData, "approved_paid_days");
  const unpaidAbsenceDays = parseNonNegativeInt(formData, "unpaid_absence_days");
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
    internetAllowance === null ||
    bonusCommission === null ||
    otherAdditions === null ||
    deductions === null
  ) {
    return { error: "Amounts and day counts must be zero or a positive number." };
  }
  if (!adjustmentReason) {
    return { error: "A reason is required for this payroll adjustment." };
  }

  const totalPayableDays = daysPresent + approvedPaidDays;
  const basePayEarned = calculateBasePayEarned(totalPayableDays, standardBiweeklyPay, standardWorkingDays);
  const { start, end } = getPayPeriodForPayday(payday);

  const { error } = await supabase
    .from("leadgen_payroll")
    .update({
      pay_period_start: start,
      pay_period_end: end,
      payday,
      standard_biweekly_pay: standardBiweeklyPay,
      standard_working_days: standardWorkingDays,
      days_present: daysPresent,
      approved_paid_days: approvedPaidDays,
      unpaid_absence_days: unpaidAbsenceDays,
      total_payable_days: totalPayableDays,
      base_pay_earned: basePayEarned,
      internet_allowance: internetAllowance,
      bonus_commission: bonusCommission,
      other_additions: otherAdditions,
      deductions,
      admin_notes: adminNotes,
      updated_at: new Date().toISOString(),
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

  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}

export async function approveLeadgenPayrollAction(recordId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("leadgen_payroll")
    .select("agent_id, status")
    .eq("id", recordId)
    .single();
  if (fetchError || !existing) return { error: "Payroll record not found." };
  if (existing.status !== "draft") return { error: "Only Draft records can be approved." };

  const note = String(formData.get("note") ?? "").trim() || null;

  const { error } = await supabase
    .from("leadgen_payroll")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: admin.id,
      updated_at: new Date().toISOString(),
    })
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

  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}

export async function markLeadgenPayrollPaidAction(recordId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("leadgen_payroll")
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
    .from("leadgen_payroll")
    .update({
      status: "paid",
      actual_payment_date: actualPaymentDate,
      payment_method: paymentMethod,
      updated_at: new Date().toISOString(),
    })
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

  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}

export async function cancelLeadgenPayrollAction(recordId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("leadgen_payroll")
    .select("agent_id, status")
    .eq("id", recordId)
    .single();
  if (fetchError || !existing) return { error: "Payroll record not found." };
  if (existing.status !== "draft" && existing.status !== "approved") {
    return { error: "Only Draft or Approved records can be cancelled." };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "A reason is required to cancel a payroll record." };

  const { error } = await supabase
    .from("leadgen_payroll")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", recordId);
  if (error) return { error: `Failed to cancel this payroll record: ${error.message}` };

  await insertAuditRow(supabase, {
    payrollId: recordId,
    agentId: existing.agent_id,
    action: "cancelled",
    admin,
    reason,
    details: null,
  });

  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}

export async function reopenLeadgenPayrollAction(recordId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("leadgen_payroll")
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
    .from("leadgen_payroll")
    .update({
      status: "draft",
      actual_payment_date: null,
      payment_method: null,
      reopened_at: new Date().toISOString(),
      reopened_by: admin.id,
      reopen_reason: reason,
      updated_at: new Date().toISOString(),
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

  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}
