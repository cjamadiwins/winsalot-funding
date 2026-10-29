"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "./supabase-server";
import { requireLeadgenAdmin } from "./leadgen-auth";

// Sales Conversion Bonus Server Actions. Every rule (who may act, CA$50,
// duplicates, approved-before-paid, mandatory payment reference) is enforced
// by the database functions in 20261029000000_sales_conversion_bonuses.sql,
// called with the caller's own session so auth.uid() is the real actor; these
// wrappers only translate the result and refresh the affected pages. Nothing
// here ever marks a bonus paid on its own.

export type SalesBonusActionResult = { error?: string; message?: string };

// SQLSTATEs the functions raise on purpose with a user-readable message.
const FRIENDLY_CODES = new Set(["42501", "23505", "23514", "22023", "P0002"]);
const GENERIC_ERROR = "Could not save the sales conversion bonus. Please try again.";

function refresh() {
  for (const path of [
    "/leadgen/admin/appointments",
    "/leadgen/admin/sales-bonuses",
    "/leadgen/admin/payroll",
    "/admin/crm/payroll",
    "/agent/pay",
    "/leadgen/agent/pay",
  ]) {
    revalidatePath(path);
  }
}

async function run(fn: string, args: Record<string, unknown>, message: string): Promise<SalesBonusActionResult> {
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await db.rpc(fn, args);
  if (error) return { error: error.code && FRIENDLY_CODES.has(error.code) ? error.message : GENERIC_ERROR };
  refresh();
  return { message };
}

// Lead Generation CRM Admin only - re-checked by the database function too.
export async function confirmSalesConversionAction(appointmentId: string, notes: string | null): Promise<SalesBonusActionResult> {
  await requireLeadgenAdmin();
  return run("winsalot_confirm_sales_conversion", { p_appointment_id: appointmentId, p_notes: notes?.trim() || null }, "Sale confirmed. The CA$50 bonus is pending approval.");
}

// The remaining actions are available to an Admin of either CRM (the Growth
// CRM payroll dashboard and the Lead Gen CRM share one ledger).
export async function approveSalesBonusAction(bonusId: string, payrollPayday: string): Promise<SalesBonusActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payrollPayday)) return { error: "Choose the payroll payday for this bonus." };
  return run("winsalot_approve_sales_bonus", { p_id: bonusId, p_payroll_payday: payrollPayday }, "Bonus approved for payroll. It is not paid until you confirm the payment.");
}

export async function markSalesBonusPaidAction(bonusId: string, paymentDate: string, paymentReference: string, confirmed: boolean): Promise<SalesBonusActionResult> {
  if (!confirmed) return { error: "Confirm that the agent payment has actually been sent." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return { error: "Enter the date the payment was sent." };
  return run("winsalot_mark_sales_bonus_paid", { p_id: bonusId, p_payment_date: paymentDate, p_payment_reference: paymentReference }, "Bonus marked as paid.");
}

export async function voidSalesBonusAction(bonusId: string, reason: string): Promise<SalesBonusActionResult> {
  return run("winsalot_void_sales_bonus", { p_id: bonusId, p_reason: reason }, "Bonus voided.");
}

export async function recordSalesBonusClientPaymentAction(bonusId: string, receivedDate: string, reference: string | null): Promise<SalesBonusActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) return { error: "Enter the date the client payment was received." };
  return run("winsalot_record_sales_bonus_client_payment", { p_id: bonusId, p_received_date: receivedDate, p_reference: reference?.trim() || null }, "Client payment recorded. The agent's bonus payment status is unchanged.");
}
