"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { isLeadgenAgentDashboardCampaignId } from "@/lib/leadgen-agent-campaigns";

export async function signOutLeadgenAgentAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/leadgen/login");
}

export type UpdateCurrentCampaignState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

// The signed-in agent's own current_campaign_id is the only thing this
// action can ever change. The target row always comes from
// requireLeadgenAgent()'s authenticated session (never from form input),
// so an agent can only update their own selection - and every failure
// path returns a visible error instead of swallowing it, so "Saved"
// (below, in AgentCampaignSelector) only ever appears once the database
// update has actually succeeded.
export async function updateCurrentCampaignAction(
  _prevState: UpdateCurrentCampaignState,
  formData: FormData
): Promise<UpdateCurrentCampaignState> {
  const agent = await requireLeadgenAgent();
  const rawCampaignId = formData.get("campaignId");
  const campaignId = typeof rawCampaignId === "string" && rawCampaignId.trim() ? rawCampaignId.trim() : null;

  // Defense in depth: the dropdown only ever renders the campaigns in
  // LEADGEN_AGENT_DASHBOARD_CAMPAIGN_SCRIPTS, but this rejects any other
  // campaign id (e.g. "Q3 Growth Campaign") even if posted directly.
  if (campaignId && !isLeadgenAgentDashboardCampaignId(campaignId)) {
    return { status: "error", message: "That campaign is not available for selection." };
  }

  const admin = getSupabaseAdmin();

  if (campaignId) {
    const { data: campaign, error: campaignError } = await admin
      .from("leadgen_campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("status", "active")
      .maybeSingle();

    if (campaignError) {
      return { status: "error", message: "Could not verify the selected campaign. Please try again." };
    }
    if (!campaign) {
      return { status: "error", message: "The selected campaign is no longer active." };
    }
  }

  const { data: updated, error } = await admin
    .from("leadgen_users")
    .update({ current_campaign_id: campaignId })
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

  revalidatePath("/leadgen/agent");
  revalidatePath("/leadgen/admin");

  return { status: "success", message: null };
}

// Marks one of the signed-in agent's own leadgen_notifications rows read
// (this includes chat DM/announcement notifications, which are written
// directly into this same table by src/lib/leadgen-chat-actions.ts). RLS
// (leadgen_notifications_update_own) already scopes this to user_id =
// auth.uid() - mirrors src/app/agent/(dashboard)/actions.ts.
export async function markNotificationReadAction(notificationId: string) {
  const leadgenUser = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("leadgen_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", leadgenUser.id);
  revalidatePath("/leadgen/agent", "layout");
}

export async function markAllNotificationsReadAction() {
  const leadgenUser = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("leadgen_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", leadgenUser.id)
    .eq("is_read", false);
  revalidatePath("/leadgen/agent", "layout");
}
