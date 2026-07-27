"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/admin-auth";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendProviderMessageEmail } from "@/lib/send-provider-email";
import { sendProviderSms } from "@/lib/send-provider-sms";
import { uploadProviderDocument, uploadProviderLogo, removeProviderDocument } from "@/lib/provider-documents";
import { recalculateProviderScore, recalculateProviderScoreSafely } from "@/lib/provider-score";
import {
  CLEANING_PROVIDER_STATUSES,
  PROVIDER_DOCUMENT_TYPES,
  PROVIDER_SERVICES_OFFERED,
  parseCitiesServed,
  type CleaningProviderStatus,
  type ProviderDocumentType,
} from "@/lib/provider-types";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/crm-types";

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function fieldsFromFormData(formData: FormData) {
  return {
    company_name: String(formData.get("companyName") ?? "").trim(),
    contact_person: String(formData.get("contactPerson") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    service_locations: String(formData.get("serviceLocations") ?? "").trim() || null,
    pricing_notes: String(formData.get("pricingNotes") ?? "").trim() || null,
    internal_notes: String(formData.get("internalNotes") ?? "").trim() || null,
  };
}

// --- Pre-existing actions (unchanged): the provider-selection and
// copy-on-quote workflow in /admin/requests/[id] depends on these
// exactly as they behave today. Still gated by requireAdminUser() only,
// same as always, so a legacy admin account with no crm_users row keeps
// full access to the basic directory. ---

export async function createProviderAction(formData: FormData) {
  await requireAdminUser();

  const fields = fieldsFromFormData(formData);
  if (!isNonEmptyString(fields.company_name, 200)) {
    throw new Error("Company name is required.");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("cleaning_providers").insert(fields);

  if (error) throw new Error("Failed to create provider.");

  revalidatePath("/admin/providers");
}

export async function updateProviderAction(providerId: string, formData: FormData) {
  await requireAdminUser();

  const fields = fieldsFromFormData(formData);
  if (!isNonEmptyString(fields.company_name, 200)) {
    throw new Error("Company name is required.");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("cleaning_providers")
    .update(fields)
    .eq("id", providerId);

  if (error) throw new Error("Failed to update provider.");

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${providerId}`);
  redirect("/admin/providers");
}

export async function setProviderStatusAction(providerId: string, status: "active" | "inactive") {
  await requireAdminUser();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("cleaning_providers")
    .update({ status })
    .eq("id", providerId);

  if (error) throw new Error("Failed to update provider status.");

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${providerId}`);
}

// --- Provider Profile actions (new). Gated by requireCrmAdmin() since
// they rely on the CRM user model (author names, agent assignment,
// scorecards) that a bare Supabase Auth admin without a crm_users row
// doesn't participate in - the basic CRUD above keeps working for that
// account regardless. ---

type ActionResult = { error?: string };

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function servicesFromFormData(formData: FormData): string[] {
  return formData
    .getAll("services_offered")
    .map((v) => String(v))
    .filter((v) => PROVIDER_SERVICES_OFFERED.includes(v as (typeof PROVIDER_SERVICES_OFFERED)[number]));
}

// Full Provider Profile edit - every field, including the logo.
export async function updateOperationalProfileAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();

  const companyName = String(formData.get("company_name") ?? "").trim();
  const phone = textOrNull(formData, "phone");
  if (!companyName) return { error: "Business name is required." };

  const supabase = await createSupabaseServerClient();

  let logoPath: string | undefined;
  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    const result = await uploadProviderLogo({ ownerId: providerId, file: logoFile });
    if (result.error) return { error: result.error };
    logoPath = result.path;
  }

  const { error } = await supabase
    .from("cleaning_providers")
    .update({
      company_name: companyName,
      contact_person: textOrNull(formData, "contact_person"),
      job_title: textOrNull(formData, "job_title"),
      phone,
      email: textOrNull(formData, "email"),
      website: textOrNull(formData, "website"),
      street_address: textOrNull(formData, "street_address"),
      city: textOrNull(formData, "city"),
      province: textOrNull(formData, "province"),
      postal_code: textOrNull(formData, "postal_code"),
      cities_served: parseCitiesServed(String(formData.get("cities_served") ?? "")),
      services_offered: servicesFromFormData(formData),
      years_in_business: textOrNull(formData, "years_in_business"),
      number_of_employees: textOrNull(formData, "number_of_employees"),
      business_description: textOrNull(formData, "business_description"),
      wsib_wcb_applicable: formData.get("wsib_wcb_applicable") !== "false",
      service_locations: textOrNull(formData, "service_locations"),
      pricing_notes: textOrNull(formData, "pricing_notes"),
      internal_notes: textOrNull(formData, "internal_notes"),
      ...(logoPath ? { logo_path: logoPath } : {}),
    })
    .eq("id", providerId);
  if (error) return { error: "Failed to save the provider profile." };

  await supabase.from("crm_activities").insert({
    cleaning_provider_id: providerId,
    agent_id: crmAdmin.id,
    activity_type: "outcome",
    notes: `Profile updated by ${crmAdmin.full_name || crmAdmin.email}.`,
  });

  recalculateProviderScoreSafely(providerId, "Profile edited");

  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath("/admin/providers");
  return {};
}

// Administrators can set any operational status (active/inactive/
// suspended); agents never get this action (brief: agents "may not...
// suspend" an operational provider).
export async function updateOperationalStatusAction(providerId: string, status: string): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  if (!CLEANING_PROVIDER_STATUSES.includes(status as CleaningProviderStatus)) return { error: "Invalid status." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("cleaning_providers").update({ status }).eq("id", providerId);
  if (error) return { error: "Failed to update the status." };

  await supabase.from("crm_activities").insert({
    cleaning_provider_id: providerId,
    agent_id: crmAdmin.id,
    activity_type: "status_change",
    notes: `Status changed to "${status}" by ${crmAdmin.full_name || crmAdmin.email}.`,
  });

  recalculateProviderScoreSafely(providerId, `Status changed to "${status}"`);

  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath("/admin/providers");
  return {};
}

// Assigning/reassigning to any agent (or unassigning) - admin-only
// (brief: agents may not "reassign" an operational provider).
export async function assignOperationalAgentAction(providerId: string, agentId: string | null): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("cleaning_providers").update({ assigned_agent_id: agentId }).eq("id", providerId);
  if (error) return { error: "Failed to assign the agent." };

  const { data: agent } = agentId
    ? await supabase.from("crm_users").select("full_name, email").eq("id", agentId).maybeSingle()
    : { data: null };

  await supabase.from("crm_activities").insert({
    cleaning_provider_id: providerId,
    agent_id: crmAdmin.id,
    activity_type: "assignment_change",
    notes: agent
      ? `Assigned to ${agent.full_name || agent.email} by ${crmAdmin.full_name || crmAdmin.email}.`
      : `Unassigned by ${crmAdmin.full_name || crmAdmin.email}.`,
  });

  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath("/admin/providers");
  return {};
}

export async function addOperationalActivityAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();

  const activityType = String(formData.get("activity_type") ?? "").trim();
  if (!ACTIVITY_TYPES.includes(activityType as ActivityType)) {
    return { error: "Please select a valid activity type." };
  }

  const notes = textOrNull(formData, "notes");
  const nextFollowUpRaw = String(formData.get("next_follow_up_at") ?? "").trim();
  const nextFollowUpAt = nextFollowUpRaw ? new Date(nextFollowUpRaw).toISOString() : null;

  const supabase = await createSupabaseServerClient();
  const { error: activityError } = await supabase.from("crm_activities").insert({
    cleaning_provider_id: providerId,
    agent_id: crmAdmin.id,
    activity_type: activityType,
    notes: notes
      ? `${notes}\n\n— logged by ${crmAdmin.full_name || crmAdmin.email}`
      : `Logged by ${crmAdmin.full_name || crmAdmin.email}.`,
    next_follow_up_at: nextFollowUpAt,
  });
  if (activityError) return { error: "Failed to save the note." };

  if (nextFollowUpAt) {
    const { error: followUpError } = await supabase.from("crm_followups").insert({
      cleaning_provider_id: providerId,
      scheduled_by: crmAdmin.id,
      scheduled_at: nextFollowUpAt,
    });
    if (followUpError) return { error: "Note saved, but failed to schedule the follow-up." };
  }

  const { error: contactError } = await supabase
    .from("cleaning_providers")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", providerId);
  if (contactError) return { error: "Note saved, but failed to update the last-contact date." };

  revalidatePath(`/admin/providers/${providerId}`);
  return {};
}

export async function sendOperationalEmailAction(
  providerId: string,
  formData: FormData
): Promise<{ error?: string; email?: string }> {
  const crmAdmin = await requireCrmAdmin();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) return { error: "A subject and message are required." };

  const supabase = await createSupabaseServerClient();
  try {
    const result = await sendProviderMessageEmail(supabase, { cleaningProviderId: providerId }, crmAdmin, subject, message);
    revalidatePath(`/admin/providers/${providerId}`);
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the email." };
  }
}

export async function sendOperationalSmsAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "A message is required." };

  const supabase = await createSupabaseServerClient();
  try {
    await sendProviderSms(supabase, { cleaningProviderId: providerId }, crmAdmin, message);
    revalidatePath(`/admin/providers/${providerId}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the SMS." };
  }
}

export async function addOperationalNoteAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Note text is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("provider_notes").insert({
    cleaning_provider_id: providerId,
    user_id: crmAdmin.id,
    author_name: crmAdmin.full_name || crmAdmin.email,
    note,
  });
  if (error) return { error: "Failed to save the note." };

  revalidatePath(`/admin/providers/${providerId}`);
  return {};
}

export async function updateOperationalNoteAction(
  noteId: string,
  providerId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireCrmAdmin();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Note text is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("provider_notes").update({ note }).eq("id", noteId);
  if (error) return { error: "Failed to update the note." };

  revalidatePath(`/admin/providers/${providerId}`);
  return {};
}

export async function uploadOperationalDocumentAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const docType = String(formData.get("doc_type") ?? "").trim();
  if (!PROVIDER_DOCUMENT_TYPES.includes(docType as ProviderDocumentType)) {
    return { error: "Please select a document type." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Please choose a file to upload." };

  const result = await uploadProviderDocument({
    target: { cleaningProviderId: providerId },
    uploadedBy: crmAdmin.id,
    docType: docType as ProviderDocumentType,
    file,
  });
  if (result.error) return result;

  recalculateProviderScoreSafely(providerId, `Document uploaded: ${docType}`);

  revalidatePath(`/admin/providers/${providerId}`);
  return {};
}

export async function removeOperationalDocumentAction(documentId: string, providerId: string): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();

  const result = await removeProviderDocument({ documentId, removedBy: crmAdmin.id });
  if (result.error) return result;

  recalculateProviderScoreSafely(providerId, "Document removed");

  revalidatePath(`/admin/providers/${providerId}`);
  return {};
}

// Administrator-only manual scorecard adjustment - always shown
// separately from the automatically calculated score, always requires a
// written reason.
export async function addOperationalScoreAdjustmentAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const amount = Number(amountRaw);

  if (!Number.isFinite(amount) || amount === 0) return { error: "Enter a non-zero adjustment amount." };
  if (!reason) return { error: "A written reason is required for a manual adjustment." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("provider_score_adjustments").insert({
    cleaning_provider_id: providerId,
    admin_id: crmAdmin.id,
    amount: Math.round(amount),
    reason,
  });
  if (error) return { error: "Failed to save the adjustment." };

  revalidatePath(`/admin/providers/${providerId}`);
  return {};
}

// Administrator-only "Recalculate Score" button.
export async function recalculateOperationalScoreAction(providerId: string): Promise<ActionResult> {
  await requireCrmAdmin();
  try {
    await recalculateProviderScore(providerId, "Manually recalculated by an administrator");
  } catch {
    return { error: "Failed to recalculate the score." };
  }
  revalidatePath(`/admin/providers/${providerId}`);
  return {};
}

export async function scheduleOperationalFollowUpAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const raw = String(formData.get("scheduled_at") ?? "").trim();
  if (!raw) return { error: "A follow-up date and time is required." };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { error: "Invalid date/time." };

  const { error } = await supabase.from("crm_followups").insert({
    cleaning_provider_id: providerId,
    scheduled_by: crmAdmin.id,
    scheduled_at: date.toISOString(),
    note: textOrNull(formData, "note"),
  });
  if (error) return { error: "Failed to schedule the follow-up." };

  revalidatePath(`/admin/providers/${providerId}`);
  return {};
}

export async function rescheduleOperationalFollowUpAction(
  followUpId: string,
  providerId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const raw = String(formData.get("scheduled_at") ?? "").trim();
  if (!raw) return { error: "A follow-up date and time is required." };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { error: "Invalid date/time." };

  const { error } = await supabase
    .from("crm_followups")
    .update({
      scheduled_at: date.toISOString(),
      note: textOrNull(formData, "note"),
      status: "pending",
      completed_at: null,
      completed_by: null,
    })
    .eq("id", followUpId);
  if (error) return { error: "Failed to reschedule the follow-up." };

  revalidatePath(`/admin/providers/${providerId}`);
  return {};
}

export async function completeOperationalFollowUpAction(followUpId: string, providerId: string): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_followups")
    .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: crmAdmin.id })
    .eq("id", followUpId);
  if (error) return { error: "Failed to mark the follow-up completed." };

  revalidatePath(`/admin/providers/${providerId}`);
  return {};
}

export async function removeOperationalFollowUpAction(followUpId: string, providerId: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("crm_followups").delete().eq("id", followUpId);
  if (error) return { error: "Failed to remove the follow-up." };

  revalidatePath(`/admin/providers/${providerId}`);
  return {};
}

// Admin-only permanent deletion of an operational provider. Distinct
// from setProviderStatusAction (which only ever deactivates) - this
// actually removes the cleaning_providers row. Blocked if the provider is
// currently assigned to any quote request, so a live quote-assignment
// history can never be silently orphaned.
export async function deleteOperationalProviderAction(providerId: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const admin = getSupabaseAdmin();

  const { count } = await admin
    .from("quote_requests")
    .select("id", { count: "exact", head: true })
    .eq("assigned_provider_id", providerId);
  if (count && count > 0) {
    return { error: "This provider has quote history and can't be deleted. Set it to Inactive instead." };
  }

  const { count: invoiceCount } = await admin
    .from("provider_invoices")
    .select("id", { count: "exact", head: true })
    .eq("cleaning_provider_id", providerId);
  if (invoiceCount && invoiceCount > 0) {
    return { error: "This provider has invoice/payment history and can't be deleted. Set it to Inactive instead." };
  }

  const { error } = await admin.from("cleaning_providers").delete().eq("id", providerId);
  if (error) return { error: "Failed to delete the provider." };

  revalidatePath("/admin/providers");
  return {};
}
