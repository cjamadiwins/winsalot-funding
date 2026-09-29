"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { opportunityTodayKey } from "@/lib/opportunity-finder";

export async function signOutLeadgenAgentAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/leadgen/login");
}

export type UpdateCurrentCampaignState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

// The agent's active client is now chosen by Admin only (Agent Client Status
// on the admin dashboard -> setAgentActiveClientAction). Agents can see their
// selection but this action no longer changes anything, even if it's posted
// directly - it exists only so any stale page fails with a clear message.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept for the useActionState-style callers; arguments are intentionally ignored.
export async function updateCurrentCampaignAction(_prevState: UpdateCurrentCampaignState, _formData: FormData): Promise<UpdateCurrentCampaignState> {
  await requireLeadgenAgent();
  return { status: "error", message: "Your active client is set by Admin. Ask Admin if it needs to change." };
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

// Deletes only this agent's Lead Generation notification rows. Linked CRM
// data remains unchanged.
export async function clearAllNotificationsAction() {
  const leadgenUser = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  await supabase.from("leadgen_notifications").delete().eq("user_id", leadgenUser.id);
  revalidatePath("/leadgen/agent", "layout");
}

// Uses the authenticated Lead CRM client and its existing score-table RLS;
// only a score attached to this agent's assigned lead can be updated.
export async function markLeadgenOpportunityHandledTodayAction(scoreId: string): Promise<{ error?: string }> {
  await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_opportunity_scores")
    .update({ handled_on: opportunityTodayKey() })
    .eq("id", scoreId)
    .select("id");

  if (error || !data?.length) return { error: "Could not mark this opportunity handled." };
  revalidatePath("/leadgen/agent");
  revalidatePath("/leadgen/agent/my-opportunities");
  return {};
}
