"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";

export async function agentSignOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/agent/login");
}

// Marks one of the signed-in agent's own crm_notifications rows read. RLS
// (crm_notifications_update_own) scopes this to user_id = auth.uid()
// regardless. The bell also shows winsalot_chat_notifications rows (the
// shared Employee Chat system's own notification table) - a given id only
// ever exists in one of the two tables, so updating both scoped to this
// user is a harmless no-op on whichever table it isn't in.
export async function markNotificationReadAction(notificationId: string) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("crm_notifications").update({ is_read: true, read_at: now }).eq("id", notificationId).eq("user_id", crmUser.id),
    supabase.from("winsalot_chat_notifications").update({ is_read: true, read_at: now }).eq("id", notificationId).eq("user_id", crmUser.id),
  ]);
  revalidatePath("/agent", "layout");
}

export async function markAllNotificationsReadAction() {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("crm_notifications").update({ is_read: true, read_at: now }).eq("user_id", crmUser.id).eq("is_read", false),
    supabase.from("winsalot_chat_notifications").update({ is_read: true, read_at: now }).eq("user_id", crmUser.id).eq("is_read", false),
  ]);
  revalidatePath("/agent", "layout");
}
