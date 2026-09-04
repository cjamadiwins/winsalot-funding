"use server";

// Growth CRM Subcontractor Management: all admin + subcontractor-facing
// server actions (migrations 0136/0137). Growth-CRM-only - imports only
// Growth CRM auth/clients, never touches leadgen_* anything.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "./supabase-server";
import { getSupabaseAdmin } from "./supabase-admin";
import { requireCrmAdmin, requireCrmSubcontractor } from "./crm-auth";
import { getAuthRedirectBaseUrl } from "./site-url";
import { getClientIpFromHeaders } from "./rate-limit";
import {
  SUBCONTRACTOR_CURRENCIES,
  SUBCONTRACTOR_PAY_TYPES,
  calculateSubcontractorGrossPay,
  isQuantityBasedPayType,
  type SubcontractorCurrency,
  type SubcontractorPayType,
} from "./subcontractor-payroll";
import { renderSubcontractorAgreementTemplate } from "./crm-subcontractor-agreement";
import {
  SUBCONTRACTOR_CRM_ACCESS_OPTIONS,
  SUBCONTRACTOR_STATUSES,
  type SubcontractorAuditAction,
  type SubcontractorCrmAccess,
  type SubcontractorPaymentStatus,
  type SubcontractorStatus,
} from "./crm-subcontractor-types";

type ActionResult = { error?: string };

function isValidCurrency(value: string): value is SubcontractorCurrency {
  return (SUBCONTRACTOR_CURRENCIES as readonly string[]).includes(value);
}

function isValidPayType(value: string): value is SubcontractorPayType {
  return (SUBCONTRACTOR_PAY_TYPES as readonly string[]).includes(value);
}

function isValidStatus(value: string): value is SubcontractorStatus {
  return (SUBCONTRACTOR_STATUSES as readonly string[]).includes(value);
}

function parseNonNegativeAmount(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || String(raw).trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

async function insertAuditRow(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  params: {
    subcontractorId: string;
    action: SubcontractorAuditAction;
    performedById: string;
    performedByName: string;
    reason: string | null;
    details: Record<string, unknown> | null;
  }
) {
  await supabase.from("crm_subcontractor_audit_log").insert({
    subcontractor_id: params.subcontractorId,
    action: params.action,
    performed_by: params.performedById,
    performed_by_name: params.performedByName,
    reason: params.reason,
    details: params.details,
  });
}

// ---------------------------------------------------------------------
// Admin: profile CRUD.
// ---------------------------------------------------------------------

export async function createSubcontractorAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const businessName = String(formData.get("business_name") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? "").trim();
  const payType = String(formData.get("pay_type") ?? "").trim();
  const payRate = parseNonNegativeAmount(formData, "pay_rate");
  const startDate = String(formData.get("start_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!fullName) return { error: "Full name is required." };
  if (!isValidCurrency(currency)) return { error: "Choose a valid currency." };
  if (!isValidPayType(payType)) return { error: "Choose a valid pay type." };
  if (payRate === null) return { error: "Pay rate must be zero or a positive number." };

  const { data: inserted, error } = await supabase
    .from("crm_subcontractors")
    .insert({
      full_name: fullName,
      email,
      phone,
      business_name: businessName,
      country,
      currency,
      pay_type: payType,
      pay_rate: payRate,
      start_date: startDate,
      notes,
      status: "pending_onboarding",
      active: true,
      created_by: admin.id,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: `Failed to create subcontractor: ${error?.message ?? "unknown error"}` };

  await supabase.from("crm_subcontractor_permissions").insert({ subcontractor_id: inserted.id });

  await insertAuditRow(supabase, {
    subcontractorId: inserted.id,
    action: "created",
    performedById: admin.id,
    performedByName: admin.full_name || admin.email,
    reason: null,
    details: { full_name: fullName },
  });

  revalidatePath("/admin/crm/subcontractors");
  return {};
}

export async function updateSubcontractorProfileAction(subcontractorId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("crm_subcontractors")
    .select("currency, pay_type, pay_rate")
    .eq("id", subcontractorId)
    .maybeSingle();
  if (!existing) return { error: "Subcontractor not found." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const businessName = String(formData.get("business_name") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? "").trim();
  const payType = String(formData.get("pay_type") ?? "").trim();
  const payRate = parseNonNegativeAmount(formData, "pay_rate");
  const startDate = String(formData.get("start_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!fullName) return { error: "Full name is required." };
  if (!isValidCurrency(currency)) return { error: "Choose a valid currency." };
  if (!isValidPayType(payType)) return { error: "Choose a valid pay type." };
  if (payRate === null) return { error: "Pay rate must be zero or a positive number." };

  const { error } = await supabase
    .from("crm_subcontractors")
    .update({
      full_name: fullName,
      email,
      phone,
      business_name: businessName,
      country,
      currency,
      pay_type: payType,
      pay_rate: payRate,
      start_date: startDate,
      notes,
    })
    .eq("id", subcontractorId);

  if (error) return { error: `Failed to update subcontractor: ${error.message}` };

  const compensationChanged = existing.currency !== currency || existing.pay_type !== payType || existing.pay_rate !== payRate;

  await insertAuditRow(supabase, {
    subcontractorId,
    action: compensationChanged ? "compensation_changed" : "profile_updated",
    performedById: admin.id,
    performedByName: admin.full_name || admin.email,
    reason: null,
    details: compensationChanged
      ? { from: { currency: existing.currency, pay_type: existing.pay_type, pay_rate: existing.pay_rate }, to: { currency, pay_type: payType, pay_rate: payRate } }
      : null,
  });

  revalidatePath("/admin/crm/subcontractors");
  revalidatePath(`/admin/crm/subcontractors/${subcontractorId}`);
  return {};
}

// Status transitions: Pending Onboarding -> Active requires every
// onboarding item complete unless the admin explicitly overrides it
// (brief section B). Any other transition (Inactive/Suspended/
// Terminated, and reactivating back to Active) is always admin-controlled
// directly, no checklist gate.
export async function setSubcontractorStatusAction(
  subcontractorId: string,
  status: string,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  if (!isValidStatus(status)) return { error: "Invalid status." };

  const { data: existing } = await supabase.from("crm_subcontractors").select("status").eq("id", subcontractorId).maybeSingle();
  if (!existing) return { error: "Subcontractor not found." };

  const override = formData.get("override_onboarding") === "true";
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const { error } = await supabase
    .from("crm_subcontractors")
    .update({
      status,
      active: status === "active",
      deactivated_at: status === "active" ? null : new Date().toISOString(),
      deactivated_by: status === "active" ? null : admin.id,
    })
    .eq("id", subcontractorId);

  if (error) return { error: `Failed to update status: ${error.message}` };

  const action: SubcontractorAuditAction =
    status === "inactive" || status === "terminated" || status === "suspended"
      ? "deactivated"
      : status === "active" && existing.status !== "active"
        ? "reactivated"
        : "status_changed";

  await insertAuditRow(supabase, {
    subcontractorId,
    action,
    performedById: admin.id,
    performedByName: admin.full_name || admin.email,
    reason,
    details: { from: existing.status, to: status, override_onboarding: override },
  });

  revalidatePath("/admin/crm/subcontractors");
  revalidatePath(`/admin/crm/subcontractors/${subcontractorId}`);
  return {};
}

// ---------------------------------------------------------------------
// Admin: client assignment.
// ---------------------------------------------------------------------

export async function changeSubcontractorClientAssignmentAction(subcontractorId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const clientId = String(formData.get("client_id") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!clientId) return { error: "Select a client to assign." };

  const { data: current } = await supabase
    .from("crm_subcontractor_client_assignments")
    .select("id, client_id")
    .eq("subcontractor_id", subcontractorId)
    .is("unassigned_at", null)
    .maybeSingle();

  if (current?.client_id === clientId) return { error: "This subcontractor is already assigned to that client." };

  if (current) {
    const { error: closeError } = await supabase
      .from("crm_subcontractor_client_assignments")
      .update({ unassigned_at: new Date().toISOString() })
      .eq("id", current.id);
    if (closeError) return { error: `Failed to close the existing assignment: ${closeError.message}` };
  }

  const { error: insertError } = await supabase.from("crm_subcontractor_client_assignments").insert({
    subcontractor_id: subcontractorId,
    client_id: clientId,
    assigned_by: admin.id,
    notes,
  });
  if (insertError) return { error: `Failed to assign client: ${insertError.message}` };

  await insertAuditRow(supabase, {
    subcontractorId,
    action: "client_assignment_changed",
    performedById: admin.id,
    performedByName: admin.full_name || admin.email,
    reason: notes,
    details: { from_client_id: current?.client_id ?? null, to_client_id: clientId },
  });

  revalidatePath("/admin/crm/subcontractors");
  revalidatePath(`/admin/crm/subcontractors/${subcontractorId}`);
  return {};
}

// ---------------------------------------------------------------------
// Admin: permissions + CRM access.
// ---------------------------------------------------------------------

export async function updateSubcontractorPermissionsAction(subcontractorId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const crmAccess = String(formData.get("crm_access") ?? "no_access").trim();
  if (!(SUBCONTRACTOR_CRM_ACCESS_OPTIONS as readonly string[]).includes(crmAccess)) {
    return { error: "Invalid CRM access value." };
  }

  const payload = {
    crm_access: crmAccess as SubcontractorCrmAccess,
    view_assigned_leads: formData.get("view_assigned_leads") === "on",
    add_call_logs: formData.get("add_call_logs") === "on",
    update_lead_status: formData.get("update_lead_status") === "on",
    book_appointments: formData.get("book_appointments") === "on",
    view_assigned_training: formData.get("view_assigned_training") === "on",
    updated_by: admin.id,
  };

  const { error } = await supabase.from("crm_subcontractor_permissions").update(payload).eq("subcontractor_id", subcontractorId);
  if (error) return { error: `Failed to update permissions: ${error.message}` };

  await insertAuditRow(supabase, {
    subcontractorId,
    action: "permissions_changed",
    performedById: admin.id,
    performedByName: admin.full_name || admin.email,
    reason: null,
    details: payload,
  });

  revalidatePath(`/admin/crm/subcontractors/${subcontractorId}`);
  return {};
}

// Grants CRM login access: invites (or links, if the subcontractor
// somehow already has a Supabase Auth account under this email) an
// account and creates the paired crm_users row (role='subcontractor'),
// same Admin API invite pattern as inviteAgentAction
// (src/app/admin/(dashboard)/crm/agents/actions.ts).
export async function grantSubcontractorCrmAccessAction(subcontractorId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: subcontractor } = await supabase
    .from("crm_subcontractors")
    .select("id, full_name, email")
    .eq("id", subcontractorId)
    .maybeSingle();
  if (!subcontractor) return { error: "Subcontractor not found." };
  if (!subcontractor.email) return { error: "This subcontractor needs an email address before granting CRM access." };

  const { data: existingLogin } = await supabase.from("crm_users").select("id").eq("subcontractor_id", subcontractorId).maybeSingle();
  if (existingLogin) return { error: "CRM access has already been granted for this subcontractor." };

  const supabaseAdmin = getSupabaseAdmin();
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(subcontractor.email, {
    redirectTo: `${getAuthRedirectBaseUrl()}/subcontractor/set-password`,
    data: { full_name: subcontractor.full_name },
  });

  if (authError || !authUser.user) {
    return { error: authError?.message ?? "Failed to invite this subcontractor." };
  }

  const { error: crmError } = await supabaseAdmin.from("crm_users").insert({
    id: authUser.user.id,
    full_name: subcontractor.full_name,
    email: subcontractor.email,
    role: "subcontractor",
    subcontractor_id: subcontractorId,
    active: true,
  });

  if (crmError) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    return { error: "Failed to save the subcontractor login record." };
  }

  await insertAuditRow(supabase, {
    subcontractorId,
    action: "crm_access_granted",
    performedById: admin.id,
    performedByName: admin.full_name || admin.email,
    reason: null,
    details: { email: subcontractor.email },
  });

  revalidatePath(`/admin/crm/subcontractors/${subcontractorId}`);
  return {};
}

export async function revokeSubcontractorCrmAccessAction(subcontractorId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: login } = await supabase.from("crm_users").select("id").eq("subcontractor_id", subcontractorId).maybeSingle();
  if (!login) return { error: "This subcontractor has no CRM access to revoke." };

  const { error } = await supabase.from("crm_users").update({ active: false }).eq("id", login.id);
  if (error) return { error: `Failed to revoke CRM access: ${error.message}` };

  await insertAuditRow(supabase, {
    subcontractorId,
    action: "crm_access_revoked",
    performedById: admin.id,
    performedByName: admin.full_name || admin.email,
    reason: null,
    details: null,
  });

  revalidatePath(`/admin/crm/subcontractors/${subcontractorId}`);
  return {};
}

// ---------------------------------------------------------------------
// Admin: training required/not-required override.
// ---------------------------------------------------------------------

export async function setSubcontractorTrainingRequiredOverrideAction(
  subcontractorId: string,
  moduleId: string,
  requiredOverride: boolean | null
): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_subcontractor_training_progress")
    .upsert(
      { subcontractor_id: subcontractorId, module_id: moduleId, required_override: requiredOverride },
      { onConflict: "subcontractor_id,module_id", ignoreDuplicates: false }
    );
  if (error) return { error: `Failed to update training requirement: ${error.message}` };

  revalidatePath(`/admin/crm/subcontractors/${subcontractorId}`);
  return {};
}

// ---------------------------------------------------------------------
// Admin: payments (draft/pending_approval/approved/paid).
// ---------------------------------------------------------------------

function buildPaymentPayload(
  formData: FormData,
  payType: SubcontractorPayType,
  rate: number
): { error: string } | { payload: Record<string, unknown> } {
  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();
  const adjustments = parseNonNegativeAmount(formData, "adjustments");
  const deductions = parseNonNegativeAmount(formData, "deductions");
  const status = String(formData.get("status") ?? "draft").trim();
  const paymentDate = String(formData.get("payment_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!periodStart || !periodEnd) return { error: "Pay period start and end are required." };
  if (periodEnd < periodStart) return { error: "Period end must be on or after period start." };
  if (adjustments === null || deductions === null) return { error: "Adjustments and deductions must be zero or a positive number." };
  if (!["draft", "pending_approval", "approved", "paid"].includes(status)) return { error: "Invalid payment status." };
  if (status === "paid" && !paymentDate) return { error: "A payment date is required to mark this as Paid." };
  if (status !== "paid" && paymentDate) return { error: "Payment date can only be set when status is Paid." };

  let quantity: number | null = null;
  let grossPay: number;

  if (isQuantityBasedPayType(payType)) {
    const rawQuantity = parseNonNegativeAmount(formData, "quantity");
    if (rawQuantity === null) return { error: "Approved quantity must be zero or a positive number." };
    quantity = rawQuantity;
    grossPay = calculateSubcontractorGrossPay(payType, quantity, rate);
  } else {
    const rawGrossPay = parseNonNegativeAmount(formData, "gross_pay");
    if (rawGrossPay === null) return { error: "Gross pay must be zero or a positive number." };
    grossPay = rawGrossPay;
  }

  return {
    payload: { period_start: periodStart, period_end: periodEnd, quantity, gross_pay: grossPay, adjustments, deductions, status, payment_date: paymentDate, notes },
  };
}

export async function createSubcontractorPaymentAction(subcontractorId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: subcontractor } = await supabase
    .from("crm_subcontractors")
    .select("pay_type, pay_rate, currency")
    .eq("id", subcontractorId)
    .maybeSingle();
  if (!subcontractor) return { error: "Subcontractor not found." };

  const built = buildPaymentPayload(formData, subcontractor.pay_type as SubcontractorPayType, subcontractor.pay_rate as number);
  if ("error" in built) return { error: built.error };

  const { data: assignment } = await supabase
    .from("crm_subcontractor_client_assignments")
    .select("client_id, crm_clients(company_name)")
    .eq("subcontractor_id", subcontractorId)
    .is("unassigned_at", null)
    .maybeSingle();
  const clientRow = assignment?.crm_clients as unknown as { company_name: string } | null;

  const { error } = await supabase.from("crm_subcontractor_payments").insert({
    subcontractor_id: subcontractorId,
    created_by: admin.id,
    rate_snapshot: subcontractor.pay_rate,
    currency_snapshot: subcontractor.currency,
    pay_type_snapshot: subcontractor.pay_type,
    business_client_snapshot: clientRow?.company_name ?? null,
    ...built.payload,
  });

  if (error) return { error: `Failed to save payment: ${error.message}` };

  revalidatePath("/admin/crm/payroll");
  revalidatePath(`/admin/crm/subcontractors/${subcontractorId}`);
  return {};
}

export async function updateSubcontractorPaymentAction(paymentId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("crm_subcontractor_payments")
    .select("id, subcontractor_id, status, rate_snapshot, pay_type_snapshot")
    .eq("id", paymentId)
    .maybeSingle();
  if (!existing) return { error: "Payment not found." };

  const built = buildPaymentPayload(
    formData,
    (existing.pay_type_snapshot as SubcontractorPayType) ?? "fixed",
    existing.rate_snapshot as number
  );
  if ("error" in built) return { error: built.error };

  const { error } = await supabase.from("crm_subcontractor_payments").update(built.payload).eq("id", paymentId);
  if (error) return { error: `Failed to update payment: ${error.message}` };

  const newStatus = (built.payload as { status: SubcontractorPaymentStatus }).status;
  if (newStatus === "approved" && existing.status !== "approved") {
    await insertAuditRow(supabase, {
      subcontractorId: existing.subcontractor_id,
      action: "payroll_approved",
      performedById: admin.id,
      performedByName: admin.full_name || admin.email,
      reason: null,
      details: { payment_id: paymentId },
    });
  }
  if (newStatus === "paid" && existing.status !== "paid") {
    await insertAuditRow(supabase, {
      subcontractorId: existing.subcontractor_id,
      action: "payroll_paid",
      performedById: admin.id,
      performedByName: admin.full_name || admin.email,
      reason: null,
      details: { payment_id: paymentId },
    });
  }

  revalidatePath("/admin/crm/payroll");
  revalidatePath(`/admin/crm/subcontractors/${existing.subcontractor_id}`);
  return {};
}

// ---------------------------------------------------------------------
// Subcontractor-facing: agreement signing.
// ---------------------------------------------------------------------

export async function signSubcontractorAgreementAction(formData: FormData): Promise<ActionResult> {
  const me = await requireCrmSubcontractor();
  const supabase = await createSupabaseServerClient();

  if (!me.subcontractor_id) return { error: "No subcontractor profile linked to this account." };

  const contractorName = String(formData.get("contractor_name") ?? "").trim();
  const acknowledged = formData.get("acknowledged") === "on";
  if (!acknowledged) return { error: "You must check the acknowledgement box to accept the agreement." };
  if (!contractorName) return { error: "Type your full legal name to sign." };

  const { data: template } = await supabase
    .from("crm_subcontractor_agreement_templates")
    .select("*")
    .eq("is_current", true)
    .maybeSingle();
  if (!template) return { error: "No current agreement template is available. Contact your admin." };

  const { data: subcontractor } = await supabase.from("crm_subcontractors").select("*").eq("id", me.subcontractor_id).maybeSingle();
  if (!subcontractor) return { error: "Subcontractor profile not found." };

  const { data: assignment } = await supabase
    .from("crm_subcontractor_client_assignments")
    .select("crm_clients(company_name)")
    .eq("subcontractor_id", me.subcontractor_id)
    .is("unassigned_at", null)
    .maybeSingle();
  const clientRow = assignment?.crm_clients as unknown as { company_name: string } | null;

  const renderedContent = renderSubcontractorAgreementTemplate(template, {
    currency: subcontractor.currency,
    payType: subcontractor.pay_type,
    payRate: subcontractor.pay_rate,
    startDate: subcontractor.start_date,
  });

  const ip = await getClientIpFromHeaders();

  const { error } = await supabase.from("crm_subcontractor_agreements").insert({
    subcontractor_id: me.subcontractor_id,
    template_id: template.id,
    version: template.version,
    rendered_content: renderedContent,
    contractor_name_typed: contractorName,
    business_name_snapshot: subcontractor.business_name,
    address_snapshot: null,
    country_snapshot: subcontractor.country,
    email_snapshot: subcontractor.email,
    currency_snapshot: subcontractor.currency,
    pay_type_snapshot: subcontractor.pay_type,
    rate_snapshot: subcontractor.pay_rate,
    start_date_snapshot: subcontractor.start_date,
    assigned_client_snapshot: clientRow?.company_name ?? null,
    ip_address: ip,
    user_id: me.id,
  });

  if (error) {
    if (error.code === "23505") return { error: "You have already signed this version of the agreement." };
    return { error: `Failed to save your acceptance: ${error.message}` };
  }

  await insertAuditRow(supabase, {
    subcontractorId: me.subcontractor_id,
    action: "agreement_accepted",
    performedById: me.id,
    performedByName: contractorName,
    reason: null,
    details: { version: template.version },
  });

  revalidatePath("/subcontractor/agreement");
  revalidatePath("/subcontractor/dashboard");
  revalidatePath(`/admin/crm/subcontractors/${me.subcontractor_id}`);
  return {};
}

// ---------------------------------------------------------------------
// Subcontractor-facing: training progress.
// ---------------------------------------------------------------------

export async function updateOwnTrainingProgressAction(moduleId: string, status: "in_progress" | "completed"): Promise<ActionResult> {
  const me = await requireCrmSubcontractor();
  const supabase = await createSupabaseServerClient();
  if (!me.subcontractor_id) return { error: "No subcontractor profile linked to this account." };

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("crm_subcontractor_training_progress")
    .select("id, started_at")
    .eq("subcontractor_id", me.subcontractor_id)
    .eq("module_id", moduleId)
    .maybeSingle();

  const payload: Record<string, unknown> = { status };
  if (status === "in_progress" && !existing?.started_at) payload.started_at = now;
  if (status === "completed") {
    payload.completed_at = now;
    if (!existing?.started_at) payload.started_at = now;
  }

  const { error } = existing
    ? await supabase.from("crm_subcontractor_training_progress").update(payload).eq("id", existing.id)
    : await supabase.from("crm_subcontractor_training_progress").insert({ subcontractor_id: me.subcontractor_id, module_id: moduleId, ...payload });

  if (error) return { error: `Failed to update training progress: ${error.message}` };

  revalidatePath("/subcontractor/training");
  revalidatePath("/subcontractor/dashboard");
  return {};
}
