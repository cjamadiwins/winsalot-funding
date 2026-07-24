"use server";

import { refresh, revalidatePath } from "next/cache";
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
  refresh();
}

// A reschedule (unlike the initial "+ Schedule Callback") always requires
// a reason, and always leaves a permanent record of what changed - the
// old due date, the new one, who did it, and why - on the crm_activities
// timeline before crm_followups.scheduled_at (the "current" due date) is
// overwritten. This is what lets an overdue follow-up be pushed forward
// without silently losing when it was originally due.
export async function rescheduleFollowUpAction(
  followUpId: string,
  leadId: string,
  formData: FormData
) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const scheduledAt = parseScheduledAt(formData);
  const reason = textOrNull(formData, "note");
  if (!reason) {
    throw new Error("A reason for rescheduling is required.");
  }

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

  if (error) throw new Error("Failed to reschedule the callback.");

  const agentName = crmUser.full_name || crmUser.email;
  const { error: activityError } = await supabase.from("crm_activities").insert({
    lead_id: leadId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Follow-up rescheduled by ${agentName}. Was due ${new Date(
      existing.scheduled_at
    ).toLocaleString()}, now due ${new Date(scheduledAt).toLocaleString()}. Reason: ${reason}`,
    next_follow_up_at: scheduledAt,
  });

  if (activityError) {
    throw new Error("Callback rescheduled, but failed to log it on the activity timeline.");
  }

  revalidatePath("/agent/dashboard");
  revalidatePath(`/agent/leads/${leadId}`);
  // revalidatePath alone isn't enough here: this page is already rendered
  // dynamically (it reads the session via cookies() before any data
  // fetch), so there's no route-cache entry for it to purge - the lead's
  // isOverdue() badge would keep showing the pre-reschedule state until
  // the next unrelated navigation. refresh() explicitly tells the client
  // router to re-render with what the server just wrote, so the Overdue
  // banner clears the instant a follow-up is pushed to a future date.
  refresh();
}

// Marking a callback completed also leaves a record on the activity
// timeline (who completed it and when) - previously this only updated
// crm_followups with nothing visible in the lead's history.
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

  const agentName = crmUser.full_name || crmUser.email;
  const { error: activityError } = await supabase.from("crm_activities").insert({
    lead_id: leadId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Follow-up completed by ${agentName}.`,
  });

  if (activityError) {
    throw new Error("Callback marked completed, but failed to log it on the activity timeline.");
  }

  revalidatePath("/agent/dashboard");
  revalidatePath(`/agent/leads/${leadId}`);
  refresh();
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
  refresh();
}
