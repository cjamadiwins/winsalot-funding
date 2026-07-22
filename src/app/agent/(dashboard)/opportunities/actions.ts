"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import { agentSettableStatusesForCategory, type OpportunityStatus } from "@/lib/opportunities/types";

type ActionResult = { error?: string };

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

// RLS (active_cleaning_opportunities_agent_update_own) restricts this to
// opportunities currently assigned to the signed-in agent. The database
// also enforces the agent-settable status list independently (migration
// 0012's restrict-agent-edits trigger, extended in 0017 to branch by
// lead_category) - this check just gives a clear message instead of a raw
// Postgres exception if the dropdown is somehow bypassed. Which status set
// applies depends on the record's own lead_category (an Active Opportunity
// and a Qualified Prospect use different vocabularies), so it's looked up
// first rather than assumed.
export async function updateOpportunityStatusAction(id: string, status: string): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { data: current } = await supabase
    .from("active_cleaning_opportunities")
    .select("lead_category")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { error: "Opportunity not found." };

  const allowedStatuses = agentSettableStatusesForCategory(current.lead_category);
  if (!allowedStatuses.includes(status as OpportunityStatus)) {
    return { error: "You don't have permission to set this status." };
  }

  const { error } = await supabase.from("active_cleaning_opportunities").update({ status }).eq("id", id);
  if (error) return { error: "Failed to update status." };

  revalidatePath(`/agent/opportunities/${id}`);
  revalidatePath("/agent/opportunities");
  return {};
}

export async function addOpportunityActivityAction(id: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const activityType = String(formData.get("activity_type") ?? "call").trim();
  const notes = textOrNull(formData, "notes");
  const nextFollowUpRaw = String(formData.get("next_follow_up_at") ?? "").trim();
  const nextFollowUpAt = nextFollowUpRaw ? new Date(nextFollowUpRaw).toISOString() : null;

  const { error: activityError } = await supabase.from("crm_activities").insert({
    opportunity_id: id,
    agent_id: crmUser.id,
    activity_type: activityType,
    notes,
    next_follow_up_at: nextFollowUpAt,
  });
  if (activityError) return { error: "Failed to save the note." };

  if (nextFollowUpAt) {
    const { error: followUpError } = await supabase.from("crm_followups").insert({
      opportunity_id: id,
      scheduled_by: crmUser.id,
      scheduled_at: nextFollowUpAt,
    });
    if (followUpError) return { error: "Note saved, but failed to schedule the follow-up." };
  }

  const { error: lastContactedError } = await supabase
    .from("active_cleaning_opportunities")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", id);
  if (lastContactedError) return { error: "Note saved, but failed to update the last-contacted date." };

  revalidatePath(`/agent/opportunities/${id}`);
  revalidatePath("/agent/opportunities");
  return {};
}

export async function scheduleOpportunityFollowUpAction(id: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  let scheduledAt: string;
  try {
    scheduledAt = parseScheduledAt(formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid date/time." };
  }

  const { error } = await supabase.from("crm_followups").insert({
    opportunity_id: id,
    scheduled_by: crmUser.id,
    scheduled_at: scheduledAt,
    note: textOrNull(formData, "note"),
  });
  if (error) return { error: "Failed to schedule the callback." };

  revalidatePath(`/agent/opportunities/${id}`);
  revalidatePath("/agent/opportunities");
  return {};
}

export async function rescheduleOpportunityFollowUpAction(
  followUpId: string,
  opportunityId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  let scheduledAt: string;
  try {
    scheduledAt = parseScheduledAt(formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid date/time." };
  }

  const { error } = await supabase
    .from("crm_followups")
    .update({ scheduled_at: scheduledAt, note: textOrNull(formData, "note"), status: "pending", completed_at: null, completed_by: null })
    .eq("id", followUpId);
  if (error) return { error: "Failed to reschedule the callback." };

  revalidatePath(`/agent/opportunities/${opportunityId}`);
  revalidatePath("/agent/opportunities");
  return {};
}

export async function completeOpportunityFollowUpAction(
  followUpId: string,
  opportunityId: string
): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_followups")
    .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: crmUser.id })
    .eq("id", followUpId);
  if (error) return { error: "Failed to mark the callback completed." };

  revalidatePath(`/agent/opportunities/${opportunityId}`);
  revalidatePath("/agent/opportunities");
  return {};
}
