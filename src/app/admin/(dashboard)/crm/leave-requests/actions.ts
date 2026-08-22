"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmUserRow } from "@/lib/crm-types";
import { calculateLeaveDeductionAmount, countScheduledLeaveDays, type LeaveAttendanceStatus } from "@/lib/leave-requests";
import { STANDARD_BIWEEKLY_PAY, STANDARD_WORKING_DAYS, calculateBasePayEarned } from "@/lib/payroll";
import { notifyAgentOfCrmLeaveDecision, recordCrmLeaveAudit } from "@/lib/crm-leave-notifications";

// Returns { error } instead of throwing, matching crm/payroll/actions.ts -
// Next.js redacts thrown Server Action errors to a generic message in
// production.
type ActionResult = { error?: string };

type LeaveRequestWithAgent = {
  id: string;
  agent_id: string;
  start_date: string;
  end_date: string;
  status: string;
  attendance_status: LeaveAttendanceStatus;
  deduction_amount: number | null;
  deduction_reason: string | null;
  deduction_confirmed: boolean;
  payroll_applied_id: string | null;
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
      .select("standard_biweekly_pay, standard_working_days")
      .eq("agent_id", existing.agent_id)
      .order("payday", { ascending: false })
      .limit(1)
      .maybeSingle();

    const standardBiweeklyPay = latestPayroll?.standard_biweekly_pay ?? STANDARD_BIWEEKLY_PAY;
    const standardWorkingDays = latestPayroll?.standard_working_days ?? STANDARD_WORKING_DAYS;
    const { amount, scheduledDays } = calculateLeaveDeductionAmount(
      existing.start_date,
      existing.end_date,
      standardBiweeklyPay,
      standardWorkingDays
    );

    updates.deduction_amount = amount;
    updates.deduction_reason = `Unapproved absence: ${existing.start_date} to ${existing.end_date} (${scheduledDays} scheduled working day${scheduledDays === 1 ? "" : "s"}, leave request declined)`;
    auditDetails = { deduction_amount: amount, scheduled_days: scheduledDays };
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
  if (existing.attendance_status !== "paid_leave") {
    return { error: "Only requests marked Paid Leave can be applied to payroll." };
  }
  if (existing.payroll_applied_id) {
    return { error: "This paid leave has already been applied to payroll." };
  }

  const agentName = agentNameOf(existing);
  const scheduledDays = countScheduledLeaveDays(existing.start_date, existing.end_date);
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

  const newApprovedPaidDays = matchingPayroll.approved_paid_days + scheduledDays;
  const newTotalPayableDays = matchingPayroll.days_present + newApprovedPaidDays;
  const newBasePayEarned = calculateBasePayEarned(
    newTotalPayableDays,
    matchingPayroll.standard_biweekly_pay,
    matchingPayroll.standard_working_days
  );

  const { error: payrollError } = await supabase
    .from("crm_payroll")
    .update({
      approved_paid_days: newApprovedPaidDays,
      total_payable_days: newTotalPayableDays,
      base_pay_earned: newBasePayEarned,
    })
    .eq("id", matchingPayroll.id);
  if (payrollError) return { error: `Failed to apply paid leave to payroll: ${payrollError.message}` };

  await supabase.from("crm_payroll_audit_log").insert({
    payroll_id: matchingPayroll.id,
    agent_id: existing.agent_id,
    action: "days_adjusted",
    performed_by: admin.id,
    performed_by_name: performedByName(admin),
    reason: `Approved leave applied: ${existing.start_date} to ${existing.end_date}`,
    details: {
      leave_request_id: requestId,
      from: { approved_paid_days: matchingPayroll.approved_paid_days, total_payable_days: matchingPayroll.total_payable_days },
      to: { approved_paid_days: newApprovedPaidDays, total_payable_days: newTotalPayableDays },
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
