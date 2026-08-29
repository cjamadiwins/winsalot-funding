"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { OPPORTUNITY_AGENT_STATUSES, type OpportunityAgentStatus } from "@/lib/opportunity-finder";

type ActionResult = { error?: string };

// RLS (crm_opportunity_scores_agent_update_own) plus the before-update
// trigger (crm_opportunity_scores_before_update, migration 0112) together
// enforce that an agent can only ever change their own agent_status here -
// no other column on this row, and no row not assigned to them.
export async function setMyOpportunityStatusAction(scoreId: string, status: OpportunityAgentStatus): Promise<ActionResult> {
  await requireCrmUser();
  if (!OPPORTUNITY_AGENT_STATUSES.includes(status)) return { error: "Invalid status." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("crm_opportunity_scores").update({ agent_status: status }).eq("id", scoreId);
  if (error) return { error: "Failed to update this opportunity's status." };

  revalidatePath("/agent/my-opportunities");
  return {};
}
