"use server";

import { refresh, revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { findProviderDuplicates } from "@/lib/provider-duplicates";
import { sendProviderIntakeEmail } from "@/lib/send-provider-intake-email";
import { sendProviderMessageEmail } from "@/lib/send-provider-email";
import { sendProviderSms } from "@/lib/send-provider-sms";
import { uploadProviderDocument, uploadProviderLogo, removeProviderDocument } from "@/lib/provider-documents";
import { approveProviderAndAddToDirectory } from "@/lib/provider-approval";
import {
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

export async function checkProviderDuplicateAction(
  businessName: string,
  email: string,
  phone: string
): Promise<ProviderDuplicateMatch[]> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  return findProviderDuplicates(supabase, { businessName, email, phone });
}

// Admins may create a provider lead unassigned or assigned to any agent,
// and may override the duplicate warning (brief section 12).
export async function createProviderLeadAction(
  formData: FormData,
  ignoreDuplicateWarning: boolean
): Promise<ActionResult & { id?: string; duplicates?: ProviderDuplicateMatch[] }> {
  const admin = await requireCrmAdmin();

  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const province = String(formData.get("province") ?? "").trim();
  const email = textOrNull(formData, "email");
  const services = servicesFromFormData(formData);
  const assignedAgentId = textOrNull(formData, "assigned_agent_id");

  if (!businessName || !phone || !city || !province) {
    return { error: "Business name, phone, city, and province are required." };
  }
  if (services.length === 0) {
    return { error: "Select at least one service offered." };
  }

  const supabase = await createSupabaseServerClient();

  if (!ignoreDuplicateWarning) {
    const duplicates = await findProviderDuplicates(supabase, { businessName, email, phone });
    if (duplicates.length > 0) return { duplicates };
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
      assigned_agent_id: assignedAgentId,
      created_by: admin.id,
    })
    .select("id")
    .single();

  if (error || !provider) return { error: "Failed to save the provider lead." };

  revalidatePath("/admin/crm/provider-acquisition");
  return { id: provider.id };
}

// Provider Profile's "General Information" + "Service Area" edit form -
// administrators can edit every field on every provider (brief: "Full
// access... Edit everything").
export async function updateProviderProfileAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();

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
    agent_id: admin.id,
    activity_type: "outcome",
    notes: `Profile updated by ${admin.full_name || admin.email}.`,
  });

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  revalidatePath("/admin/crm/provider-acquisition");
  return {};
}

// "Approve and Add to Providers" (brief: unify the provider identity on
// cleaning_providers) - the only way a Provider Acquisition lead becomes
// the permanent operational Provider Profile. Matches an existing
// cleaning_providers record by email/phone/business name and updates it,
// or creates a new one; copies contact info, services, service areas,
// notes, and documents; links provider_leads.cleaning_provider_id
// permanently; and marks this lead Approved Provider. Idempotent - safe
// to call again on an already-linked lead. The UI redirects to the
// returned operational profile afterward, since that's now the profile
// used everywhere (brief: "opening the provider from Provider
// Acquisition after approval must open the same operational Provider
// Profile").
export async function approveProviderAndAddToDirectoryAction(
  providerId: string
): Promise<ActionResult & { cleaningProviderId?: string }> {
  const admin = await requireCrmAdmin();
  try {
    const { cleaningProviderId } = await approveProviderAndAddToDirectory(providerId, admin);
    revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
    revalidatePath("/admin/crm/provider-acquisition");
    revalidatePath(`/admin/providers/${cleaningProviderId}`);
    revalidatePath("/admin/providers");
    return { cleaningProviderId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to approve this provider." };
  }
}

// The administrator may overwrite or correct the status at any time
// (brief section 3) - except "Approved Provider", which is reachable
// only through approveProviderAndAddToDirectoryAction (above). Setting it
// directly here would leave the lead marked approved without ever
// creating or linking the permanent operational Provider Profile, which
// is exactly the disconnected-profile problem this action exists to
// prevent.
export async function updateProviderStatusAction(providerId: string, status: string): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  if (!PROVIDER_STATUSES.includes(status as ProviderStatus)) return { error: "Invalid status." };
  if (status === "Approved Provider") {
    return { error: 'Use "Approve and Add to Providers" to approve this provider.' };
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
    agent_id: crmAdmin.id,
    activity_type: "status_change",
    notes: `Status changed to "${status}" by ${crmAdmin.full_name || crmAdmin.email}.`,
  });

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  revalidatePath("/admin/crm/provider-acquisition");
  return {};
}

// Assigning/reassigning to any agent (or unassigning) - admin-only, shown
// as a dedicated dropdown on the detail page (brief section 4/16).
export async function assignProviderAgentAction(providerId: string, agentId: string | null): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("provider_leads")
    .update({ assigned_agent_id: agentId })
    .eq("id", providerId);
  if (error) return { error: "Failed to assign the agent." };

  const { data: agent } = agentId
    ? await supabase.from("crm_users").select("full_name, email").eq("id", agentId).maybeSingle()
    : { data: null };

  await supabase.from("crm_activities").insert({
    provider_lead_id: providerId,
    agent_id: crmAdmin.id,
    activity_type: "assignment_change",
    notes: agent
      ? `Assigned to ${agent.full_name || agent.email} by ${crmAdmin.full_name || crmAdmin.email}.`
      : `Unassigned by ${crmAdmin.full_name || crmAdmin.email}.`,
  });

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  revalidatePath("/admin/crm/provider-acquisition");
  return {};
}

export async function addProviderCallNoteAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();

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

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  revalidatePath("/admin/crm/provider-acquisition");
  return {};
}

export async function addProviderActivityAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();

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

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  revalidatePath("/admin/crm/provider-acquisition");
  return {};
}

export async function sendProviderIntakeEmailAction(providerId: string): Promise<{ error?: string; email?: string }> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  try {
    const result = await sendProviderIntakeEmail(supabase, providerId, crmUser);
    revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
    revalidatePath("/admin/crm/provider-acquisition");
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the intake form email." };
  }
}

// Generic "Send Email" quick action (Provider Profile).
export async function sendProviderEmailAction(
  providerId: string,
  formData: FormData
): Promise<{ error?: string; email?: string }> {
  const crmUser = await requireCrmAdmin();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) return { error: "A subject and message are required." };

  const supabase = await createSupabaseServerClient();
  try {
    const result = await sendProviderMessageEmail(supabase, { providerLeadId: providerId }, crmUser, subject, message);
    revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the email." };
  }
}

// "Send SMS" quick action.
export async function sendProviderSmsAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "A message is required." };

  const supabase = await createSupabaseServerClient();
  try {
    await sendProviderSms(supabase, { providerLeadId: providerId }, crmUser, message);
    revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the SMS." };
  }
}

// Internal Notes - administrators can view and add notes for every
// provider (RLS: provider_notes_admin_all).
export async function addProviderNoteAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();
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

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  return {};
}

export async function updateProviderNoteAction(
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

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  return {};
}

// Files - administrators can upload and permanently remove documents.
export async function uploadProviderDocumentAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();
  const docType = String(formData.get("doc_type") ?? "").trim();
  if (!PROVIDER_DOCUMENT_TYPES.includes(docType as ProviderDocumentType)) {
    return { error: "Please select a document type." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Please choose a file to upload." };

  const result = await uploadProviderDocument({
    target: { providerLeadId: providerId },
    uploadedBy: crmUser.id,
    docType: docType as ProviderDocumentType,
    file,
  });
  if (result.error) return result;

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  return {};
}

// Admin-only permanent removal (brief: "Agents must not... Permanently
// remove documents" - only an administrator can).
export async function removeProviderDocumentAction(documentId: string, providerId: string): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();

  const result = await removeProviderDocument({ documentId, removedBy: crmUser.id });
  if (result.error) return result;

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  return {};
}

async function setStatusWithActivity(
  providerId: string,
  status: ProviderStatus,
  activityNote: string
): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();
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

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  revalidatePath("/admin/crm/provider-acquisition");
  refresh();
  return {};
}

export async function markIntakeFormCompletedAction(providerId: string): Promise<ActionResult> {
  return setStatusWithActivity(providerId, "Intake Form Completed", "Intake form marked completed.");
}

// Superseded by approveProviderAndAddToDirectoryAction (above), which
// both marks this status *and* creates/links the permanent operational
// Provider Profile in one step - there is no longer a bare "mark
// approved" action that leaves the two systems disconnected.

export async function markNotInterestedAction(providerId: string): Promise<ActionResult> {
  return setStatusWithActivity(providerId, "Not Interested", "Provider marked not interested.");
}

// Suspending or permanently declining a provider requires administrator
// authority (brief "AGENT PROVIDER MANAGEMENT") - these two actions exist
// only in this admin actions file.
export async function markSuspendedAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const reason = String(formData.get("reason") ?? "").trim();
  return setStatusWithActivity(
    providerId,
    "Suspended",
    reason ? `Provider suspended. Reason: ${reason}` : "Provider suspended."
  );
}

export async function markDeclinedAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const reason = String(formData.get("reason") ?? "").trim();
  return setStatusWithActivity(
    providerId,
    "Declined",
    reason ? `Provider declined. Reason: ${reason}` : "Provider declined."
  );
}

export async function closeProviderLeadAction(providerId: string): Promise<ActionResult> {
  return setStatusWithActivity(providerId, "Closed", "Provider lead closed.");
}

// Admin-only "restore" - reopens a closed provider lead back to Under
// Review so it can be worked again (brief section 4/16).
export async function reopenProviderLeadAction(providerId: string): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("provider_leads")
    .update({ status: "Under Review", closed_at: null, closed_by: null })
    .eq("id", providerId);
  if (error) return { error: "Failed to reopen the provider lead." };

  await supabase.from("crm_activities").insert({
    provider_lead_id: providerId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: "Provider lead reopened.",
  });

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  revalidatePath("/admin/crm/provider-acquisition");
  refresh();
  return {};
}

// Admins can delete any provider lead (brief section 16); RLS
// (provider_leads_admin_all) permits it unconditionally.
export async function deleteProviderLeadAction(providerId: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("provider_leads").delete().eq("id", providerId);
  if (error) return { error: "Failed to delete the provider lead." };

  revalidatePath("/admin/crm/provider-acquisition");
  return {};
}

export async function scheduleProviderFollowUpAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const raw = String(formData.get("scheduled_at") ?? "").trim();
  if (!raw) return { error: "A follow-up date and time is required." };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { error: "Invalid date/time." };

  const { error } = await supabase.from("crm_followups").insert({
    provider_lead_id: providerId,
    scheduled_by: crmUser.id,
    scheduled_at: date.toISOString(),
    note: textOrNull(formData, "note"),
  });
  if (error) return { error: "Failed to schedule the follow-up." };

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  return {};
}

export async function rescheduleProviderFollowUpAction(
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

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  return {};
}

export async function completeProviderFollowUpAction(followUpId: string, providerId: string): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_followups")
    .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: crmUser.id })
    .eq("id", followUpId);
  if (error) return { error: "Failed to mark the follow-up completed." };

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  return {};
}

// Admin-only removal of a scheduled follow-up (brief section 9: "The
// administrator must be able to reassign, edit, complete, or remove
// provider follow-ups"). No agent-facing equivalent - agents can only
// reschedule/complete, never delete a callback outright, matching the
// existing crm_followups convention.
export async function removeProviderFollowUpAction(followUpId: string, providerId: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("crm_followups").delete().eq("id", followUpId);
  if (error) return { error: "Failed to remove the follow-up." };

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  return {};
}
