"use server";

// Shared server actions for the Holiday Pay feature (supabase/migrations/
// 0106_holiday_pay.sql). Every action here takes an explicit `crm`
// parameter ("growth" | "leadgen") and re-checks admin access itself via
// requireCrmAdmin/requireLeadgenAdmin - it is never trusted from the
// caller. Deliberately one shared implementation (unlike the payroll
// actions.ts files, which are duplicated per CRM against two separate
// tables): holidays and holiday_pay_assignments are single shared tables,
// so there is exactly one insert/update/delete path for them regardless
// of which CRM's admin is using it, matching the brief's "one shared
// holiday-pay record" requirement.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "./supabase-server";
import { requireCrmAdmin } from "./crm-auth";
import { requireLeadgenAdmin } from "./leadgen-auth";
import {
  calculateHolidayPayAmount,
  sharedIdentityKeyForEmail,
  HOLIDAY_PAY_CURRENCY,
  HOLIDAY_PAYMENT_TYPES,
  type HolidayPaymentType,
} from "./holiday-pay";

export type HolidayCrm = "growth" | "leadgen";

type ActionResult = { error?: string };

type AdminIdentity = { id: string; name: string; crm: HolidayCrm };

async function requireHolidayAdmin(crm: HolidayCrm): Promise<AdminIdentity> {
  if (crm === "growth") {
    const admin = await requireCrmAdmin();
    return { id: admin.id, name: admin.full_name || admin.email, crm };
  }
  const admin = await requireLeadgenAdmin();
  return { id: admin.id, name: admin.full_name || admin.email, crm };
}

function revalidateHolidayPayPaths() {
  revalidatePath("/admin/crm/payroll");
  revalidatePath("/agent/pay");
  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
}

async function insertHolidayAudit(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  admin: AdminIdentity,
  params: {
    holidayId: string | null;
    assignmentId?: string | null;
    action:
      | "holiday_created"
      | "holiday_updated"
      | "holiday_deactivated"
      | "holiday_reactivated"
      | "holiday_deleted"
      | "agent_assigned"
      | "assignment_removed"
      | "amount_overridden";
    reason: string | null;
    details: Record<string, unknown> | null;
  }
) {
  await supabase.from("holiday_pay_audit_log").insert({
    holiday_id: params.holidayId,
    assignment_id: params.assignmentId ?? null,
    action: params.action,
    performed_by_crm_user: admin.crm === "growth" ? admin.id : null,
    performed_by_leadgen_user: admin.crm === "leadgen" ? admin.id : null,
    performed_by_name: admin.name,
    reason: params.reason,
    details: params.details,
  });
}

function parseAmount(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || String(raw).trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function isValidPaymentType(value: string): value is HolidayPaymentType {
  return (HOLIDAY_PAYMENT_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------
// Holiday calendar CRUD.
// ---------------------------------------------------------------------

export async function createHolidayAction(crm: HolidayCrm, formData: FormData): Promise<ActionResult> {
  const admin = await requireHolidayAdmin(crm);
  const supabase = await createSupabaseServerClient();

  const name = String(formData.get("name") ?? "").trim();
  const holidayDate = String(formData.get("holiday_date") ?? "").trim();
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const paymentTypeRaw = String(formData.get("payment_type") ?? "").trim();
  const amount = parseAmount(formData, "amount");
  const percentage = parseAmount(formData, "percentage");
  const payrollPeriodPayday = String(formData.get("payroll_period_payday") ?? "").trim() || null;
  const eligibilityNotes = String(formData.get("eligibility_notes") ?? "").trim() || null;

  if (!name || !holidayDate || !jurisdiction) {
    return { error: "Holiday name, date, and jurisdiction are required." };
  }
  if (!isValidPaymentType(paymentTypeRaw)) {
    return { error: "Choose a valid payment type." };
  }
  if (paymentTypeRaw === "fixed_amount" && amount === null) {
    return { error: "An amount is required for a fixed holiday amount." };
  }
  if (paymentTypeRaw === "percentage_premium" && percentage === null) {
    return { error: "A percentage is required for a percentage premium." };
  }

  const { data: inserted, error } = await supabase
    .from("holidays")
    .insert({
      name,
      holiday_date: holidayDate,
      jurisdiction,
      description,
      payment_type: paymentTypeRaw,
      amount: paymentTypeRaw === "fixed_amount" ? amount : null,
      percentage: paymentTypeRaw === "percentage_premium" ? percentage : null,
      // Holiday pay always follows the agents' actual payroll currency
      // (NGN, system-wide today - see the HOLIDAY_PAY_CURRENCY comment),
      // never whatever a form happens to submit - the jurisdiction above
      // is independent and stays admin-editable.
      currency: HOLIDAY_PAY_CURRENCY,
      payroll_period_payday: payrollPeriodPayday,
      eligibility_notes: eligibilityNotes,
      is_active: true,
      created_by_crm_user: admin.crm === "growth" ? admin.id : null,
      created_by_leadgen_user: admin.crm === "leadgen" ? admin.id : null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: `Failed to create holiday: ${error?.message ?? "unknown error"}` };
  }

  await insertHolidayAudit(supabase, admin, {
    holidayId: inserted.id,
    action: "holiday_created",
    reason: null,
    details: { name, holiday_date: holidayDate, jurisdiction, payment_type: paymentTypeRaw },
  });

  revalidateHolidayPayPaths();
  return {};
}

export async function updateHolidayAction(crm: HolidayCrm, holidayId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireHolidayAdmin(crm);
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("holidays")
    .select("id, deleted_at")
    .eq("id", holidayId)
    .maybeSingle();
  if (fetchError || !existing) return { error: "Holiday not found." };
  if (existing.deleted_at) return { error: "This holiday has been deleted." };

  const name = String(formData.get("name") ?? "").trim();
  const holidayDate = String(formData.get("holiday_date") ?? "").trim();
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const paymentTypeRaw = String(formData.get("payment_type") ?? "").trim();
  const amount = parseAmount(formData, "amount");
  const percentage = parseAmount(formData, "percentage");
  const payrollPeriodPayday = String(formData.get("payroll_period_payday") ?? "").trim() || null;
  const eligibilityNotes = String(formData.get("eligibility_notes") ?? "").trim() || null;

  if (!name || !holidayDate || !jurisdiction) {
    return { error: "Holiday name, date, and jurisdiction are required." };
  }
  if (!isValidPaymentType(paymentTypeRaw)) {
    return { error: "Choose a valid payment type." };
  }
  if (paymentTypeRaw === "fixed_amount" && amount === null) {
    return { error: "An amount is required for a fixed holiday amount." };
  }
  if (paymentTypeRaw === "percentage_premium" && percentage === null) {
    return { error: "A percentage is required for a percentage premium." };
  }

  const { error } = await supabase
    .from("holidays")
    .update({
      name,
      holiday_date: holidayDate,
      jurisdiction,
      description,
      payment_type: paymentTypeRaw,
      amount: paymentTypeRaw === "fixed_amount" ? amount : null,
      percentage: paymentTypeRaw === "percentage_premium" ? percentage : null,
      // See createHolidayAction - always NGN, never form-submitted.
      currency: HOLIDAY_PAY_CURRENCY,
      payroll_period_payday: payrollPeriodPayday,
      eligibility_notes: eligibilityNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", holidayId);

  if (error) return { error: `Failed to update holiday: ${error.message}` };

  await insertHolidayAudit(supabase, admin, {
    holidayId,
    action: "holiday_updated",
    reason: String(formData.get("edit_reason") ?? "").trim() || null,
    details: { name, holiday_date: holidayDate, jurisdiction, payment_type: paymentTypeRaw },
  });

  revalidateHolidayPayPaths();
  return {};
}

export async function deactivateHolidayAction(crm: HolidayCrm, holidayId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireHolidayAdmin(crm);
  const supabase = await createSupabaseServerClient();

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "A reason is required to deactivate a holiday." };

  const { data: existing, error: fetchError } = await supabase
    .from("holidays")
    .select("id, deleted_at")
    .eq("id", holidayId)
    .maybeSingle();
  if (fetchError || !existing) return { error: "Holiday not found." };
  if (existing.deleted_at) return { error: "This holiday has been deleted." };

  const { error } = await supabase
    .from("holidays")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", holidayId);
  if (error) return { error: `Failed to deactivate holiday: ${error.message}` };

  await insertHolidayAudit(supabase, admin, {
    holidayId,
    action: "holiday_deactivated",
    reason,
    details: null,
  });

  revalidateHolidayPayPaths();
  return {};
}

export async function reactivateHolidayAction(crm: HolidayCrm, holidayId: string): Promise<ActionResult> {
  const admin = await requireHolidayAdmin(crm);
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("holidays")
    .select("id, deleted_at")
    .eq("id", holidayId)
    .maybeSingle();
  if (fetchError || !existing) return { error: "Holiday not found." };
  if (existing.deleted_at) return { error: "This holiday has been deleted." };

  const { error } = await supabase
    .from("holidays")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", holidayId);
  if (error) return { error: `Failed to reactivate holiday: ${error.message}` };

  await insertHolidayAudit(supabase, admin, {
    holidayId,
    action: "holiday_reactivated",
    reason: null,
    details: null,
  });

  revalidateHolidayPayPaths();
  return {};
}

// "Allow the admin to edit, deactivate or delete a holiday-pay entry
// before payroll is finalized" / "Require confirmation before deletion" -
// confirm_delete="true" stands in for that confirmation step, enforced
// server-side (not just a client-side confirm dialog) same as
// reopenPayrollAction's confirm_reopen. Soft-delete only - see the
// migration's header comment on why (audit trail preservation).
export async function deleteHolidayAction(crm: HolidayCrm, holidayId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireHolidayAdmin(crm);
  const supabase = await createSupabaseServerClient();

  if (formData.get("confirm_delete") !== "true") {
    return { error: "Confirm you want to delete this holiday." };
  }
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "A reason is required to delete a holiday." };

  const { data: existing, error: fetchError } = await supabase
    .from("holidays")
    .select("id, deleted_at")
    .eq("id", holidayId)
    .maybeSingle();
  if (fetchError || !existing) return { error: "Holiday not found." };
  if (existing.deleted_at) return { error: "This holiday has already been deleted." };

  const { error } = await supabase
    .from("holidays")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_crm_user: admin.crm === "growth" ? admin.id : null,
      deleted_by_leadgen_user: admin.crm === "leadgen" ? admin.id : null,
    })
    .eq("id", holidayId);
  if (error) return { error: `Failed to delete holiday: ${error.message}` };

  await insertHolidayAudit(supabase, admin, {
    holidayId,
    action: "holiday_deleted",
    reason,
    details: null,
  });

  revalidateHolidayPayPaths();
  return {};
}

// ---------------------------------------------------------------------
// Agent assignment.
// ---------------------------------------------------------------------

type EligibleAgent = { id: string; full_name: string; email: string };

export type AssignHolidayResult = ActionResult & {
  assignedCount?: number;
  skipped?: { name: string; reason: string }[];
};

// Assigns a holiday to either every active agent in `crm`, or a specific
// list of agent ids. Cross-CRM duplicate prevention (brief: "Do not count
// the same holiday twice if an agent works in both CRMs") is enforced by
// the database's holiday_pay_assignments_unique_identity_per_holiday
// partial unique index (migration 0106) on (holiday_id,
// shared_identity_key) - a person whose email already holds an active
// assignment for this holiday under the OTHER CRM is skipped here, not
// silently double-assigned.
export async function assignHolidayAction(crm: HolidayCrm, holidayId: string, formData: FormData): Promise<AssignHolidayResult> {
  const admin = await requireHolidayAdmin(crm);
  const supabase = await createSupabaseServerClient();

  const { data: holiday, error: holidayError } = await supabase
    .from("holidays")
    .select("id, payment_type, amount, percentage, deleted_at")
    .eq("id", holidayId)
    .maybeSingle();
  if (holidayError || !holiday) return { error: "Holiday not found." };
  if (holiday.deleted_at) return { error: "This holiday has been deleted." };

  const allAgents = formData.get("all_agents") === "true";
  const selectedIds = formData.getAll("agent_ids").map(String).filter(Boolean);
  if (!allAgents && selectedIds.length === 0) {
    return { error: "Select at least one agent, or choose All Agents." };
  }

  const usersTable = crm === "growth" ? "crm_users" : "leadgen_users";
  let query = supabase.from(usersTable).select("id, full_name, email").eq("role", "agent").eq("active", true);
  if (!allAgents) query = query.in("id", selectedIds);
  const { data: agentsData, error: agentsError } = await query;
  if (agentsError) return { error: `Failed to load agents: ${agentsError.message}` };
  const agents = (agentsData ?? []) as EligibleAgent[];
  if (agents.length === 0) return { error: "No eligible agents found." };

  const calculatedAmount = calculateHolidayPayAmount(
    holiday.payment_type as HolidayPaymentType,
    holiday.amount,
    holiday.percentage
  );

  const assignedIds: string[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const agent of agents) {
    const sharedIdentityKey = sharedIdentityKeyForEmail(agent.email);
    const agentColumn = crm === "growth" ? "crm_user_id" : "leadgen_user_id";

    const { data: existingRow } = await supabase
      .from("holiday_pay_assignments")
      .select("id, status")
      .eq("holiday_id", holidayId)
      .eq(agentColumn, agent.id)
      .maybeSingle();

    if (existingRow?.status === "assigned") {
      skipped.push({ name: agent.full_name, reason: "Already assigned to this holiday." });
      continue;
    }

    if (existingRow) {
      const { error: updateError } = await supabase
        .from("holiday_pay_assignments")
        .update({
          status: "assigned",
          calculated_amount: calculatedAmount,
          override_amount: null,
          override_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRow.id);
      if (updateError) {
        skipped.push({
          name: agent.full_name,
          reason: "Already covered by an active assignment for this holiday in the other CRM.",
        });
        continue;
      }
      assignedIds.push(agent.id);
      continue;
    }

    const { error: insertError } = await supabase.from("holiday_pay_assignments").insert({
      holiday_id: holidayId,
      [agentColumn]: agent.id,
      shared_identity_key: sharedIdentityKey,
      calculated_amount: calculatedAmount,
      status: "assigned",
      assigned_by_crm_user: admin.crm === "growth" ? admin.id : null,
      assigned_by_leadgen_user: admin.crm === "leadgen" ? admin.id : null,
    });
    if (insertError) {
      skipped.push({
        name: agent.full_name,
        reason: "Already covered by an active assignment for this holiday in the other CRM.",
      });
      continue;
    }
    assignedIds.push(agent.id);
  }

  await insertHolidayAudit(supabase, admin, {
    holidayId,
    action: "agent_assigned",
    reason: String(formData.get("assignment_note") ?? "").trim() || null,
    details: { all_agents: allAgents, assigned_count: assignedIds.length, skipped },
  });

  revalidateHolidayPayPaths();
  return { assignedCount: assignedIds.length, skipped };
}

export async function removeAssignmentAction(crm: HolidayCrm, assignmentId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireHolidayAdmin(crm);
  const supabase = await createSupabaseServerClient();

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "A reason is required to remove a holiday pay assignment." };

  const { data: existing, error: fetchError } = await supabase
    .from("holiday_pay_assignments")
    .select("id, holiday_id, status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (fetchError || !existing) return { error: "Assignment not found." };
  if (existing.status === "cancelled") return { error: "This assignment has already been removed." };

  const { error } = await supabase
    .from("holiday_pay_assignments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", assignmentId);
  if (error) return { error: `Failed to remove assignment: ${error.message}` };

  await insertHolidayAudit(supabase, admin, {
    holidayId: existing.holiday_id,
    assignmentId,
    action: "assignment_removed",
    reason,
    details: null,
  });

  revalidateHolidayPayPaths();
  return {};
}

// "Allow the admin to override the calculated amount for an individual
// agent with a required explanation."
export async function overrideAssignmentAmountAction(
  crm: HolidayCrm,
  assignmentId: string,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireHolidayAdmin(crm);
  const supabase = await createSupabaseServerClient();

  const overrideAmount = parseAmount(formData, "override_amount");
  const overrideReason = String(formData.get("override_reason") ?? "").trim();
  if (overrideAmount === null) return { error: "A valid override amount is required." };
  if (!overrideReason) return { error: "An explanation is required to override the calculated amount." };

  const { data: existing, error: fetchError } = await supabase
    .from("holiday_pay_assignments")
    .select("id, holiday_id, status, calculated_amount")
    .eq("id", assignmentId)
    .maybeSingle();
  if (fetchError || !existing) return { error: "Assignment not found." };
  if (existing.status !== "assigned") return { error: "Only an active assignment can be overridden." };

  const { error } = await supabase
    .from("holiday_pay_assignments")
    .update({ override_amount: overrideAmount, override_reason: overrideReason, updated_at: new Date().toISOString() })
    .eq("id", assignmentId);
  if (error) return { error: `Failed to override amount: ${error.message}` };

  await insertHolidayAudit(supabase, admin, {
    holidayId: existing.holiday_id,
    assignmentId,
    action: "amount_overridden",
    reason: overrideReason,
    details: { from: existing.calculated_amount, to: overrideAmount },
  });

  revalidateHolidayPayPaths();
  return {};
}

// ---------------------------------------------------------------------
// Payroll form integration: sums an agent's approved holiday-pay
// assignments for a given payday, so the admin's "Load Holiday Pay"
// button (payroll create/update form) can pull the figure in without
// re-deriving it by hand. Never writes anything - crm_payroll.holiday_pay
// / leadgen_payroll.holiday_pay stays a plain admin-entered-with-a-reason
// field, same as every other payroll figure (see migration 0106's header
// comment on why holiday pay is a persisted column, not a live join).
// ---------------------------------------------------------------------

export type HolidayPaySummaryItem = {
  holidayName: string;
  paymentType: HolidayPaymentType;
  effectiveAmount: number;
  currency: string;
};

export async function loadHolidayPaySummaryAction(
  crm: HolidayCrm,
  agentId: string,
  payday: string
): Promise<{ error?: string; total?: number; items?: HolidayPaySummaryItem[] }> {
  await requireHolidayAdmin(crm);
  if (!agentId || !payday) return { error: "Agent and payday are required." };

  const supabase = await createSupabaseServerClient();
  const agentColumn = crm === "growth" ? "crm_user_id" : "leadgen_user_id";

  const { data, error } = await supabase
    .from("holiday_pay_assignments")
    .select("effective_amount, holidays!inner(name, payment_type, currency, payroll_period_payday, deleted_at)")
    .eq(agentColumn, agentId)
    .eq("status", "assigned")
    .eq("holidays.payroll_period_payday", payday)
    .is("holidays.deleted_at", null);

  if (error) return { error: `Failed to load holiday pay: ${error.message}` };

  type Row = { effective_amount: number; holidays: { name: string; payment_type: HolidayPaymentType; currency: string } };
  const rows = (data ?? []) as unknown as Row[];
  const items: HolidayPaySummaryItem[] = rows.map((row) => ({
    holidayName: row.holidays.name,
    paymentType: row.holidays.payment_type,
    effectiveAmount: row.effective_amount,
    currency: row.holidays.currency,
  }));
  const total = Math.round(items.reduce((sum, item) => sum + item.effectiveAmount, 0) * 100) / 100;

  return { total, items };
}
