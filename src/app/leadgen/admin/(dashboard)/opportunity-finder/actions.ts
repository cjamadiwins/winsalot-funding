"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type ActionResult = { error?: string };

function revalidateFinder() {
  revalidatePath("/leadgen/admin/opportunity-finder");
  revalidatePath("/leadgen/admin");
}

// Reassigns the underlying lead itself (leadgen_leads.assigned_agent_id) -
// same underlying write as assignLeadAction in ../leads/actions.ts, just
// reachable directly from this list, and logged the same way.
export async function assignFinderLeadAgentAction(leadId: string, agentId: string | null): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase.from("leadgen_leads").select("assigned_agent_id").eq("id", leadId).maybeSingle();
  const { error } = await supabase.from("leadgen_leads").update({ assigned_agent_id: agentId }).eq("id", leadId);
  if (error) return { error: "Failed to assign this lead." };

  let agentName = "Unassigned";
  if (agentId) {
    const { data: agent } = await supabase.from("leadgen_users").select("full_name").eq("id", agentId).maybeSingle();
    agentName = agent?.full_name ?? "an agent";
  }
  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: null,
    activity_type: existing?.assigned_agent_id ? "lead_reassigned" : "lead_assigned",
    notes: agentId
      ? `Assigned to ${agentName} via Opportunity Finder by ${adminUser.full_name || adminUser.email}.`
      : `Unassigned via Opportunity Finder by ${adminUser.full_name || adminUser.email}.`,
  });

  revalidateFinder();
  return {};
}

export async function setFinderPriorityOverrideAction(
  scoreId: string,
  priorityOverride: "high" | "medium" | "low" | null
): Promise<ActionResult> {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("leadgen_opportunity_scores").update({ priority_override: priorityOverride }).eq("id", scoreId);
  if (error) return { error: "Failed to update the priority." };

  revalidateFinder();
  return {};
}

export async function dismissFinderOpportunityAction(scoreId: string, reason: string): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("leadgen_opportunity_scores")
    .update({
      finder_state: "dismissed",
      dismissed_at: new Date().toISOString(),
      dismissed_by: adminUser.id,
      dismissed_reason: reason.trim() || null,
    })
    .eq("id", scoreId);
  if (error) return { error: "Failed to dismiss this opportunity." };

  revalidateFinder();
  return {};
}

export async function reopenFinderOpportunityAction(scoreId: string): Promise<ActionResult> {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("leadgen_opportunity_scores")
    .update({ finder_state: "active", reopened_at: new Date().toISOString() })
    .eq("id", scoreId);
  if (error) return { error: "Failed to reopen this opportunity." };

  revalidateFinder();
  return {};
}
