"use server";

import { refresh, revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
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

export async function updateProviderDetailsAction(providerId: string, formData: FormData): Promise<ActionResult> {
  await requireCrmAdmin();

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

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  revalidatePath("/admin/crm/provider-acquisition");
  return {};
}

// The administrator may overwrite or correct the status at any time
// (brief section 3).
export async function updateProviderStatusAction(providerId: string, status: string): Promise<ActionResult> {
  await requireCrmAdmin();
  if (!PROVIDER_STATUSES.includes(status as ProviderStatus)) return { error: "Invalid status." };

  const supabase = await createSupabaseServerClient();
  const update: { status: string; closed_at?: string | null; closed_by?: string | null } = { status };
  if (status !== "Closed") {
    update.closed_at = null;
    update.closed_by = null;
  }

  const { error } = await supabase.from("provider_leads").update(update).eq("id", providerId);
  if (error) return { error: "Failed to update the status." };

  revalidatePath(`/admin/crm/provider-acquisition/${providerId}`);
  revalidatePath("/admin/crm/provider-acquisition");
  return {};
}

// Assigning/reassigning to any agent (or unassigning) - admin-only, shown
// as a dedicated dropdown on the detail page (brief section 4/16).
export async function assignProviderAgentAction(providerId: string, agentId: string | null): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("provider_leads")
    .update({ assigned_agent_id: agentId })
    .eq("id", providerId);
  if (error) return { error: "Failed to assign the agent." };

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

export async function markApprovedProviderAction(providerId: string): Promise<ActionResult> {
  return setStatusWithActivity(providerId, "Approved Provider", "Provider approved.");
}

export async function markNotInterestedAction(providerId: string): Promise<ActionResult> {
  return setStatusWithActivity(providerId, "Not Interested", "Provider marked not interested.");
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
