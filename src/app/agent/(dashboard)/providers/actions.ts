"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendProviderMessageEmail } from "@/lib/send-provider-email";
import { sendProviderSms } from "@/lib/send-provider-sms";
import { uploadProviderDocument } from "@/lib/provider-documents";
import { recalculateProviderScoreSafely } from "@/lib/provider-score";
import { PROVIDER_DOCUMENT_TYPES, PROVIDER_SERVICES_OFFERED, parseCitiesServed, type ProviderDocumentType } from "@/lib/provider-types";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/crm-types";

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

// Agents may manage contact details, services, service areas, notes,
// communication, follow-ups, and documents for providers assigned to
// them (brief "AGENT PROVIDER MANAGEMENT") - but never the operational
// status, agent assignment, scorecard, or deletion (no corresponding
// actions exist in this file at all, matching the existing convention of
// admin-only actions simply not existing in an agent actions file).
// RLS (cleaning_providers_agent_update_own) additionally restricts every
// write below to a provider actually assigned to this agent.
export async function updateOperationalProfileAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();

  const companyName = String(formData.get("company_name") ?? "").trim();
  if (!companyName) return { error: "Business name is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("cleaning_providers")
    .update({
      company_name: companyName,
      contact_person: textOrNull(formData, "contact_person"),
      job_title: textOrNull(formData, "job_title"),
      phone: textOrNull(formData, "phone"),
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
    })
    .eq("id", providerId);
  if (error) return { error: "Failed to save the provider profile." };

  await supabase.from("crm_activities").insert({
    cleaning_provider_id: providerId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Profile updated by ${crmUser.full_name || crmUser.email}.`,
  });

  recalculateProviderScoreSafely(providerId, "Profile edited");

  revalidatePath(`/agent/providers/${providerId}`);
  return {};
}

export async function addOperationalActivityAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();

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
    agent_id: crmUser.id,
    activity_type: activityType,
    notes: notes
      ? `${notes}\n\n— logged by ${crmUser.full_name || crmUser.email}`
      : `Logged by ${crmUser.full_name || crmUser.email}.`,
    next_follow_up_at: nextFollowUpAt,
  });
  if (activityError) return { error: "Failed to save the note." };

  if (nextFollowUpAt) {
    const { error: followUpError } = await supabase.from("crm_followups").insert({
      cleaning_provider_id: providerId,
      scheduled_by: crmUser.id,
      scheduled_at: nextFollowUpAt,
    });
    if (followUpError) return { error: "Note saved, but failed to schedule the follow-up." };
  }

  const { error: contactError } = await supabase
    .from("cleaning_providers")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", providerId);
  if (contactError) return { error: "Note saved, but failed to update the last-contact date." };

  revalidatePath(`/agent/providers/${providerId}`);
  return {};
}

export async function sendOperationalEmailAction(
  providerId: string,
  formData: FormData
): Promise<{ error?: string; email?: string }> {
  const crmUser = await requireCrmUser();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) return { error: "A subject and message are required." };

  const supabase = await createSupabaseServerClient();
  try {
    return await sendProviderMessageEmail(supabase, { cleaningProviderId: providerId }, crmUser, subject, message);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the email." };
  } finally {
    revalidatePath(`/agent/providers/${providerId}`);
  }
}

export async function sendOperationalSmsAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "A message is required." };

  const supabase = await createSupabaseServerClient();
  try {
    await sendProviderSms(supabase, { cleaningProviderId: providerId }, crmUser, message);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the SMS." };
  } finally {
    revalidatePath(`/agent/providers/${providerId}`);
  }
}

export async function addOperationalNoteAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Note text is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("provider_notes").insert({
    cleaning_provider_id: providerId,
    user_id: crmUser.id,
    author_name: crmUser.full_name || crmUser.email,
    note,
  });
  if (error) return { error: "Failed to save the note." };

  revalidatePath(`/agent/providers/${providerId}`);
  return {};
}

// An agent may only ever edit their own note (RLS:
// provider_notes_agent_update_own_note) - never another agent's.
export async function updateOperationalNoteAction(
  noteId: string,
  providerId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireCrmUser();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Note text is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("provider_notes").update({ note }).eq("id", noteId);
  if (error) return { error: "Failed to update the note. You can only edit your own notes." };

  revalidatePath(`/agent/providers/${providerId}`);
  return {};
}

// Agents can upload but never permanently remove a document (no
// removeDocumentAction exported from this file at all).
export async function uploadOperationalDocumentAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const docType = String(formData.get("doc_type") ?? "").trim();
  if (!PROVIDER_DOCUMENT_TYPES.includes(docType as ProviderDocumentType)) {
    return { error: "Please select a document type." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Please choose a file to upload." };

  // uploadProviderDocument() writes via the service-role client, which
  // bypasses RLS - so ownership must be confirmed here first, through the
  // session-scoped client (cleaning_providers_agent_select_own only
  // returns a row this agent is actually assigned to).
  const supabase = await createSupabaseServerClient();
  const { data: provider } = await supabase.from("cleaning_providers").select("id").eq("id", providerId).maybeSingle();
  if (!provider) return { error: "Provider not found." };

  const result = await uploadProviderDocument({
    target: { cleaningProviderId: providerId },
    uploadedBy: crmUser.id,
    docType: docType as ProviderDocumentType,
    file,
  });
  if (result.error) return result;

  recalculateProviderScoreSafely(providerId, `Document uploaded: ${docType}`);

  revalidatePath(`/agent/providers/${providerId}`);
  return {};
}

export async function scheduleOperationalFollowUpAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const raw = String(formData.get("scheduled_at") ?? "").trim();
  if (!raw) return { error: "A follow-up date and time is required." };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { error: "Invalid date/time." };

  const { error } = await supabase.from("crm_followups").insert({
    cleaning_provider_id: providerId,
    scheduled_by: crmUser.id,
    scheduled_at: date.toISOString(),
    note: textOrNull(formData, "note"),
  });
  if (error) return { error: "Failed to schedule the follow-up." };

  revalidatePath(`/agent/providers/${providerId}`);
  return {};
}

export async function rescheduleOperationalFollowUpAction(
  followUpId: string,
  providerId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireCrmUser();
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

  revalidatePath(`/agent/providers/${providerId}`);
  return {};
}

export async function completeOperationalFollowUpAction(followUpId: string, providerId: string): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_followups")
    .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: crmUser.id })
    .eq("id", followUpId);
  if (error) return { error: "Failed to mark the follow-up completed." };

  revalidatePath(`/agent/providers/${providerId}`);
  return {};
}
