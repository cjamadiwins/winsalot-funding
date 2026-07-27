"use server";

import { refresh, revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmUser } from "@/lib/crm-auth";
import { findProviderDuplicates } from "@/lib/provider-duplicates";
import { sendProviderIntakeEmail } from "@/lib/send-provider-intake-email";
import { sendProviderMessageEmail } from "@/lib/send-provider-email";
import { sendProviderSms } from "@/lib/send-provider-sms";
import { uploadProviderDocument, uploadProviderLogo } from "@/lib/provider-documents";
import {
  ADMIN_ONLY_STATUSES,
  CALL_OUTCOMES_REQUIRING_FOLLOW_UP,
  PROVIDER_CALL_OUTCOMES,
  PROVIDER_DOCUMENT_TYPES,
  PROVIDER_SERVICES_OFFERED,
  PROVIDER_STATUSES,
  parseCitiesServed,
  type ProviderCallOutcome,
  type ProviderDocumentType,
  type ProviderDuplicateMatch,
  type ProviderStatus,
} from "@/lib/provider-types";
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

// Duplicate-prevention lookup (brief section 12) - called by the "Add
// Provider Lead" form before it submits. Returns candidate matches; the
// UI decides whether to warn and let the agent open an existing record or
// proceed anyway.
export async function checkProviderDuplicateAction(
  businessName: string,
  email: string,
  phone: string
): Promise<ProviderDuplicateMatch[]> {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();
  return findProviderDuplicates(supabase, { businessName, email, phone });
}

export async function createProviderLeadAction(
  formData: FormData,
  ignoreDuplicateWarning: boolean
): Promise<ActionResult & { id?: string; duplicates?: ProviderDuplicateMatch[] }> {
  const crmUser = await requireCrmUser();

  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const province = String(formData.get("province") ?? "").trim();
  const email = textOrNull(formData, "email");
  const services = servicesFromFormData(formData);

  if (!businessName || !phone || !city || !province) {
    return { error: "Business name, phone, city, and province are required." };
  }
  if (services.length === 0) {
    return { error: "Select at least one service offered." };
  }

  const supabase = await createSupabaseServerClient();

  if (!ignoreDuplicateWarning) {
    const duplicates = await findProviderDuplicates(supabase, { businessName, email, phone });
    if (duplicates.length > 0) {
      return { duplicates };
    }
  }

  const { data: provider, error } = await supabase
    .from("provider_leads")
    .insert({
      business_name: businessName,
      contact_person: textOrNull(formData, "contact_person"),
      phone,
      email,
      city,
      province,
      website: textOrNull(formData, "website"),
      services_offered: services,
      years_in_business: textOrNull(formData, "years_in_business"),
      lead_source: textOrNull(formData, "lead_source"),
      notes: textOrNull(formData, "notes"),
      // Never trust a client-supplied agent id - always assigned to
      // whoever is creating it (RLS also enforces this).
      assigned_agent_id: crmUser.id,
      created_by: crmUser.id,
    })
    .select("id")
    .single();

  if (error || !provider) return { error: "Failed to save the provider lead." };

  revalidatePath("/agent/provider-acquisition");
  return { id: provider.id };
}

// Provider Profile's "General Information" + "Service Area" edit form -
// supersedes the older, narrower field set with the full Provider Profile
// column list (migration 0028), while keeping every previously-required
// field required. Agents may only edit providers assigned to them (RLS:
// provider_leads_agent_update_own).
export async function updateProviderProfileAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();

  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const province = String(formData.get("province") ?? "").trim();
  const services = servicesFromFormData(formData);

  if (!businessName || !phone || !city || !province) {
    return { error: "Business name, phone, city, and province are required." };
  }
  if (services.length === 0) {
    return { error: "Select at least one service offered." };
  }

  const supabase = await createSupabaseServerClient();

  let logoPath: string | undefined;
  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    const result = await uploadProviderLogo({ ownerId: providerId, file: logoFile });
    if (result.error) return { error: result.error };
    logoPath = result.path;
  }

  const { error } = await supabase
    .from("provider_leads")
    .update({
      business_name: businessName,
      contact_person: textOrNull(formData, "contact_person"),
      job_title: textOrNull(formData, "job_title"),
      phone,
      email: textOrNull(formData, "email"),
      website: textOrNull(formData, "website"),
      street_address: textOrNull(formData, "street_address"),
      city,
      province,
      postal_code: textOrNull(formData, "postal_code"),
      cities_served: parseCitiesServed(String(formData.get("cities_served") ?? "")),
      services_offered: services,
      years_in_business: textOrNull(formData, "years_in_business"),
      number_of_employees: textOrNull(formData, "number_of_employees"),
      business_description: textOrNull(formData, "business_description"),
      wsib_wcb_applicable: formData.get("wsib_wcb_applicable") !== "false",
      lead_source: textOrNull(formData, "lead_source"),
      notes: textOrNull(formData, "notes"),
      ...(logoPath ? { logo_path: logoPath } : {}),
    })
    .eq("id", providerId);

  if (error) return { error: "Failed to save the provider profile." };

  await supabase.from("crm_activities").insert({
    provider_lead_id: providerId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Profile updated by ${crmUser.full_name || crmUser.email}.`,
  });

  revalidatePath(`/agent/provider-acquisition/${providerId}`);
  revalidatePath("/agent/provider-acquisition");
  return {};
}

// Agents can update ordinary workflow statuses (Contacted, Intake Form
// Sent/Completed, Follow-up Required, Active/Inactive, Under Review, etc.)
// but never Approved Provider, Suspended, or Declined - those require
// administrator authority (Provider Profile "AGENT PROVIDER MANAGEMENT").
export async function updateProviderStatusAction(providerId: string, status: string): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  if (!PROVIDER_STATUSES.includes(status as ProviderStatus)) return { error: "Invalid status." };
  if (ADMIN_ONLY_STATUSES.includes(status as ProviderStatus)) {
    return { error: `Only an administrator can set the status to "${status}".` };
  }

  const supabase = await createSupabaseServerClient();
  const update: { status: string; closed_at?: string | null; closed_by?: string | null } = { status };
  if (status !== "Closed") {
    update.closed_at = null;
    update.closed_by = null;
  }

  const { error } = await supabase.from("provider_leads").update(update).eq("id", providerId);
  if (error) return { error: "Failed to update the status." };

  await supabase.from("crm_activities").insert({
    provider_lead_id: providerId,
    agent_id: crmUser.id,
    activity_type: "status_change",
    notes: `Status changed to "${status}" by ${crmUser.full_name || crmUser.email}.`,
  });

  revalidatePath(`/agent/provider-acquisition/${providerId}`);
  revalidatePath("/agent/provider-acquisition");
  return {};
}

// "Flag a provider for suspension or removal" (brief): agents cannot
// suspend/decline a provider themselves, but can raise it for an
// administrator via the activity timeline + an in-app CRM notification to
// every admin.
export async function flagProviderForAdminReviewAction(providerId: string, reason: string): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "A reason is required to flag a provider for review." };

  const supabase = await createSupabaseServerClient();
  const { data: provider } = await supabase
    .from("provider_leads")
    .select("business_name")
    .eq("id", providerId)
    .maybeSingle();
  if (!provider) return { error: "Provider not found." };

  const { error } = await supabase.from("crm_activities").insert({
    provider_lead_id: providerId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Flagged for administrator review by ${crmUser.full_name || crmUser.email}: ${trimmedReason}`,
  });
  if (error) return { error: "Failed to flag this provider for review." };

  const admin = getSupabaseAdmin();
  const { data: admins } = await admin.from("crm_users").select("id").eq("role", "admin").eq("active", true);
  if (admins && admins.length > 0) {
    await admin.from("crm_notifications").insert(
      admins.map((a) => ({
        user_id: a.id,
        provider_lead_id: providerId,
        title: `Provider flagged for review: ${provider.business_name}`,
        body: trimmedReason,
        link_path: `/admin/crm/provider-acquisition/${providerId}`,
      }))
    );
  }

  revalidatePath(`/agent/provider-acquisition/${providerId}`);
  return {};
}

// "Add Call Note" (brief section 8): records the selected call outcome
// plus notes, updates Last Contact Date, and requires a Next Follow-up
// Date when the outcome is "Follow-up Requested".
export async function addProviderCallNoteAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();

  const outcome = String(formData.get("call_outcome") ?? "").trim();
  if (!PROVIDER_CALL_OUTCOMES.includes(outcome as ProviderCallOutcome)) {
    return { error: "Please select a call outcome." };
  }

  const notes = textOrNull(formData, "notes");
  const nextFollowUpRaw = String(formData.get("next_follow_up_at") ?? "").trim();
  const nextFollowUpAt = nextFollowUpRaw ? new Date(nextFollowUpRaw).toISOString() : null;

  if (CALL_OUTCOMES_REQUIRING_FOLLOW_UP.includes(outcome as ProviderCallOutcome) && !nextFollowUpAt) {
    return { error: `A next follow-up date is required when the outcome is "${outcome}".` };
  }

  const supabase = await createSupabaseServerClient();
  const { error: activityError } = await supabase.from("crm_activities").insert({
    provider_lead_id: providerId,
    agent_id: crmUser.id,
    activity_type: "call",
    call_outcome: outcome,
    // Author name is embedded directly in the note text (not resolved
    // via a crm_users join on read) since an agent's session can only
    // ever select their own crm_users row (crm_users_select_self).
    notes: notes
      ? `${notes}\n\n— logged by ${crmUser.full_name || crmUser.email}`
      : `Logged by ${crmUser.full_name || crmUser.email}.`,
    next_follow_up_at: nextFollowUpAt,
  });
  if (activityError) return { error: "Failed to save the call note." };

  if (nextFollowUpAt) {
    const { error: followUpError } = await supabase.from("crm_followups").insert({
      provider_lead_id: providerId,
      scheduled_by: crmUser.id,
      scheduled_at: nextFollowUpAt,
    });
    if (followUpError) return { error: "Call note saved, but failed to schedule the follow-up." };
  }

  const { error: contactError } = await supabase
    .from("provider_leads")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", providerId);
  if (contactError) return { error: "Call note saved, but failed to update the last-contact date." };

  revalidatePath(`/agent/provider-acquisition/${providerId}`);
  revalidatePath("/agent/provider-acquisition");
  return {};
}

// General activity/notes log (brief section 2/7) - distinct from the call
// note above, for logging emails/texts/voicemails/internal notes without
// forcing a call outcome selection.
export async function addProviderActivityAction(providerId: string, formData: FormData): Promise<ActionResult> {
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
    provider_lead_id: providerId,
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
      provider_lead_id: providerId,
      scheduled_by: crmUser.id,
      scheduled_at: nextFollowUpAt,
    });
    if (followUpError) return { error: "Note saved, but failed to schedule the follow-up." };
  }

  const { error: contactError } = await supabase
    .from("provider_leads")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", providerId);
  if (contactError) return { error: "Note saved, but failed to update the last-contact date." };

  revalidatePath(`/agent/provider-acquisition/${providerId}`);
  revalidatePath("/agent/provider-acquisition");
  return {};
}

// "Send Intake Form" (brief section 5): sends the tracked provider-intake
// email, then marks the lead Intake Form Sent, records the send date/time
// and agent, and logs the activity - all inside sendProviderIntakeEmail.
export async function sendProviderIntakeEmailAction(providerId: string): Promise<{ error?: string; email?: string }> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  try {
    const result = await sendProviderIntakeEmail(supabase, providerId, crmUser);
    revalidatePath(`/agent/provider-acquisition/${providerId}`);
    revalidatePath("/agent/provider-acquisition");
    revalidatePath("/agent/dashboard");
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the intake form email." };
  }
}

// Generic "Send Email" quick action (Provider Profile) - distinct from
// the templated intake-form email above.
export async function sendProviderEmailAction(
  providerId: string,
  formData: FormData
): Promise<{ error?: string; email?: string }> {
  const crmUser = await requireCrmUser();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) return { error: "A subject and message are required." };

  const supabase = await createSupabaseServerClient();
  try {
    const result = await sendProviderMessageEmail(supabase, { providerLeadId: providerId }, crmUser, subject, message);
    revalidatePath(`/agent/provider-acquisition/${providerId}`);
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the email." };
  }
}

// "Send SMS" quick action - texts the provider's own phone number.
export async function sendProviderSmsAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "A message is required." };

  const supabase = await createSupabaseServerClient();
  try {
    await sendProviderSms(supabase, { providerLeadId: providerId }, crmUser, message);
    revalidatePath(`/agent/provider-acquisition/${providerId}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the SMS." };
  }
}

// Internal Notes (brief "NOTES") - never visible to providers (there is
// no provider-facing login to this data anywhere in the app).
export async function addProviderNoteAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Note text is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("provider_notes").insert({
    provider_lead_id: providerId,
    user_id: crmUser.id,
    author_name: crmUser.full_name || crmUser.email,
    note,
  });
  if (error) return { error: "Failed to save the note." };

  revalidatePath(`/agent/provider-acquisition/${providerId}`);
  return {};
}

// An agent may only ever edit their own note (RLS:
// provider_notes_agent_update_own_note) - never another agent's.
export async function updateProviderNoteAction(
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

  revalidatePath(`/agent/provider-acquisition/${providerId}`);
  return {};
}

// Files (brief "FILES") - agents can upload but never permanently remove
// (no removeProviderDocumentAction is exported from this file - admin
// only, same "simply doesn't exist here" convention as
// removeProviderFollowUpAction).
export async function uploadProviderDocumentAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const docType = String(formData.get("doc_type") ?? "").trim();
  if (!PROVIDER_DOCUMENT_TYPES.includes(docType as ProviderDocumentType)) {
    return { error: "Please select a document type." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Please choose a file to upload." };

  // uploadProviderDocument() writes via the service-role client, which
  // bypasses RLS - so ownership must be confirmed here first, through the
  // session-scoped client (provider_leads_agent_select_own only returns a
  // row this agent is actually assigned to).
  const supabase = await createSupabaseServerClient();
  const { data: provider } = await supabase.from("provider_leads").select("id").eq("id", providerId).maybeSingle();
  if (!provider) return { error: "Provider not found." };

  const result = await uploadProviderDocument({
    target: { providerLeadId: providerId },
    uploadedBy: crmUser.id,
    docType: docType as ProviderDocumentType,
    file,
  });
  if (result.error) return result;

  revalidatePath(`/agent/provider-acquisition/${providerId}`);
  return {};
}

async function setStatusWithActivity(
  providerId: string,
  status: ProviderStatus,
  activityNote: string
): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const update: { status: ProviderStatus; closed_at?: string | null; closed_by?: string | null } = { status };
  if (status === "Closed") {
    update.closed_at = new Date().toISOString();
    update.closed_by = crmUser.id;
  }

  const { error } = await supabase.from("provider_leads").update(update).eq("id", providerId);
  if (error) return { error: "Failed to update the provider lead." };

  await supabase.from("crm_activities").insert({
    provider_lead_id: providerId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: activityNote,
  });

  revalidatePath(`/agent/provider-acquisition/${providerId}`);
  revalidatePath("/agent/provider-acquisition");
  refresh();
  return {};
}

export async function markIntakeFormCompletedAction(providerId: string): Promise<ActionResult> {
  return setStatusWithActivity(providerId, "Intake Form Completed", "Intake form marked completed.");
}

// Agents cannot approve a provider themselves (brief "AGENT PROVIDER
// MANAGEMENT": "Approve a provider without administrator authority" is
// explicitly listed as something an agent must not be able to do) - unlike
// the admin actions file, there is no approveProviderAndAddToDirectoryAction
// exported here at all, matching the existing convention of admin-only
// actions (e.g. reopenProviderLeadAction/removeProviderFollowUpAction)
// simply not existing in this file.

export async function markNotInterestedAction(providerId: string): Promise<ActionResult> {
  return setStatusWithActivity(providerId, "Not Interested", "Provider marked not interested.");
}

export async function closeProviderLeadAction(providerId: string): Promise<ActionResult> {
  return setStatusWithActivity(providerId, "Closed", "Provider lead closed.");
}

// RLS (provider_leads_agent_delete_own) restricts this to a provider lead
// the signed-in agent created or is currently assigned to - matching the
// brief's "agents can only delete provider leads they created or that are
// assigned to them." Returns a result object rather than redirecting
// itself, so callers (the list page and the detail page) can each decide
// what to do next (the detail page navigates back to the list on success).
export async function deleteProviderLeadAction(providerId: string): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("provider_leads").delete().eq("id", providerId);
  if (error) return { error: "Failed to delete the provider lead." };

  revalidatePath("/agent/provider-acquisition");
  return {};
}
