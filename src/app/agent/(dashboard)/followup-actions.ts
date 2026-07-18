"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";

// Shared by both the dashboard's Follow-Up Calendar and the lead detail
// page's "Schedule Callback" control. RLS (crm_followups_agent_*, see
// migration 0011) is what actually enforces that an agent can only ever
// touch callbacks tied to leads currently assigned to them - these
// functions don't re-derive that themselves, same as the existing
// crm_leads/crm_activities agent actions.

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function parseScheduledAt(formData: FormData): string {
  const raw = String(formData.get("scheduled_at") ?? "").trim();
  if (!raw) throw new Error("A callback date and time is required.");
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date/time.");
  return date.toISOString();
}

export async function scheduleFollowUpAction(leadId: string, formData: FormData) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const scheduledAt = parseScheduledAt(formData);
  const note = textOrNull(formData, "note");

  const { error } = await supabase.from("crm_followups").insert({
    lead_id: leadId,
    scheduled_by: crmUser.id,
    scheduled_at: scheduledAt,
    note,
  });

  if (error) throw new Error("Failed to schedule the callback.");

  revalidatePath("/agent/dashboard");
  revalidatePath(`/agent/leads/${leadId}`);
}

export async function rescheduleFollowUpAction(
  followUpId: string,
  leadId: string,
  formData: FormData
) {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const scheduledAt = parseScheduledAt(formData);
  const note = textOrNull(formData, "note");

  const { error } = await supabase
    .from("crm_followups")
    .update({
      scheduled_at: scheduledAt,
      note,
      status: "pending",
      completed_at: null,
      completed_by: null,
    })
    .eq("id", followUpId);

  if (error) throw new Error("Failed to reschedule the callback.");

  revalidatePath("/agent/dashboard");
  revalidatePath(`/agent/leads/${leadId}`);
}

export async function completeFollowUpAction(followUpId: string, leadId: string) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_followups")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: crmUser.id,
    })
    .eq("id", followUpId);

  if (error) throw new Error("Failed to mark the callback completed.");

  revalidatePath("/agent/dashboard");
  revalidatePath(`/agent/leads/${leadId}`);
}

// The "add a new note" action on a callback - reuses the same
// crm_activities timeline every other note/activity goes through, rather
// than storing a second, competing notes field on crm_followups itself.
export async function addFollowUpNoteAction(leadId: string, note: string) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const trimmed = note.trim();
  if (!trimmed) throw new Error("Note cannot be empty.");

  const { error } = await supabase.from("crm_activities").insert({
    lead_id: leadId,
    agent_id: crmUser.id,
    activity_type: "note",
    notes: trimmed,
  });

  if (error) throw new Error("Failed to save the note.");

  revalidatePath("/agent/dashboard");
  revalidatePath(`/agent/leads/${leadId}`);
}
