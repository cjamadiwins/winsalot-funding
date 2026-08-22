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

export type ActionResult = { error?: string };

const CORRECTABLE_FIELDS = [
  "clock_in",
  "clock_out",
  "break1_start",
  "break1_end",
  "lunch_start",
  "lunch_end",
  "break2_start",
  "break2_end",
] as const;

function localDatetimeToIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Lets an admin correct any field on any attendance record - open or
// already closed - "Administrators may view and correct all records."
// Enforced at the database level by the agent_attendance_admin_correct_any
// RLS policy and the admin carve-out in enforce_agent_attendance_close_
// only_update (migration 0075); this action's own job is just to capture
// the mandatory audit trail around that update - "every manual adjustment
// must record the administrator, date, reason and previous value."
export async function correctAttendanceRecordAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const attendanceId = String(formData.get("attendance_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!attendanceId) return { error: "Missing attendance record." };
  if (!reason) return { error: "A reason is required to correct an attendance record." };

  const { data: existing, error: fetchError } = await supabase
    .from("agent_attendance")
    .select("*")
    .eq("id", attendanceId)
    .single();
  if (fetchError || !existing) return { error: "Attendance record not found." };

  const updates: Record<string, string | null> = {};
  for (const field of CORRECTABLE_FIELDS) {
    const raw = formData.get(field);
    if (raw === null) continue;
    updates[field] = localDatetimeToIso(String(raw));
  }

  if (Object.keys(updates).length === 0) {
    return { error: "No changes were submitted." };
  }
  if (!updates.clock_in) {
    return { error: "Clock-in time is required." };
  }

  const { data: updated, error } = await supabase
    .from("agent_attendance")
    .update(updates)
    .eq("id", attendanceId)
    .select("*")
    .single();

  if (error || !updated) {
    return { error: `Failed to correct this attendance record: ${error?.message ?? "unknown error"}` };
  }

  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const field of CORRECTABLE_FIELDS) {
    previousValue[field] = existing[field];
    newValue[field] = updated[field];
  }

  await supabase.from("crm_attendance_audit_log").insert({
    attendance_id: attendanceId,
    agent_id: existing.agent_id,
    performed_by: admin.id,
    performed_by_name: admin.full_name || admin.email,
    reason,
    previous_value: previousValue,
    new_value: newValue,
  });

  revalidatePath("/admin/crm/attendance");
  revalidatePath("/agent/my-attendance");
  revalidatePath("/agent/dashboard");
  return {};
}

// Sets (or clears) an agent's scheduled shift start time, used to compute
// late-arrival/early-departure on their attendance records. Nullable -
// clearing it stops that agent from ever being flagged late/early.
export async function setAgentScheduledStartTimeAction(formData: FormData): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const agentId = String(formData.get("agent_id") ?? "").trim();
  const rawTime = String(formData.get("scheduled_start_time") ?? "").trim();
  if (!agentId) return { error: "Missing agent." };

  const { error } = await supabase
    .from("crm_users")
    .update({ scheduled_start_time: rawTime || null })
    .eq("id", agentId);

  if (error) return { error: `Failed to save scheduled start time: ${error.message}` };

  revalidatePath("/admin/crm/attendance");
  return {};
}
