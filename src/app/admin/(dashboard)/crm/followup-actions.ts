"use server";

import { refresh, revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";

// Admin equivalent of src/app/agent/(dashboard)/followup-actions.ts's
// schedule/reschedule/completeFollowUpAction - same required-reason rule
// on reschedule, same activity-timeline record (old date, new date, note,
// who did it, when), same immediate refresh() so the overdue panel
// updates without a stale re-render - just scoped to requireCrmAdmin() and
// keyed on crm_opportunities/opportunity_id instead of crm_leads/lead_id.
// RLS (crm_followups_admin_all) already lets an admin touch any
// opportunity's callbacks, not just ones assigned to them.

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

// The initial "+ Schedule" control on the opportunity detail page's
// Scheduled Callbacks section - no reason required, unlike a reschedule,
// since nothing is being pushed back yet.
export async function scheduleFollowUpAction(opportunityId: string, formData: FormData) {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const scheduledAt = parseScheduledAt(formData);
  const note = textOrNull(formData, "note");

  const { error } = await supabase.from("crm_followups").insert({
    opportunity_id: opportunityId,
    scheduled_by: crmUser.id,
    scheduled_at: scheduledAt,
    note,
  });

  if (error) throw new Error("Failed to schedule the callback.");

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
  refresh();
}

export async function rescheduleFollowUpAction(
  followUpId: string,
  opportunityId: string,
  formData: FormData
) {
  const crmUser = await requireCrmAdmin();
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

  const adminName = crmUser.full_name || crmUser.email;
  const { error: activityError } = await supabase.from("crm_activities").insert({
    opportunity_id: opportunityId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Follow-up rescheduled by ${adminName}. Was due ${new Date(
      existing.scheduled_at
    ).toLocaleString()}, now due ${new Date(scheduledAt).toLocaleString()}. Reason: ${reason}`,
    next_follow_up_at: scheduledAt,
  });

  if (activityError) {
    throw new Error("Callback rescheduled, but failed to log it on the activity timeline.");
  }

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
  refresh();
}

// Marking a callback completed also leaves a record on the activity
// timeline (who completed it and when), same as the agent-side action.
export async function completeFollowUpAction(followUpId: string, opportunityId: string) {
  const crmUser = await requireCrmAdmin();
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

  const adminName = crmUser.full_name || crmUser.email;
  const { error: activityError } = await supabase.from("crm_activities").insert({
    opportunity_id: opportunityId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Follow-up completed by ${adminName}.`,
  });

  if (activityError) {
    throw new Error("Callback marked completed, but failed to log it on the activity timeline.");
  }

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
  refresh();
}
