"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmUser } from "@/lib/crm-auth";
import { isGrowthCrmCampaignKey, type GrowthCrmCampaignKey } from "@/lib/growth-crm-campaign-scripts";

export type UpdateCrmCampaignResult = { status: "success" | "error"; message: string | null };

// The signed-in agent's own current_campaign_key is the only thing this
// action can ever change - the target row always comes from
// requireCrmUser()'s authenticated session, never from client input.
// Mirrors updateCurrentCampaignAction in the Lead Generation CRM
// (src/app/leadgen/agent/(dashboard)/actions.ts): a service-role update
// scoped to this agent's own id/role/active, not the unused
// set_my_leadgen_current_campaign-style RPC pattern that file also has.
export async function updateCrmCurrentCampaignAction(campaignKey: GrowthCrmCampaignKey | null): Promise<UpdateCrmCampaignResult> {
  const agent = await requireCrmUser();

  if (campaignKey && !isGrowthCrmCampaignKey(campaignKey)) {
    return { status: "error", message: "That campaign is not available for selection." };
  }

  const admin = getSupabaseAdmin();
  const { data: updated, error } = await admin
    .from("crm_users")
    .update({ current_campaign_key: campaignKey })
    .eq("id", agent.id)
    .eq("role", "agent")
    .eq("active", true)
    .select("id");

  if (error) {
    return { status: "error", message: "Could not save your campaign selection. Please try again." };
  }
  if (!updated || updated.length === 0) {
    return { status: "error", message: "Could not save your campaign selection: your agent account could not be found." };
  }

  revalidatePath("/agent/dashboard");
  return { status: "success", message: null };
}
