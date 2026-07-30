"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";

// Returns { error } instead of throwing, matching crm/training/actions.ts -
// Next.js redacts thrown Server Action errors to a generic message in
// production, which would swallow our own validation messages too.
type ActionResult = { error?: string };

export async function clockInAction(): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("crm_attendance").insert({
    agent_id: crmUser.id,
  });

  if (error) {
    // crm_attendance_one_open_session_per_agent (migration 0043) is what
    // actually stops a double clock-in; 23505 is its unique_violation.
    if (error.code === "23505") {
      return { error: "You're already clocked in." };
    }
    return { error: "Failed to clock in." };
  }

  revalidatePath("/agent/attendance");
  revalidatePath("/admin/crm/attendance");
  return {};
}

export async function clockOutAction(attendanceId: string): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (crm_attendance_agent_update_own) already restricts this to the
  // caller's own rows; the explicit agent_id/is-null filters below are
  // defense in depth, same rationale as the rest of this CRM's actions.
  const { data, error } = await supabase
    .from("crm_attendance")
    .update({ clock_out_at: new Date().toISOString() })
    .eq("id", attendanceId)
    .eq("agent_id", crmUser.id)
    .is("clock_out_at", null)
    .select("id");

  if (error) return { error: "Failed to clock out." };
  if (!data || data.length === 0) {
    return { error: "That session is already clocked out." };
  }

  revalidatePath("/agent/attendance");
  revalidatePath("/admin/crm/attendance");
  return {};
}
