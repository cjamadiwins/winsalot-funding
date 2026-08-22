"use server";

import { refresh, revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import { activeBreakStage, canClockOut, canEndBreak, canStartBreak, type BreakStage } from "@/lib/attendance-pay";

export type AttendanceActionState = {
  error: string | null;
};

const BREAK_COLUMNS: Record<BreakStage, { start: string; end: string }> = {
  break1: { start: "break1_start", end: "break1_end" },
  lunch: { start: "lunch_start", end: "lunch_end" },
  break2: { start: "break2_start", end: "break2_end" },
};

export async function clockInAction(
  _prevState: AttendanceActionState,
  _formData: FormData
): Promise<AttendanceActionState> {
  void _prevState;
  void _formData;

  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { data: openShift } = await supabase
    .from("agent_attendance")
    .select("id")
    .eq("agent_id", crmUser.id)
    .is("clock_out", null)
    .maybeSingle();

  if (openShift) {
    return { error: "You are already clocked in. Please clock out first." };
  }

  const { error } = await supabase.from("agent_attendance").insert({
    agent_id: crmUser.id,
    clock_in: new Date().toISOString(),
  });

  if (error) {
    return { error: `Failed to clock in: ${error.message}` };
  }

  revalidatePath("/agent/dashboard");
  revalidatePath("/agent/my-attendance");
  revalidatePath("/admin/crm/attendance");
  refresh();
  return { error: null };
}

export async function clockOutAction(
  _prevState: AttendanceActionState,
  _formData: FormData
): Promise<AttendanceActionState> {
  void _prevState;
  void _formData;

  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { data: openShift, error: openShiftError } = await supabase
    .from("agent_attendance")
    .select("*")
    .eq("agent_id", crmUser.id)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openShiftError) {
    return { error: `Failed to find open shift: ${openShiftError.message}` };
  }

  if (!openShift) {
    return { error: "No open shift found. Please clock in first." };
  }

  if (!canClockOut(openShift)) {
    return { error: "End your current break before clocking out." };
  }

  const { error } = await supabase
    .from("agent_attendance")
    .update({ clock_out: new Date().toISOString() })
    .eq("id", openShift.id)
    .eq("agent_id", crmUser.id)
    .is("clock_out", null);

  if (error) {
    return { error: `Failed to clock out: ${error.message}` };
  }

  revalidatePath("/agent/dashboard");
  revalidatePath("/agent/my-attendance");
  revalidatePath("/admin/crm/attendance");
  refresh();
  return { error: null };
}

// Shared by all six Start/End Break-1/Lunch/Break-2 actions below - each
// is just this with a fixed stage/edge, since the rules ("must be the
// agent's own open shift," "only one break active at a time," "can't
// reopen an already-used break") are identical for every stage. The
// database constraints added by migration 0075 are the actual authority
// here (agent_attendance_one_active_break, the break-order checks); this
// pre-check exists only to return a clear message instead of a raw
// Postgres constraint-violation error.
async function setBreakEdge(stage: BreakStage, edge: "start" | "end"): Promise<AttendanceActionState> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { data: openShift, error: openShiftError } = await supabase
    .from("agent_attendance")
    .select("*")
    .eq("agent_id", crmUser.id)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openShiftError) {
    return { error: `Failed to find open shift: ${openShiftError.message}` };
  }
  if (!openShift) {
    return { error: "You must be clocked in to record a break." };
  }

  if (edge === "start" && !canStartBreak(openShift, stage)) {
    return {
      error:
        activeBreakStage(openShift) !== null
          ? "End your current break before starting another one."
          : "This break has already been used for this shift.",
    };
  }
  if (edge === "end" && !canEndBreak(openShift, stage)) {
    return { error: "This break is not currently active." };
  }

  const column = BREAK_COLUMNS[stage][edge];
  const { error } = await supabase
    .from("agent_attendance")
    .update({ [column]: new Date().toISOString() })
    .eq("id", openShift.id)
    .eq("agent_id", crmUser.id)
    .is("clock_out", null);

  if (error) {
    return { error: `Failed to record break: ${error.message}` };
  }

  revalidatePath("/agent/dashboard");
  revalidatePath("/agent/my-attendance");
  revalidatePath("/admin/crm/attendance");
  refresh();
  return { error: null };
}

// Each takes the same (prevState, formData) shape as clockInAction/
// clockOutAction above purely so useActionState can drive it - neither
// argument is used.
export async function startBreak1Action(_p: AttendanceActionState, _f: FormData): Promise<AttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("break1", "start");
}
export async function endBreak1Action(_p: AttendanceActionState, _f: FormData): Promise<AttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("break1", "end");
}
export async function startLunchAction(_p: AttendanceActionState, _f: FormData): Promise<AttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("lunch", "start");
}
export async function endLunchAction(_p: AttendanceActionState, _f: FormData): Promise<AttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("lunch", "end");
}
export async function startBreak2Action(_p: AttendanceActionState, _f: FormData): Promise<AttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("break2", "start");
}
export async function endBreak2Action(_p: AttendanceActionState, _f: FormData): Promise<AttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("break2", "end");
}
