"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { addActivityAction } from "../opportunities/[id]/actions";

type ActionResult = { error?: string };

// Board View's compact "Add Note" quick-form - a thin wrapper around the
// exact same addActivityAction the full opportunity detail page's own
// "Log Activity" form already calls (activity_type fixed to "note" so a
// quick note never implies a call/email happened). No new note-taking
// path is introduced; this only exposes the existing one from the Board
// View's detail panel. addActivityAction throws on failure rather than
// returning a result, so that's translated into this module's
// { error? } shape here.
export async function addBoardOpportunityNoteAction(opportunityId: string, note: string): Promise<ActionResult> {
  const formData = new FormData();
  formData.set("activity_type", "note");
  formData.set("notes", note);
  try {
    await addActivityAction(opportunityId, formData);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save the note." };
  }
  revalidateFinder();
  return {};
}

function revalidateFinder() {
  revalidatePath("/admin/crm/opportunity-finder");
  revalidatePath("/admin/crm");
}

// Reassigns the underlying opportunity itself (crm_opportunities.assigned_agent_id) -
// there is deliberately no separate "Opportunity Finder assignment" layer;
// assigning an opportunity here is the same action as assigning it anywhere
// else in the CRM, just reachable directly from this list. Logged as an
// "outcome" activity entry (this CRM has no dedicated lead_assigned/
// lead_reassigned activity_type the way the Lead Gen CRM does).
export async function assignOpportunityAgentAction(opportunityId: string, agentId: string | null): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("crm_opportunities").update({ assigned_agent_id: agentId }).eq("id", opportunityId);
  if (error) return { error: "Failed to assign this opportunity." };

  let agentName = "Unassigned";
  if (agentId) {
    const { data: agent } = await supabase.from("crm_users").select("full_name, email").eq("id", agentId).maybeSingle();
    agentName = agent?.full_name || agent?.email || "an agent";
  }
  await supabase.from("crm_activities").insert({
    opportunity_id: opportunityId,
    agent_id: admin.id,
    activity_type: "outcome",
    notes: agentId
      ? `Reassigned to ${agentName} via Opportunity Finder by ${admin.full_name || admin.email}.`
      : `Unassigned via Opportunity Finder by ${admin.full_name || admin.email}.`,
  });

  revalidateFinder();
  return {};
}

export async function setOpportunityPriorityOverrideAction(
  scoreId: string,
  priorityOverride: "high" | "medium" | "low" | null
): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("crm_opportunity_scores").update({ priority_override: priorityOverride }).eq("id", scoreId);
  if (error) return { error: "Failed to update the priority." };

  revalidateFinder();
  return {};
}

export async function dismissOpportunityAction(scoreId: string, reason: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_opportunity_scores")
    .update({
      finder_state: "dismissed",
      dismissed_at: new Date().toISOString(),
      dismissed_by: admin.id,
      dismissed_reason: reason.trim() || null,
    })
    .eq("id", scoreId);
  if (error) return { error: "Failed to dismiss this opportunity." };

  revalidateFinder();
  return {};
}

export async function reopenOpportunityAction(scoreId: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_opportunity_scores")
    .update({ finder_state: "active", reopened_at: new Date().toISOString() })
    .eq("id", scoreId);
  if (error) return { error: "Failed to reopen this opportunity." };

  revalidateFinder();
  return {};
}
