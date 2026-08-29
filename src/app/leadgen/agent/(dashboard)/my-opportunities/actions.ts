"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { OPPORTUNITY_AGENT_STATUSES, type OpportunityAgentStatus } from "@/lib/opportunity-finder";

type ActionResult = { error?: string };

// RLS (leadgen_opportunity_scores_agent_update_own) plus the before-update
// trigger (leadgen_opportunity_scores_before_update, migration 0113)
// together enforce that an agent can only ever change their own
// agent_status here - no other column, and no row not assigned to them.
export async function setMyLeadgenOpportunityStatusAction(scoreId: string, status: OpportunityAgentStatus): Promise<ActionResult> {
  await requireLeadgenAgent();
  if (!OPPORTUNITY_AGENT_STATUSES.includes(status)) return { error: "Invalid status." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_opportunity_scores").update({ agent_status: status }).eq("id", scoreId);
  if (error) return { error: "Failed to update this opportunity's status." };

  revalidatePath("/leadgen/agent/my-opportunities");
  return {};
}
