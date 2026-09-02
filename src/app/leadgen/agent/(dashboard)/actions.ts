"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";

export async function signOutLeadgenAgentAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/leadgen/login");
}

export async function updateCurrentCampaignAction(formData: FormData) {
  await requireLeadgenAgent();
  const rawCampaignId = formData.get("campaignId");
  const campaignId = typeof rawCampaignId === "string" && rawCampaignId.trim() ? rawCampaignId.trim() : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_my_leadgen_current_campaign", { campaign_id: campaignId });

  if (error) throw new Error(error.message || "Unable to save the current campaign.");

  revalidatePath("/leadgen/agent");
  revalidatePath("/leadgen/admin");
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
