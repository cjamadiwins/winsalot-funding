"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";

// Marks one of the signed-in admin's own crm_notifications rows read
// (this includes chat DM/announcement notifications, which are written
// directly into this same table by src/lib/crm-chat-actions.ts). RLS
// (crm_notifications_update_own) already scopes this to user_id =
// auth.uid(), so there's nothing here stopping an admin from "marking
// read" a notification id that isn't theirs beyond the update simply
// affecting zero rows.
export async function markNotificationReadAction(notificationId: string) {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("crm_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", crmUser.id);
  revalidatePath("/admin", "layout");
}

export async function markAllNotificationsReadAction() {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("crm_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", crmUser.id)
    .eq("is_read", false);
  revalidatePath("/admin", "layout");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
