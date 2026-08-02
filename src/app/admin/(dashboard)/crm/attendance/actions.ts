"use server";

import { refresh, revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type AdminClockOutState = { error: string | null };

// Admin-only counterpart to clockOutAction (agent/(dashboard)/dashboard/
// attendance-actions.ts) - lets an admin force-close another agent's open
// shift from the Admin Attendance page. requireCrmAdmin() gates this same
// as every other admin action in this CRM, and the update itself is
// additionally scoped by the "agent_attendance_admin_clock_out_open" RLS
// policy (migration 0049), so an agent can never close another agent's
// shift even if they somehow invoked this action directly - RLS simply
// won't match any row for a non-admin caller.
export async function adminClockOutAgentAction(
  _prevState: AdminClockOutState,
  formData: FormData
): Promise<AdminClockOutState> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const attendanceId = String(formData.get("attendance_id") ?? "").trim();
  if (!attendanceId) return { error: "Missing attendance record." };

  const { data: openShift, error: openShiftError } = await supabase
    .from("agent_attendance")
    .select("id")
    .eq("id", attendanceId)
    .is("clock_out", null)
    .maybeSingle();

  if (openShiftError) {
    return { error: `Failed to find open shift: ${openShiftError.message}` };
  }

  if (!openShift) {
    return { error: "This agent is not currently clocked in." };
  }

  // clock_out is the current instant (a timestamptz, stored as an absolute
  // moment regardless of timezone). total_minutes is recalculated
  // automatically by the set_agent_attendance_total_minutes_trigger
  // (migration 0043) whenever clock_out changes.
  const { error } = await supabase
    .from("agent_attendance")
    .update({
      clock_out: new Date().toISOString(),
      clocked_out_by_admin_id: adminUser.id,
      clocked_out_by_admin_name: adminUser.full_name || adminUser.email,
    })
    .eq("id", attendanceId)
    .is("clock_out", null);

  if (error) {
    return { error: `Failed to clock out agent: ${error.message}` };
  }

  revalidatePath("/admin/crm/attendance");
  revalidatePath("/agent/dashboard");
  refresh();
  return { error: null };
}
