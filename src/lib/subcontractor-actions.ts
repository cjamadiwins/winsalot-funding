"use server";

// Shared server actions for the Subcontractors feature (supabase/
// migrations/0135_subcontractor_payroll.sql). Unlike holiday-pay-actions.ts
// (one shared table for both CRMs), crm_subcontractors/
// crm_subcontractor_payments and leadgen_subcontractors/
// leadgen_subcontractor_payments are four separate tables, mirroring the
// crm_payroll/leadgen_payroll split - a subcontractor added from one CRM's
// payroll page is never visible from the other's. This file is still one
// shared implementation (an explicit `crm` parameter selects which pair of
// tables to operate on) purely to avoid duplicating near-identical CRUD
// logic twice; the underlying data itself stays fully separate per CRM.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "./supabase-server";
import { requireCrmAdmin } from "./crm-auth";
import { requireLeadgenAdmin } from "./leadgen-auth";
import {
  SUBCONTRACTOR_CURRENCIES,
  SUBCONTRACTOR_PAY_TYPES,
  calculateSubcontractorGrossPay,
  isQuantityBasedPayType,
  type SubcontractorCurrency,
  type SubcontractorPayType,
} from "./subcontractor-payroll";

export type SubcontractorCrm = "growth" | "leadgen";

type ActionResult = { error?: string };

function tablesFor(crm: SubcontractorCrm) {
  return crm === "growth"
    ? { subcontractors: "crm_subcontractors", payments: "crm_subcontractor_payments" }
    : { subcontractors: "leadgen_subcontractors", payments: "leadgen_subcontractor_payments" };
}

async function requireSubcontractorAdmin(crm: SubcontractorCrm): Promise<{ id: string }> {
  const admin = crm === "growth" ? await requireCrmAdmin() : await requireLeadgenAdmin();
  return { id: admin.id };
}

function revalidateSubcontractorPaths(crm: SubcontractorCrm) {
  revalidatePath(crm === "growth" ? "/admin/crm/payroll" : "/leadgen/admin/payroll");
}

function isValidCurrency(value: string): value is SubcontractorCurrency {
  return (SUBCONTRACTOR_CURRENCIES as readonly string[]).includes(value);
}

function isValidPayType(value: string): value is SubcontractorPayType {
  return (SUBCONTRACTOR_PAY_TYPES as readonly string[]).includes(value);
}

function parseNonNegativeAmount(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || String(raw).trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

// ---------------------------------------------------------------------
// Subcontractor profile CRUD.
// ---------------------------------------------------------------------

export async function createSubcontractorAction(crm: SubcontractorCrm, formData: FormData): Promise<ActionResult> {
  const admin = await requireSubcontractorAdmin(crm);
  const supabase = await createSupabaseServerClient();
  const { subcontractors } = tablesFor(crm);

  const fullName = String(formData.get("full_name") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? "").trim();
  const payType = String(formData.get("pay_type") ?? "").trim();
  const payRate = parseNonNegativeAmount(formData, "pay_rate");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const businessClientId = String(formData.get("business_client_id") ?? "").trim() || null;

  if (!fullName) return { error: "Full name is required." };
  if (!isValidCurrency(currency)) return { error: "Choose a valid currency." };
  if (!isValidPayType(payType)) return { error: "Choose a valid pay type." };
  if (payRate === null) return { error: "Pay rate must be zero or a positive number." };

  const { error } = await supabase.from(subcontractors).insert({
    full_name: fullName,
    business_client_id: businessClientId,
    country,
    currency,
    pay_type: payType,
    pay_rate: payRate,
    notes,
    active: true,
    created_by: admin.id,
  });

  if (error) return { error: `Failed to create subcontractor: ${error.message}` };

  revalidateSubcontractorPaths(crm);
  return {};
}

export async function updateSubcontractorAction(
  crm: SubcontractorCrm,
  subcontractorId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireSubcontractorAdmin(crm);
  const supabase = await createSupabaseServerClient();
  const { subcontractors } = tablesFor(crm);

  const fullName = String(formData.get("full_name") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? "").trim();
  const payType = String(formData.get("pay_type") ?? "").trim();
  const payRate = parseNonNegativeAmount(formData, "pay_rate");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const businessClientId = String(formData.get("business_client_id") ?? "").trim() || null;

  if (!fullName) return { error: "Full name is required." };
  if (!isValidCurrency(currency)) return { error: "Choose a valid currency." };
  if (!isValidPayType(payType)) return { error: "Choose a valid pay type." };
  if (payRate === null) return { error: "Pay rate must be zero or a positive number." };

  const { error } = await supabase
    .from(subcontractors)
    .update({
      full_name: fullName,
      business_client_id: businessClientId,
      country,
      currency,
      pay_type: payType,
      pay_rate: payRate,
      notes,
    })
    .eq("id", subcontractorId);

  if (error) return { error: `Failed to update subcontractor: ${error.message}` };

  revalidateSubcontractorPaths(crm);
  return {};
}

export async function deactivateSubcontractorAction(crm: SubcontractorCrm, subcontractorId: string): Promise<ActionResult> {
  const admin = await requireSubcontractorAdmin(crm);
  const supabase = await createSupabaseServerClient();
  const { subcontractors } = tablesFor(crm);

  const { error } = await supabase
    .from(subcontractors)
    .update({ active: false, deactivated_at: new Date().toISOString(), deactivated_by: admin.id })
    .eq("id", subcontractorId);

  if (error) return { error: `Failed to deactivate subcontractor: ${error.message}` };

  revalidateSubcontractorPaths(crm);
  return {};
}

export async function reactivateSubcontractorAction(crm: SubcontractorCrm, subcontractorId: string): Promise<ActionResult> {
  await requireSubcontractorAdmin(crm);
  const supabase = await createSupabaseServerClient();
  const { subcontractors } = tablesFor(crm);

  const { error } = await supabase
    .from(subcontractors)
    .update({ active: true, deactivated_at: null, deactivated_by: null })
    .eq("id", subcontractorId);

  if (error) return { error: `Failed to reactivate subcontractor: ${error.message}` };

  revalidateSubcontractorPaths(crm);
  return {};
}

// ---------------------------------------------------------------------
// Payment (payroll period) CRUD.
// ---------------------------------------------------------------------

// Shared validation + payload building for create/update, so the
// quantity x rate = gross pay rule (requirement 8) and the flat-vs-
// quantity-based branch (requirement 7) are computed identically by both.
function buildPaymentPayload(
  formData: FormData,
  payType: SubcontractorPayType,
  defaultRate: number
): { error: string } | { payload: Record<string, unknown> } {
  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();
  const adjustments = parseNonNegativeAmount(formData, "adjustments");
  const deductions = parseNonNegativeAmount(formData, "deductions");
  const status = String(formData.get("status") ?? "pending").trim();
  const paymentDate = String(formData.get("payment_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!periodStart || !periodEnd) return { error: "Work/payment period start and end are required." };
  if (periodEnd < periodStart) return { error: "Period end must be on or after period start." };
  if (adjustments === null || deductions === null) return { error: "Adjustments and deductions must be zero or a positive number." };
  if (!["pending", "approved", "paid"].includes(status)) return { error: "Invalid payment status." };
  if (status === "paid" && !paymentDate) return { error: "A payment date is required to mark this as Paid." };
  if (status !== "paid" && paymentDate) return { error: "Payment date can only be set when status is Paid." };

  let quantity: number | null = null;
  let grossPay: number;

  if (isQuantityBasedPayType(payType)) {
    const rawQuantity = parseNonNegativeAmount(formData, "quantity");
    if (rawQuantity === null) return { error: "Approved quantity must be zero or a positive number." };
    quantity = rawQuantity;
    grossPay = calculateSubcontractorGrossPay(payType, quantity, defaultRate);
  } else {
    const rawGrossPay = parseNonNegativeAmount(formData, "gross_pay");
    if (rawGrossPay === null) return { error: "Gross pay must be zero or a positive number." };
    grossPay = rawGrossPay;
  }

  return {
    payload: {
      period_start: periodStart,
      period_end: periodEnd,
      quantity,
      gross_pay: grossPay,
      adjustments,
      deductions,
      status,
      payment_date: paymentDate,
      notes,
    },
  };
}

export async function createSubcontractorPaymentAction(
  crm: SubcontractorCrm,
  subcontractorId: string,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireSubcontractorAdmin(crm);
  const supabase = await createSupabaseServerClient();
  const { subcontractors, payments } = tablesFor(crm);

  const { data: subcontractor, error: fetchError } = await supabase
    .from(subcontractors)
    .select("id, pay_type, pay_rate")
    .eq("id", subcontractorId)
    .maybeSingle();
  if (fetchError || !subcontractor) return { error: "Subcontractor not found." };

  const built = buildPaymentPayload(formData, subcontractor.pay_type as SubcontractorPayType, subcontractor.pay_rate as number);
  if ("error" in built) return { error: built.error };

  const { error } = await supabase.from(payments).insert({
    subcontractor_id: subcontractorId,
    created_by: admin.id,
    ...built.payload,
  });

  if (error) return { error: `Failed to save payment: ${error.message}` };

  revalidateSubcontractorPaths(crm);
  return {};
}

export async function updateSubcontractorPaymentAction(
  crm: SubcontractorCrm,
  paymentId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireSubcontractorAdmin(crm);
  const supabase = await createSupabaseServerClient();
  const { subcontractors, payments } = tablesFor(crm);

  const { data: existing, error: fetchError } = await supabase
    .from(payments)
    .select("id, subcontractor_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (fetchError || !existing) return { error: "Payment not found." };

  const { data: subcontractor, error: subError } = await supabase
    .from(subcontractors)
    .select("id, pay_type, pay_rate")
    .eq("id", existing.subcontractor_id)
    .maybeSingle();
  if (subError || !subcontractor) return { error: "Subcontractor not found." };

  const built = buildPaymentPayload(formData, subcontractor.pay_type as SubcontractorPayType, subcontractor.pay_rate as number);
  if ("error" in built) return { error: built.error };

  const { error } = await supabase.from(payments).update(built.payload).eq("id", paymentId);
  if (error) return { error: `Failed to update payment: ${error.message}` };

  revalidateSubcontractorPaths(crm);
  return {};
}
