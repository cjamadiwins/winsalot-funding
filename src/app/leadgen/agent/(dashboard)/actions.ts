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

// Marks one of the signed-in agent's own leadgen_notifications rows
// read. RLS (leadgen_notifications_update_own) already scopes this to
// user_id = auth.uid() - mirrors src/app/agent/(dashboard)/actions.ts.
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
