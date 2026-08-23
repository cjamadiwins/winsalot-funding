"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmLeaveRequestRow, CrmUserRow } from "@/lib/crm-types";
import {
  calculateLeaveDeductionAmountHourly,
  computeNoticeDays,
  countScheduledLeaveDays,
  countScheduledLeaveHours,
  isShortNotice,
  reconcileAttendanceStatusForStatusChange,
  type LeaveAttendanceStatus,
  type LeaveStatus,
  type LeaveType,
} from "@/lib/leave-requests";
import { STANDARD_BIWEEKLY_WAGE, STANDARD_PAID_HOURS, hourlyRate } from "@/lib/payroll";
import { notifyAgentOfCrmLeaveDecision, recordCrmLeaveAudit } from "@/lib/crm-leave-notifications";

// Returns { error } instead of throwing, matching crm/payroll/actions.ts -
// Next.js redacts thrown Server Action errors to a generic message in
// production.
type ActionResult = { error?: string };

// The full row (every column `select("*")` returns), not just the subset
// the original approve/decline/mark/confirm/apply actions happened to
// need - widened so the edit/delete actions below can reuse the exact
// same fetch helper instead of a second, parallel one.
type LeaveRequestWithAgent = CrmLeaveRequestRow & {
  crm_users: { full_name: string; email: string } | null;
};

function performedByName(admin: CrmUserRow): string {
  return admin.full_name || admin.email;
}

function agentNameOf(row: { crm_users: { full_name: string; email: string } | null }): string {
  return row.crm_users?.full_name || row.crm_users?.email || "Unknown agent";
}

async function fetchLeaveRequestWithAgent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  requestId: string
): Promise<{ data: LeaveRequestWithAgent | null; error: string | null }> {
  const { data, error } = await supabase
    .from("crm_leave_requests")
    // `!agent_id` disambiguates which of crm_leave_requests' four FKs to
    // crm_users PostgREST should embed through - see page.tsx's comment.
    .select("*, crm_users!agent_id(full_name, email)")
    .eq("id", requestId)
    .single();
  if (error || !data) return { data: null, error: "Leave request not found." };
  return { data: data as unknown as LeaveRequestWithAgent, error: null };
}

export async function approveLeaveRequestAction(requestId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await fetchLeaveRequestWithAgent(supabase, requestId);
  if (fetchError || !existing) return { error: fetchError ?? "Leave request not found." };
  if (existing.deleted_at) return { error: "This leave request has been deleted." };
  if (existing.status !== "pending") return { error: "Only pending requests can be approved." };

  const note = String(formData.get("decision_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("crm_leave_requests")
    .update({
      status: "approved",
      decision_note: note,
      decided_by: admin.id,
      decided_by_name: performedByName(admin),
      decided_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) return { error: `Failed to approve this request: ${error.message}` };

  await recordCrmLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName: agentNameOf(existing),
    action: "approved",
    performedById: admin.id,
    performedByName: performedByName(admin),
    note,
  });

  await notifyAgentOfCrmLeaveDecision({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    startDate: existing.start_date,
    endDate: existing.end_date,
    status: "approved",
    decisionNote: note,
  });

  revalidatePath("/admin/crm/leave-requests");
  revalidatePath("/admin", "layout");
  revalidatePath("/agent/leave-requests");
  revalidatePath("/agent", "layout");
  return {};
}

export async function declineLeaveRequestAction(requestId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await fetchLeaveRequestWithAgent(supabase, requestId);
  if (fetchError || !existing) return { error: fetchError ?? "Leave request not found." };
  if (existing.deleted_at) return { error: "This leave request has been deleted." };
  if (existing.status !== "pending") return { error: "Only pending requests can be declined." };

  const note = String(formData.get("decision_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("crm_leave_requests")
    .update({
      status: "declined",
      decision_note: note,
      decided_by: admin.id,
      decided_by_name: performedByName(admin),
      decided_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) return { error: `Failed to decline this request: ${error.message}` };

  await recordCrmLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName: agentNameOf(existing),
    action: "declined",
    performedById: admin.id,
    performedByName: performedByName(admin),
    note,
  });

  await notifyAgentOfCrmLeaveDecision({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    startDate: existing.start_date,
    endDate: existing.end_date,
    status: "declined",
    decisionNote: note,
  });

  revalidatePath("/admin/crm/leave-requests");
  revalidatePath("/admin", "layout");
  revalidatePath("/agent/leave-requests");
  revalidatePath("/agent", "layout");
  return {};
}

// Marks the decided request's date range as either Paid Leave (approved
// requests only) or Unapproved Absence - Unpaid (declined requests the
// agent didn't work). For an unpaid absence, this also computes (but
// does not yet apply) the payroll deduction, from the agent's own
// current daily rate - never a hard-coded figure - so the admin can
// review it before confirming (see confirmLeaveDeductionAction below).
export async function markLeaveAttendanceAction(requestId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const targetStatus = String(formData.get("attendance_status") ?? "").trim();
  if (targetStatus !== "paid_leave" && targetStatus !== "unpaid_absence") {
    return { error: "Invalid attendance status." };
  }

  const { data: existing, error: fetchError } = await fetchLeaveRequestWithAgent(supabase, requestId);
  if (fetchError || !existing) return { error: fetchError ?? "Leave request not found." };
  if (existing.deleted_at) return { error: "This leave request has been deleted." };
  if (existing.attendance_status !== "none") {
    return { error: "This request's attendance has already been marked." };
  }
  if (targetStatus === "paid_leave" && existing.status !== "approved") {
    return { error: "Only approved requests can be marked as Paid Leave." };
  }
  if (targetStatus === "unpaid_absence" && existing.status !== "declined") {
    return { error: "Only declined requests can be marked as Unapproved Absence." };
  }

  const agentName = agentNameOf(existing);
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    attendance_status: targetStatus,
    attendance_marked_at: now,
    attendance_marked_by: admin.id,
    attendance_marked_by_name: performedByName(admin),
  };
  let auditDetails: Record<string, unknown> | null = null;

  if (targetStatus === "unpaid_absence") {
    // Use the agent's own most recent payroll record for their current
    // standard pay structure; only agents who have never had a payroll
    // record yet fall back to the company-wide standard constants.
    const { data: latestPayroll } = await supabase
      .from("crm_payroll")
      .select("standard_biweekly_wage, standard_paid_hours")
      .eq("agent_id", existing.agent_id)
      .order("payday", { ascending: false })
      .limit(1)
      .maybeSingle();

    const standardBiweeklyWage = latestPayroll?.standard_biweekly_wage ?? STANDARD_BIWEEKLY_WAGE;
    const standardPaidHours = latestPayroll?.standard_paid_hours ?? STANDARD_PAID_HOURS;
    const { amount, hours, scheduledDays } = calculateLeaveDeductionAmountHourly(
      existing.start_date,
      existing.end_date,
      standardBiweeklyWage,
      standardPaidHours
    );

    updates.deduction_amount = amount;
    updates.deduction_reason = `Unapproved absence: ${existing.start_date} to ${existing.end_date} (${scheduledDays} scheduled working day${scheduledDays === 1 ? "" : "s"}, ${hours} unpaid hour${hours === 1 ? "" : "s"}, leave request declined)`;
    auditDetails = { deduction_amount: amount, scheduled_days: scheduledDays, unpaid_hours: hours };
  }

  const { error } = await supabase.from("crm_leave_requests").update(updates).eq("id", requestId);
  if (error) return { error: `Failed to update attendance status: ${error.message}` };

  await recordCrmLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName,
    action: targetStatus === "paid_leave" ? "attendance_marked_paid_leave" : "attendance_marked_unpaid_absence",
    performedById: admin.id,
    performedByName: performedByName(admin),
    details: auditDetails,
  });

  revalidatePath("/admin/crm/leave-requests");
  revalidatePath("/agent/leave-requests");
  return {};
}

// Explicit admin review-and-confirm gate for an unpaid-absence deduction
// (spec: "Allow an admin to review and confirm the deduction before it
// is finalized"). Safe to call more than once: the first call just
// confirms; every call (including the first) then tries to fold the
// amount into a matching Draft/Approved payroll record for that pay
// period, and payroll_applied_id - checked before ever touching
// crm_payroll - guarantees this never happens twice for the same
// absence.
export async function confirmLeaveDeductionAction(requestId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await fetchLeaveRequestWithAgent(supabase, requestId);
  if (fetchError || !existing) return { error: fetchError ?? "Leave request not found." };
  if (existing.deleted_at) return { error: "This leave request has been deleted." };
  if (existing.attendance_status !== "unpaid_absence") {
    return { error: "Only requests marked Unapproved Absence have a deduction to confirm." };
  }
  if (existing.payroll_applied_id) {
    return { error: "This deduction has already been applied to payroll." };
  }

  const agentName = agentNameOf(existing);

  if (!existing.deduction_confirmed) {
    const { error } = await supabase
      .from("crm_leave_requests")
      .update({
        deduction_confirmed: true,
        deduction_confirmed_by: admin.id,
        deduction_confirmed_by_name: performedByName(admin),
        deduction_confirmed_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    if (error) return { error: `Failed to confirm this deduction: ${error.message}` };

    await recordCrmLeaveAudit({
      leaveRequestId: requestId,
      agentId: existing.agent_id,
      agentName,
      action: "deduction_confirmed",
      performedById: admin.id,
      performedByName: performedByName(admin),
      details: { deduction_amount: existing.deduction_amount, deduction_reason: existing.deduction_reason },
    });
  }

  const { data: matchingPayroll } = await supabase
    .from("crm_payroll")
    .select("id, deductions")
    .eq("agent_id", existing.agent_id)
    .in("status", ["draft", "approved"])
    .lte("pay_period_start", existing.end_date)
    .gte("pay_period_end", existing.start_date)
    .order("payday", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!matchingPayroll) {
    return {
      error:
        "Deduction confirmed. No Draft/Approved payroll record exists yet for this agent's pay period - create one on the Payroll page, then confirm again to apply it.",
    };
  }

  const newDeductions = Number(matchingPayroll.deductions) + Number(existing.deduction_amount ?? 0);
  const { error: payrollError } = await supabase
    .from("crm_payroll")
    .update({ deductions: newDeductions })
    .eq("id", matchingPayroll.id);
  if (payrollError) return { error: `Deduction confirmed, but failed to apply it to payroll: ${payrollError.message}` };

  await supabase.from("crm_payroll_audit_log").insert({
    payroll_id: matchingPayroll.id,
    agent_id: existing.agent_id,
    action: "deduction_changed",
    performed_by: admin.id,
    performed_by_name: performedByName(admin),
    reason: existing.deduction_reason,
    details: { leave_request_id: requestId, from: matchingPayroll.deductions, to: newDeductions },
  });

  await supabase
    .from("crm_leave_requests")
    .update({ payroll_applied_id: matchingPayroll.id, payroll_applied_at: new Date().toISOString() })
    .eq("id", requestId);

  await recordCrmLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName,
    action: "payroll_applied",
    performedById: admin.id,
    performedByName: performedByName(admin),
    details: { payroll_id: matchingPayroll.id, amount: existing.deduction_amount },
  });

  revalidatePath("/admin/crm/leave-requests");
  revalidatePath("/admin/crm/payroll");
  revalidatePath("/agent/pay");
  return {};
}

// Symmetric to confirmLeaveDeductionAction, for the paid-leave direction:
// adds the request's scheduled working days to a matching payroll
// record's approved_paid_days (never treated as an absence, never
// creates a deduction), guarded the same way against double-application.
export async function applyPaidLeaveToPayrollAction(requestId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await fetchLeaveRequestWithAgent(supabase, requestId);
  if (fetchError || !existing) return { error: fetchError ?? "Leave request not found." };
  if (existing.deleted_at) return { error: "This leave request has been deleted." };
  if (existing.attendance_status !== "paid_leave") {
    return { error: "Only requests marked Paid Leave can be applied to payroll." };
  }
  if (existing.payroll_applied_id) {
    return { error: "This paid leave has already been applied to payroll." };
  }

  const agentName = agentNameOf(existing);
  const scheduledDays = countScheduledLeaveDays(existing.start_date, existing.end_date);
  const scheduledHours = countScheduledLeaveHours(existing.start_date, existing.end_date);
  if (scheduledDays === 0) {
    return { error: "This leave range has no scheduled working days to apply." };
  }

  const { data: matchingPayroll } = await supabase
    .from("crm_payroll")
    .select("*")
    .eq("agent_id", existing.agent_id)
    .in("status", ["draft", "approved"])
    .lte("pay_period_start", existing.end_date)
    .gte("pay_period_end", existing.start_date)
    .order("payday", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!matchingPayroll) {
    return {
      error:
        "No Draft/Approved payroll record exists yet for this agent's pay period - create one on the Payroll page, then apply again.",
    };
  }

  // "Approved paid leave counts as paid time and must not reduce
  // wages" - base_pay_earned (the full standard biweekly wage) is never
  // touched here. The leave's hours move from unpaid_hours into
  // approved_paid_leave_hours, and the deduction already suggested for
  // those hours (if any) is removed from `deductions` - the admin can
  // still adjust either figure afterward, same as every other payroll
  // field.
  const newApprovedPaidDays = matchingPayroll.approved_paid_days + scheduledDays;
  const newTotalPayableDays = matchingPayroll.days_present + newApprovedPaidDays;
  const newApprovedPaidLeaveHours = Number(matchingPayroll.approved_paid_leave_hours) + scheduledHours;
  const newUnpaidHours = Math.max(0, Number(matchingPayroll.unpaid_hours) - scheduledHours);
  const rate = hourlyRate(matchingPayroll.standard_biweekly_wage, matchingPayroll.standard_paid_hours);
  const newDeductions = Math.round(Math.max(0, Number(matchingPayroll.deductions) - scheduledHours * rate) * 100) / 100;

  const { error: payrollError } = await supabase
    .from("crm_payroll")
    .update({
      approved_paid_days: newApprovedPaidDays,
      total_payable_days: newTotalPayableDays,
      approved_paid_leave_hours: newApprovedPaidLeaveHours,
      unpaid_hours: newUnpaidHours,
      deductions: newDeductions,
    })
    .eq("id", matchingPayroll.id);
  if (payrollError) return { error: `Failed to apply paid leave to payroll: ${payrollError.message}` };

  await supabase.from("crm_payroll_audit_log").insert({
    payroll_id: matchingPayroll.id,
    agent_id: existing.agent_id,
    action: "hours_adjusted",
    performed_by: admin.id,
    performed_by_name: performedByName(admin),
    reason: `Approved leave applied: ${existing.start_date} to ${existing.end_date}`,
    details: {
      leave_request_id: requestId,
      from: {
        approved_paid_leave_hours: matchingPayroll.approved_paid_leave_hours,
        unpaid_hours: matchingPayroll.unpaid_hours,
        deductions: matchingPayroll.deductions,
      },
      to: { approved_paid_leave_hours: newApprovedPaidLeaveHours, unpaid_hours: newUnpaidHours, deductions: newDeductions },
    },
  });

  await supabase
    .from("crm_leave_requests")
    .update({ payroll_applied_id: matchingPayroll.id, payroll_applied_at: new Date().toISOString() })
    .eq("id", requestId);

  await recordCrmLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName,
    action: "payroll_applied",
    performedById: admin.id,
    performedByName: performedByName(admin),
    details: { payroll_id: matchingPayroll.id, approved_paid_days_added: scheduledDays },
  });

  revalidatePath("/admin/crm/leave-requests");
  revalidatePath("/admin/crm/payroll");
  revalidatePath("/agent/pay");
  return {};
}

// Reverses this specific leave request's own already-applied payroll
// effect, on the exact payroll record it was applied to - "must not
// delete unrelated attendance or payroll records" holds because this
// only ever touches the one payroll row this one request contributed to,
// by the exact amount (recomputed from this request's own start/end
// dates, still on `existing` at this point) it originally contributed.
// Used by both updateLeaveRequestAction and deleteLeaveRequestAction
// below. Returns a small summary for the audit log, or null if there was
// nothing to reverse (payroll_applied_id already null, or the payroll
// record it pointed to no longer exists).
async function reverseLeaveRequestPayrollEffect(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  admin: CrmUserRow,
  existing: LeaveRequestWithAgent
): Promise<Record<string, unknown> | null> {
  if (!existing.payroll_applied_id) return null;

  const { data: payroll } = await supabase.from("crm_payroll").select("*").eq("id", existing.payroll_applied_id).maybeSingle();
  if (!payroll) return null;

  if (existing.attendance_status === "unpaid_absence") {
    const newDeductions = Math.max(0, Number(payroll.deductions) - Number(existing.deduction_amount ?? 0));
    await supabase.from("crm_payroll").update({ deductions: newDeductions }).eq("id", payroll.id);
    await supabase.from("crm_payroll_audit_log").insert({
      payroll_id: payroll.id,
      agent_id: existing.agent_id,
      action: "deduction_changed",
      performed_by: admin.id,
      performed_by_name: performedByName(admin),
      reason: "Leave request edited or deleted - reversing the previously applied unapproved-absence deduction.",
      details: { leave_request_id: existing.id, from: payroll.deductions, to: newDeductions },
    });
    return { payroll_id: payroll.id, reversed: "deduction", from: payroll.deductions, to: newDeductions };
  }

  if (existing.attendance_status === "paid_leave") {
    const oldScheduledDays = countScheduledLeaveDays(existing.start_date, existing.end_date);
    const oldScheduledHours = countScheduledLeaveHours(existing.start_date, existing.end_date);
    const rate = hourlyRate(payroll.standard_biweekly_wage, payroll.standard_paid_hours);
    const revertedApprovedPaidDays = Math.max(0, payroll.approved_paid_days - oldScheduledDays);
    const revertedApprovedPaidLeaveHours = Math.max(0, Number(payroll.approved_paid_leave_hours) - oldScheduledHours);
    const revertedUnpaidHours = Number(payroll.unpaid_hours) + oldScheduledHours;
    const revertedDeductions = Math.round((Number(payroll.deductions) + oldScheduledHours * rate) * 100) / 100;
    const revertedTotalPayableDays = payroll.days_present + revertedApprovedPaidDays;

    await supabase
      .from("crm_payroll")
      .update({
        approved_paid_days: revertedApprovedPaidDays,
        total_payable_days: revertedTotalPayableDays,
        approved_paid_leave_hours: revertedApprovedPaidLeaveHours,
        unpaid_hours: revertedUnpaidHours,
        deductions: revertedDeductions,
      })
      .eq("id", payroll.id);
    await supabase.from("crm_payroll_audit_log").insert({
      payroll_id: payroll.id,
      agent_id: existing.agent_id,
      action: "hours_adjusted",
      performed_by: admin.id,
      performed_by_name: performedByName(admin),
      reason: "Leave request edited or deleted - reversing the previously applied paid leave.",
      details: {
        leave_request_id: existing.id,
        from: {
          approved_paid_days: payroll.approved_paid_days,
          approved_paid_leave_hours: payroll.approved_paid_leave_hours,
          unpaid_hours: payroll.unpaid_hours,
          deductions: payroll.deductions,
        },
        to: {
          approved_paid_days: revertedApprovedPaidDays,
          approved_paid_leave_hours: revertedApprovedPaidLeaveHours,
          unpaid_hours: revertedUnpaidHours,
          deductions: revertedDeductions,
        },
      },
    });
    return { payroll_id: payroll.id, reversed: "paid_leave", approved_paid_days_removed: oldScheduledDays };
  }

  return null;
}

// "Edit Leave Request" (brief: leave type, start/end dates, reason,
// status). Never re-parents the request to a different agent and never
// touches decision_note - only the five listed fields, plus whatever
// attendance/payroll bookkeeping those five fields require to stay
// truthful, are ever written here.
export async function updateLeaveRequestAction(requestId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await fetchLeaveRequestWithAgent(supabase, requestId);
  if (fetchError || !existing) return { error: fetchError ?? "Leave request not found." };
  if (existing.deleted_at) return { error: "This leave request has been deleted." };

  const leaveTypeRaw = String(formData.get("leave_type") ?? "").trim();
  if (leaveTypeRaw !== "planned" && leaveTypeRaw !== "emergency") return { error: "Select Planned Leave or Emergency Leave." };
  const leaveType = leaveTypeRaw as LeaveType;

  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  if (!startDate || !endDate) return { error: "Start and end dates are required." };
  if (endDate < startDate) return { error: "End date can't be before the start date." };

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "A reason is required." };

  const statusRaw = String(formData.get("status") ?? "").trim();
  if (statusRaw !== "pending" && statusRaw !== "approved" && statusRaw !== "declined") return { error: "Invalid status." };
  const newStatus = statusRaw as LeaveStatus;

  // "Before editing an approved request, show a confirmation warning" -
  // the client already shows this; this is the server-side backstop
  // against a stale form or forged request, same rationale as every
  // other client-guarded check in this codebase.
  if (existing.status === "approved" && formData.get("confirm_approved_edit") !== "true") {
    return { error: "Editing an approved request requires confirmation." };
  }

  const agentName = agentNameOf(existing);
  const now = new Date().toISOString();
  const datesChanged = startDate !== existing.start_date || endDate !== existing.end_date;
  const statusChanged = newStatus !== existing.status;

  const noticeDays = computeNoticeDays(existing.submitted_at, startDate);
  const shortNotice = isShortNotice(leaveType, noticeDays);

  const updates: Record<string, unknown> = {
    leave_type: leaveType,
    start_date: startDate,
    end_date: endDate,
    reason,
    notice_days: noticeDays,
    is_short_notice: shortNotice,
    status: newStatus,
  };

  if (statusChanged) {
    updates.decided_by = admin.id;
    updates.decided_by_name = performedByName(admin);
    updates.decided_at = now;
  }

  let reversalDetails: Record<string, unknown> | null = null;
  let newAttendanceStatus: LeaveAttendanceStatus = existing.attendance_status;

  // "If the dates or status change, automatically update any connected
  // attendance and payroll records" - deliberately scoped to exactly
  // that: a pure leave_type/reason edit never touches attendance_status,
  // the deduction figure, or payroll at all.
  if (datesChanged || statusChanged) {
    if (existing.payroll_applied_id) {
      reversalDetails = await reverseLeaveRequestPayrollEffect(supabase, admin, existing);
      updates.payroll_applied_id = null;
      updates.payroll_applied_at = null;
      updates.deduction_confirmed = false;
      updates.deduction_confirmed_by = null;
      updates.deduction_confirmed_by_name = null;
      updates.deduction_confirmed_at = null;
    }

    newAttendanceStatus = reconcileAttendanceStatusForStatusChange(existing.attendance_status, newStatus);
    updates.attendance_status = newAttendanceStatus;

    if (newAttendanceStatus === "none") {
      updates.deduction_amount = null;
      updates.deduction_reason = null;
      updates.attendance_marked_at = null;
      updates.attendance_marked_by = null;
      updates.attendance_marked_by_name = null;
    } else if (newAttendanceStatus === "paid_leave") {
      updates.deduction_amount = null;
      updates.deduction_reason = null;
      updates.attendance_marked_at = now;
      updates.attendance_marked_by = admin.id;
      updates.attendance_marked_by_name = performedByName(admin);
    } else {
      // unpaid_absence - always recomputed fresh from the (possibly just
      // changed) dates, the same lookup markLeaveAttendanceAction uses,
      // so a stale pre-edit figure is never left showing.
      const { data: latestPayroll } = await supabase
        .from("crm_payroll")
        .select("standard_biweekly_wage, standard_paid_hours")
        .eq("agent_id", existing.agent_id)
        .order("payday", { ascending: false })
        .limit(1)
        .maybeSingle();
      const standardBiweeklyWage = latestPayroll?.standard_biweekly_wage ?? STANDARD_BIWEEKLY_WAGE;
      const standardPaidHours = latestPayroll?.standard_paid_hours ?? STANDARD_PAID_HOURS;
      const { amount, hours, scheduledDays } = calculateLeaveDeductionAmountHourly(
        startDate,
        endDate,
        standardBiweeklyWage,
        standardPaidHours
      );
      updates.deduction_amount = amount;
      updates.deduction_reason = `Unapproved absence: ${startDate} to ${endDate} (${scheduledDays} scheduled working day${scheduledDays === 1 ? "" : "s"}, ${hours} unpaid hour${hours === 1 ? "" : "s"}, leave request declined)`;
      updates.attendance_marked_at = now;
      updates.attendance_marked_by = admin.id;
      updates.attendance_marked_by_name = performedByName(admin);
    }
  }

  const { error } = await supabase.from("crm_leave_requests").update(updates).eq("id", requestId);
  if (error) return { error: `Failed to save changes: ${error.message}` };

  const changed: Record<string, { from: unknown; to: unknown }> = {};
  if (existing.leave_type !== leaveType) changed.leave_type = { from: existing.leave_type, to: leaveType };
  if (existing.start_date !== startDate) changed.start_date = { from: existing.start_date, to: startDate };
  if (existing.end_date !== endDate) changed.end_date = { from: existing.end_date, to: endDate };
  if (existing.reason !== reason) changed.reason = { from: existing.reason, to: reason };
  if (statusChanged) changed.status = { from: existing.status, to: newStatus };
  if (newAttendanceStatus !== existing.attendance_status) {
    changed.attendance_status = { from: existing.attendance_status, to: newAttendanceStatus };
  }

  await recordCrmLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName,
    action: "edited",
    performedById: admin.id,
    performedByName: performedByName(admin),
    details: { changed, payroll_reversal: reversalDetails },
  });

  if (statusChanged && (newStatus === "approved" || newStatus === "declined")) {
    await notifyAgentOfCrmLeaveDecision({
      leaveRequestId: requestId,
      agentId: existing.agent_id,
      startDate,
      endDate,
      status: newStatus,
      decisionNote: existing.decision_note ?? null,
    });
  }

  revalidatePath("/admin/crm/leave-requests");
  revalidatePath("/admin", "layout");
  revalidatePath("/agent/leave-requests");
  revalidatePath("/agent", "layout");
  revalidatePath("/admin/crm/payroll");
  revalidatePath("/agent/pay");
  return {};
}

// "Delete Leave Request" - a soft delete (see the CrmLeaveRequestRow
// comment on deleted_at). Always reverses whatever payroll effect this
// specific request had already produced, exactly like an edit would,
// since a deleted request must never leave a stale contribution behind
// in someone's payroll figures.
export async function deleteLeaveRequestAction(requestId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await fetchLeaveRequestWithAgent(supabase, requestId);
  if (fetchError || !existing) return { error: fetchError ?? "Leave request not found." };
  if (existing.deleted_at) return { error: "This leave request has already been deleted." };

  const agentName = agentNameOf(existing);
  const reversalDetails = existing.payroll_applied_id ? await reverseLeaveRequestPayrollEffect(supabase, admin, existing) : null;

  const { error } = await supabase
    .from("crm_leave_requests")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: admin.id,
      deleted_by_name: performedByName(admin),
      payroll_applied_id: null,
      payroll_applied_at: null,
    })
    .eq("id", requestId);
  if (error) return { error: `Failed to delete this leave request: ${error.message}` };

  await recordCrmLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName,
    action: "deleted",
    performedById: admin.id,
    performedByName: performedByName(admin),
    details: {
      leave_type: existing.leave_type,
      start_date: existing.start_date,
      end_date: existing.end_date,
      status: existing.status,
      payroll_reversal: reversalDetails,
    },
  });

  revalidatePath("/admin/crm/leave-requests");
  revalidatePath("/admin", "layout");
  revalidatePath("/agent/leave-requests");
  revalidatePath("/agent", "layout");
  revalidatePath("/admin/crm/payroll");
  revalidatePath("/agent/pay");
  return {};
}
