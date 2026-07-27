"use server";

import { refresh, revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import { findProviderDuplicates } from "@/lib/provider-duplicates";
import { sendProviderIntakeEmail } from "@/lib/send-provider-intake-email";
import {
  CALL_OUTCOMES_REQUIRING_FOLLOW_UP,
  PROVIDER_CALL_OUTCOMES,
  PROVIDER_SERVICES_OFFERED,
  PROVIDER_STATUSES,
  type ProviderCallOutcome,
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

export async function updateProviderDetailsAction(providerId: string, formData: FormData): Promise<ActionResult> {
  await requireCrmUser();

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
  const { error } = await supabase
    .from("provider_leads")
    .update({
      business_name: businessName,
      contact_person: textOrNull(formData, "contact_person"),
      phone,
      email: textOrNull(formData, "email"),
      city,
      province,
      website: textOrNull(formData, "website"),
      services_offered: services,
      years_in_business: textOrNull(formData, "years_in_business"),
      lead_source: textOrNull(formData, "lead_source"),
      notes: textOrNull(formData, "notes"),
    })
    .eq("id", providerId);

  if (error) return { error: "Failed to save the provider lead." };

  revalidatePath(`/agent/provider-acquisition/${providerId}`);
  revalidatePath("/agent/provider-acquisition");
  return {};
}

// Agents can update a provider lead's status at any time (brief section
// 16 - unlike crm_leads, there's no agent-restricted stage subset here).
export async function updateProviderStatusAction(providerId: string, status: string): Promise<ActionResult> {
  await requireCrmUser();
  if (!PROVIDER_STATUSES.includes(status as ProviderStatus)) return { error: "Invalid status." };

  const supabase = await createSupabaseServerClient();
  const update: { status: string; closed_at?: string | null; closed_by?: string | null } = { status };
  if (status !== "Closed") {
    update.closed_at = null;
    update.closed_by = null;
  }

  const { error } = await supabase.from("provider_leads").update(update).eq("id", providerId);
  if (error) return { error: "Failed to update the status." };

  revalidatePath(`/agent/provider-acquisition/${providerId}`);
  revalidatePath("/agent/provider-acquisition");
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
    notes,
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
    notes,
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

export async function markApprovedProviderAction(providerId: string): Promise<ActionResult> {
  return setStatusWithActivity(providerId, "Approved Provider", "Provider approved.");
}

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
