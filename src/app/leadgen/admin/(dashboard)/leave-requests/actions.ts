"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import type { LeadgenLeaveRequestRow, LeadgenUserRow } from "@/lib/leadgen-types";
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
import { notifyAgentOfLeadgenLeaveDecision, recordLeadgenLeaveAudit } from "@/lib/leadgen-leave-notifications";

// Mirrors src/app/admin/(dashboard)/crm/leave-requests/actions.ts exactly,
// but against leadgen_leave_requests / leadgen_payroll / leadgen_users -
// this CRM's own, entirely separate agent pool and tables (migration 0070).
type ActionResult = { error?: string };

// The full row (every column `select("*")` returns), not just the subset
// the original approve/decline/mark/confirm/apply actions happened to
// need - widened so the edit/delete actions below can reuse the exact
// same fetch helper instead of a second, parallel one.
type LeadgenLeaveRequestWithAgent = LeadgenLeaveRequestRow & {
  leadgen_users: { full_name: string; email: string } | null;
};

function performedByName(admin: LeadgenUserRow): string {
  return admin.full_name || admin.email;
}

function agentNameOf(row: { leadgen_users: { full_name: string; email: string } | null }): string {
  return row.leadgen_users?.full_name || row.leadgen_users?.email || "Unknown agent";
}

async function fetchLeaveRequestWithAgent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  requestId: string
): Promise<{ data: LeadgenLeaveRequestWithAgent | null; error: string | null }> {
  const { data, error } = await supabase
    .from("leadgen_leave_requests")
    // `!agent_id` disambiguates which of leadgen_leave_requests' four FKs
    // to leadgen_users PostgREST should embed through - see page.tsx's
    // comment.
    .select("*, leadgen_users!agent_id(full_name, email)")
    .eq("id", requestId)
    .single();
  if (error || !data) return { data: null, error: "Leave request not found." };
  return { data: data as unknown as LeadgenLeaveRequestWithAgent, error: null };
}

export async function approveLeadgenLeaveRequestAction(requestId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await fetchLeaveRequestWithAgent(supabase, requestId);
  if (fetchError || !existing) return { error: fetchError ?? "Leave request not found." };
  if (existing.deleted_at) return { error: "This leave request has been deleted." };
  if (existing.status !== "pending") return { error: "Only pending requests can be approved." };

  const note = String(formData.get("decision_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("leadgen_leave_requests")
    .update({
      status: "approved",
      decision_note: note,
      decided_by: admin.id,
      decided_by_name: performedByName(admin),
      decided_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) return { error: `Failed to approve this request: ${error.message}` };

  await recordLeadgenLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName: agentNameOf(existing),
    action: "approved",
    performedById: admin.id,
    performedByName: performedByName(admin),
    note,
  });

  await notifyAgentOfLeadgenLeaveDecision({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentEmail: existing.leadgen_users?.email ?? "",
    agentName: agentNameOf(existing),
    startDate: existing.start_date,
    endDate: existing.end_date,
    status: "approved",
    decisionNote: note,
  });

  revalidatePath("/leadgen/admin/leave-requests");
  revalidatePath("/leadgen/admin", "layout");
  revalidatePath("/leadgen/agent/leave-requests");
  revalidatePath("/leadgen/agent", "layout");
  return {};
}

export async function declineLeadgenLeaveRequestAction(requestId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await fetchLeaveRequestWithAgent(supabase, requestId);
  if (fetchError || !existing) return { error: fetchError ?? "Leave request not found." };
  if (existing.deleted_at) return { error: "This leave request has been deleted." };
  if (existing.status !== "pending") return { error: "Only pending requests can be declined." };

  const note = String(formData.get("decision_note") ?? "").trim() || null;

  const { error } = await supabase
    .from("leadgen_leave_requests")
    .update({
      status: "declined",
      decision_note: note,
      decided_by: admin.id,
      decided_by_name: performedByName(admin),
      decided_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) return { error: `Failed to decline this request: ${error.message}` };

  await recordLeadgenLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName: agentNameOf(existing),
    action: "declined",
    performedById: admin.id,
    performedByName: performedByName(admin),
    note,
  });

  await notifyAgentOfLeadgenLeaveDecision({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentEmail: existing.leadgen_users?.email ?? "",
    agentName: agentNameOf(existing),
    startDate: existing.start_date,
    endDate: existing.end_date,
    status: "declined",
    decisionNote: note,
  });

  revalidatePath("/leadgen/admin/leave-requests");
  revalidatePath("/leadgen/admin", "layout");
  revalidatePath("/leadgen/agent/leave-requests");
  revalidatePath("/leadgen/agent", "layout");
  return {};
}

export async function markLeadgenLeaveAttendanceAction(requestId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
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
    const { data: latestPayroll } = await supabase
      .from("leadgen_payroll")
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

  const { error } = await supabase.from("leadgen_leave_requests").update(updates).eq("id", requestId);
  if (error) return { error: `Failed to update attendance status: ${error.message}` };

  await recordLeadgenLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName,
    action: targetStatus === "paid_leave" ? "attendance_marked_paid_leave" : "attendance_marked_unpaid_absence",
    performedById: admin.id,
    performedByName: performedByName(admin),
    details: auditDetails,
  });

  revalidatePath("/leadgen/admin/leave-requests");
  revalidatePath("/leadgen/agent/leave-requests");
  return {};
}

export async function confirmLeadgenLeaveDeductionAction(requestId: string): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
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
      .from("leadgen_leave_requests")
      .update({
        deduction_confirmed: true,
        deduction_confirmed_by: admin.id,
        deduction_confirmed_by_name: performedByName(admin),
        deduction_confirmed_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    if (error) return { error: `Failed to confirm this deduction: ${error.message}` };

    await recordLeadgenLeaveAudit({
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
    .from("leadgen_payroll")
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
    .from("leadgen_payroll")
    .update({ deductions: newDeductions })
    .eq("id", matchingPayroll.id);
  if (payrollError) return { error: `Deduction confirmed, but failed to apply it to payroll: ${payrollError.message}` };

  await supabase.from("leadgen_payroll_audit_log").insert({
    payroll_id: matchingPayroll.id,
    agent_id: existing.agent_id,
    action: "deduction_changed",
    performed_by: admin.id,
    performed_by_name: performedByName(admin),
    reason: existing.deduction_reason,
    details: { leave_request_id: requestId, from: matchingPayroll.deductions, to: newDeductions },
  });

  await supabase
    .from("leadgen_leave_requests")
    .update({ payroll_applied_id: matchingPayroll.id, payroll_applied_at: new Date().toISOString() })
    .eq("id", requestId);

  await recordLeadgenLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName,
    action: "payroll_applied",
    performedById: admin.id,
    performedByName: performedByName(admin),
    details: { payroll_id: matchingPayroll.id, amount: existing.deduction_amount },
  });

  revalidatePath("/leadgen/admin/leave-requests");
  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}

export async function applyLeadgenPaidLeaveToPayrollAction(requestId: string): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
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
    .from("leadgen_payroll")
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
  // those hours (if any) is removed from `deductions`.
  const newApprovedPaidDays = matchingPayroll.approved_paid_days + scheduledDays;
  const newTotalPayableDays = matchingPayroll.days_present + newApprovedPaidDays;
  const newApprovedPaidLeaveHours = Number(matchingPayroll.approved_paid_leave_hours) + scheduledHours;
  const newUnpaidHours = Math.max(0, Number(matchingPayroll.unpaid_hours) - scheduledHours);
  const rate = hourlyRate(matchingPayroll.standard_biweekly_wage, matchingPayroll.standard_paid_hours);
  const newDeductions = Math.round(Math.max(0, Number(matchingPayroll.deductions) - scheduledHours * rate) * 100) / 100;

  const { error: payrollError } = await supabase
    .from("leadgen_payroll")
    .update({
      approved_paid_days: newApprovedPaidDays,
      total_payable_days: newTotalPayableDays,
      approved_paid_leave_hours: newApprovedPaidLeaveHours,
      unpaid_hours: newUnpaidHours,
      deductions: newDeductions,
    })
    .eq("id", matchingPayroll.id);
  if (payrollError) return { error: `Failed to apply paid leave to payroll: ${payrollError.message}` };

  await supabase.from("leadgen_payroll_audit_log").insert({
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
    .from("leadgen_leave_requests")
    .update({ payroll_applied_id: matchingPayroll.id, payroll_applied_at: new Date().toISOString() })
    .eq("id", requestId);

  await recordLeadgenLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName,
    action: "payroll_applied",
    performedById: admin.id,
    performedByName: performedByName(admin),
    details: { payroll_id: matchingPayroll.id, approved_paid_days_added: scheduledDays },
  });

  revalidatePath("/leadgen/admin/leave-requests");
  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}

// Mirrors reverseLeaveRequestPayrollEffect in the Cleaning CRM's own
// actions.ts exactly, against leadgen_payroll / leadgen_payroll_audit_log.
async function reverseLeadgenLeaveRequestPayrollEffect(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  admin: LeadgenUserRow,
  existing: LeadgenLeaveRequestWithAgent
): Promise<Record<string, unknown> | null> {
  if (!existing.payroll_applied_id) return null;

  const { data: payroll } = await supabase.from("leadgen_payroll").select("*").eq("id", existing.payroll_applied_id).maybeSingle();
  if (!payroll) return null;

  if (existing.attendance_status === "unpaid_absence") {
    const newDeductions = Math.max(0, Number(payroll.deductions) - Number(existing.deduction_amount ?? 0));
    await supabase.from("leadgen_payroll").update({ deductions: newDeductions }).eq("id", payroll.id);
    await supabase.from("leadgen_payroll_audit_log").insert({
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
      .from("leadgen_payroll")
      .update({
        approved_paid_days: revertedApprovedPaidDays,
        total_payable_days: revertedTotalPayableDays,
        approved_paid_leave_hours: revertedApprovedPaidLeaveHours,
        unpaid_hours: revertedUnpaidHours,
        deductions: revertedDeductions,
      })
      .eq("id", payroll.id);
    await supabase.from("leadgen_payroll_audit_log").insert({
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

// Mirrors updateLeaveRequestAction in the Cleaning CRM's own actions.ts
// exactly, against leadgen_leave_requests / leadgen_users.
export async function updateLeadgenLeaveRequestAction(requestId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
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

  if (datesChanged || statusChanged) {
    if (existing.payroll_applied_id) {
      reversalDetails = await reverseLeadgenLeaveRequestPayrollEffect(supabase, admin, existing);
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
      const { data: latestPayroll } = await supabase
        .from("leadgen_payroll")
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

  const { error } = await supabase.from("leadgen_leave_requests").update(updates).eq("id", requestId);
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

  await recordLeadgenLeaveAudit({
    leaveRequestId: requestId,
    agentId: existing.agent_id,
    agentName,
    action: "edited",
    performedById: admin.id,
    performedByName: performedByName(admin),
    details: { changed, payroll_reversal: reversalDetails },
  });

  if (statusChanged && (newStatus === "approved" || newStatus === "declined")) {
    await notifyAgentOfLeadgenLeaveDecision({
      leaveRequestId: requestId,
      agentId: existing.agent_id,
      agentEmail: existing.leadgen_users?.email ?? "",
      agentName,
      startDate,
      endDate,
      status: newStatus,
      decisionNote: existing.decision_note ?? null,
    });
  }

  revalidatePath("/leadgen/admin/leave-requests");
  revalidatePath("/leadgen/admin", "layout");
  revalidatePath("/leadgen/agent/leave-requests");
  revalidatePath("/leadgen/agent", "layout");
  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}

// Mirrors deleteLeaveRequestAction in the Cleaning CRM's own actions.ts
// exactly, against leadgen_leave_requests / leadgen_users.
export async function deleteLeadgenLeaveRequestAction(requestId: string): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await fetchLeaveRequestWithAgent(supabase, requestId);
  if (fetchError || !existing) return { error: fetchError ?? "Leave request not found." };
  if (existing.deleted_at) return { error: "This leave request has already been deleted." };

  const agentName = agentNameOf(existing);
  const reversalDetails = existing.payroll_applied_id
    ? await reverseLeadgenLeaveRequestPayrollEffect(supabase, admin, existing)
    : null;

  const { error } = await supabase
    .from("leadgen_leave_requests")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: admin.id,
      deleted_by_name: performedByName(admin),
      payroll_applied_id: null,
      payroll_applied_at: null,
    })
    .eq("id", requestId);
  if (error) return { error: `Failed to delete this leave request: ${error.message}` };

  await recordLeadgenLeaveAudit({
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

  revalidatePath("/leadgen/admin/leave-requests");
  revalidatePath("/leadgen/admin", "layout");
  revalidatePath("/leadgen/agent/leave-requests");
  revalidatePath("/leadgen/agent", "layout");
  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}
