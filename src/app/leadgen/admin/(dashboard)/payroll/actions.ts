"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getPayPeriodForPayday } from "@/lib/payroll";

// Every action below returns { error } instead of throwing, matching the
// pattern used throughout the Lead Generation CRM's Server Actions.
type ActionResult = { error?: string };

function parseAmount(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || String(raw).trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export async function createLeadgenPayrollAction(formData: FormData): Promise<ActionResult> {
  await requireLeadgenAdmin();

  const agentId = String(formData.get("agent_id") ?? "").trim();
  const payday = String(formData.get("payday") ?? "").trim();
  const baseSalary = parseAmount(formData, "base_salary");
  const internetAllowance = parseAmount(formData, "internet_allowance");
  const bonusCommission = parseAmount(formData, "bonus_commission");
  const deductions = parseAmount(formData, "deductions");
  const adminNotes = String(formData.get("admin_notes") ?? "").trim() || null;

  if (!agentId || !payday) {
    return { error: "Agent and payday are required." };
  }
  if (baseSalary === null || internetAllowance === null || bonusCommission === null || deductions === null) {
    return { error: "Amounts must be zero or a positive number." };
  }

  const { start, end } = getPayPeriodForPayday(payday);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_payroll").insert({
    agent_id: agentId,
    pay_period_start: start,
    pay_period_end: end,
    payday,
    base_salary: baseSalary,
    internet_allowance: internetAllowance,
    bonus_commission: bonusCommission,
    deductions,
    admin_notes: adminNotes,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "A payroll record for this agent and payday already exists." };
    }
    return { error: "Failed to save the payroll record." };
  }

  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}

export async function updateLeadgenPayrollAction(recordId: string, formData: FormData): Promise<ActionResult> {
  await requireLeadgenAdmin();

  const payday = String(formData.get("payday") ?? "").trim();
  const baseSalary = parseAmount(formData, "base_salary");
  const internetAllowance = parseAmount(formData, "internet_allowance");
  const bonusCommission = parseAmount(formData, "bonus_commission");
  const deductions = parseAmount(formData, "deductions");
  const adminNotes = String(formData.get("admin_notes") ?? "").trim() || null;

  if (!payday) {
    return { error: "Payday is required." };
  }
  if (baseSalary === null || internetAllowance === null || bonusCommission === null || deductions === null) {
    return { error: "Amounts must be zero or a positive number." };
  }

  const { start, end } = getPayPeriodForPayday(payday);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("leadgen_payroll")
    .update({
      pay_period_start: start,
      pay_period_end: end,
      payday,
      base_salary: baseSalary,
      internet_allowance: internetAllowance,
      bonus_commission: bonusCommission,
      deductions,
      admin_notes: adminNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId);

  if (error) {
    if (error.code === "23505") {
      return { error: "A payroll record for this agent and payday already exists." };
    }
    return { error: "Failed to update the payroll record." };
  }

  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}

export async function markLeadgenPayrollPaidAction(recordId: string, formData: FormData): Promise<ActionResult> {
  await requireLeadgenAdmin();

  const actualPaymentDate = String(formData.get("actual_payment_date") ?? "").trim();
  if (!actualPaymentDate) {
    return { error: "Actual payment date is required." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("leadgen_payroll")
    .update({
      status: "paid",
      actual_payment_date: actualPaymentDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId);

  if (error) return { error: "Failed to mark this payroll record as paid." };

  revalidatePath("/leadgen/admin/payroll");
  revalidatePath("/leadgen/agent/pay");
  return {};
}
