"use server";

import { refresh, revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";

// Provider Acquisition's equivalent of src/app/agent/(dashboard)/followup-actions.ts,
// scoped to crm_followups rows with provider_lead_id set instead of
// lead_id (see migration 0026). Shared by the dashboard's "Provider
// Follow-ups" section and a provider lead's own detail page, same as the
// lead-side file is shared by the Follow-Up Calendar and a lead's page.

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function parseScheduledAt(formData: FormData): string {
  const raw = String(formData.get("scheduled_at") ?? "").trim();
  if (!raw) throw new Error("A follow-up date and time is required.");
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date/time.");
  return date.toISOString();
}

export async function scheduleProviderFollowUpAction(providerLeadId: string, formData: FormData) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const scheduledAt = parseScheduledAt(formData);
  const note = textOrNull(formData, "note");

  const { error } = await supabase.from("crm_followups").insert({
    provider_lead_id: providerLeadId,
    scheduled_by: crmUser.id,
    scheduled_at: scheduledAt,
    note,
  });

  if (error) throw new Error("Failed to schedule the follow-up.");

  revalidatePath("/agent/dashboard");
  revalidatePath(`/agent/provider-acquisition/${providerLeadId}`);
  revalidatePath("/agent/provider-acquisition");
  refresh();
}

export async function rescheduleProviderFollowUpAction(
  followUpId: string,
  providerLeadId: string,
  formData: FormData
) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const scheduledAt = parseScheduledAt(formData);
  const reason = textOrNull(formData, "note");
  if (!reason) throw new Error("A reason for rescheduling is required.");

  const { data: existing, error: fetchError } = await supabase
    .from("crm_followups")
    .select("scheduled_at")
    .eq("id", followUpId)
    .maybeSingle();
  if (fetchError || !existing) throw new Error("Follow-up not found.");

  const { error } = await supabase
    .from("crm_followups")
    .update({
      scheduled_at: scheduledAt,
      note: reason,
      status: "pending",
      completed_at: null,
      completed_by: null,
    })
    .eq("id", followUpId);
  if (error) throw new Error("Failed to reschedule the follow-up.");

  const agentName = crmUser.full_name || crmUser.email;
  const { error: activityError } = await supabase.from("crm_activities").insert({
    provider_lead_id: providerLeadId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Follow-up rescheduled by ${agentName}. Was due ${new Date(
      existing.scheduled_at
    ).toLocaleString()}, now due ${new Date(scheduledAt).toLocaleString()}. Reason: ${reason}`,
    next_follow_up_at: scheduledAt,
  });
  if (activityError) throw new Error("Follow-up rescheduled, but failed to log it on the activity timeline.");

  revalidatePath("/agent/dashboard");
  revalidatePath(`/agent/provider-acquisition/${providerLeadId}`);
  revalidatePath("/agent/provider-acquisition");
  refresh();
}

export async function completeProviderFollowUpAction(followUpId: string, providerLeadId: string) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_followups")
    .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: crmUser.id })
    .eq("id", followUpId);
  if (error) throw new Error("Failed to mark the follow-up completed.");

  const agentName = crmUser.full_name || crmUser.email;
  const { error: activityError } = await supabase.from("crm_activities").insert({
    provider_lead_id: providerLeadId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Follow-up completed by ${agentName}.`,
  });
  if (activityError) throw new Error("Follow-up marked completed, but failed to log it on the activity timeline.");

  revalidatePath("/agent/dashboard");
  revalidatePath(`/agent/provider-acquisition/${providerLeadId}`);
  revalidatePath("/agent/provider-acquisition");
  refresh();
}

export async function addProviderFollowUpNoteAction(providerLeadId: string, note: string) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const trimmed = note.trim();
  if (!trimmed) throw new Error("Note cannot be empty.");

  const { error } = await supabase.from("crm_activities").insert({
    provider_lead_id: providerLeadId,
    agent_id: crmUser.id,
    activity_type: "note",
    notes: trimmed,
  });
  if (error) throw new Error("Failed to save the note.");

  revalidatePath("/agent/dashboard");
  revalidatePath(`/agent/provider-acquisition/${providerLeadId}`);
  refresh();
}
