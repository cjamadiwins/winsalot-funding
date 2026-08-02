"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type LeadgenAdminClockOutState = { error: string | null };

// Admin-only counterpart to leadgenClockOutAction (leadgen/agent/(dashboard)/
// leadgen-attendance-actions.ts) - lets an admin force-close another
// agent's open shift from the Attendance page. requireLeadgenAdmin() gates
// this same as every other admin action in this CRM, and the update itself
// is additionally scoped by the "leadgen_agent_attendance_admin_clock_out_open"
// RLS policy (migration 0048), so an agent can never close another
// agent's shift even if they somehow invoked this action directly - RLS
// simply won't match any row for a non-admin caller.
export async function leadgenAdminClockOutAgentAction(
  _prevState: LeadgenAdminClockOutState,
  formData: FormData
): Promise<LeadgenAdminClockOutState> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const attendanceId = String(formData.get("attendance_id") ?? "").trim();
  if (!attendanceId) return { error: "Missing attendance record." };

  const { data: openShift, error: openShiftError } = await supabase
    .from("leadgen_agent_attendance")
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

  // clock_out is the current instant (a timestamptz, so it is stored as an
  // absolute moment regardless of timezone); the Attendance page displays
  // it in Eastern Time (see formatEasternTimestamp in
  // LeadgenAdminAttendanceClient.tsx). total_minutes is recalculated
  // automatically by the set_leadgen_agent_attendance_derived_fields
  // trigger (migration 0044) whenever clock_out changes.
  const { error } = await supabase
    .from("leadgen_agent_attendance")
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

  revalidatePath("/leadgen/admin/attendance");
  revalidatePath("/leadgen/agent");
  return { error: null };
}
