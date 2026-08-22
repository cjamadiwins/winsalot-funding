"use server";

import { refresh, revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { canClockOut, canEndBreak, canStartBreak, describeCannotStartBreak, type BreakStage } from "@/lib/attendance-pay";

export type LeadgenAttendanceActionState = {
  error: string | null;
};

const BREAK_COLUMNS: Record<BreakStage, { start: string; end: string }> = {
  break1: { start: "break1_start", end: "break1_end" },
  lunch: { start: "lunch_start", end: "lunch_end" },
  break2: { start: "break2_start", end: "break2_end" },
};

export async function leadgenClockInAction(
  _prevState: LeadgenAttendanceActionState,
  _formData: FormData
): Promise<LeadgenAttendanceActionState> {
  void _prevState;
  void _formData;

  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: openShift } = await supabase
    .from("leadgen_agent_attendance")
    .select("id")
    .eq("agent_id", agent.id)
    .is("clock_out", null)
    .maybeSingle();

  if (openShift) {
    return { error: "You are already clocked in. Please clock out first." };
  }

  const { error } = await supabase.from("leadgen_agent_attendance").insert({
    agent_id: agent.id,
    agent_name: agent.full_name || agent.email,
    clock_in: new Date().toISOString(),
  });

  if (error) {
    return { error: `Failed to clock in: ${error.message}` };
  }

  revalidatePath("/leadgen/agent");
  revalidatePath("/leadgen/agent/my-attendance");
  revalidatePath("/leadgen/admin/attendance");
  refresh();
  return { error: null };
}

export async function leadgenClockOutAction(
  _prevState: LeadgenAttendanceActionState,
  _formData: FormData
): Promise<LeadgenAttendanceActionState> {
  void _prevState;
  void _formData;

  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: openShift, error: openShiftError } = await supabase
    .from("leadgen_agent_attendance")
    .select("*")
    .eq("agent_id", agent.id)
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
    .from("leadgen_agent_attendance")
    .update({ clock_out: new Date().toISOString() })
    .eq("id", openShift.id)
    .eq("agent_id", agent.id)
    .is("clock_out", null);

  if (error) {
    return { error: `Failed to clock out: ${error.message}` };
  }

  revalidatePath("/leadgen/agent");
  revalidatePath("/leadgen/agent/my-attendance");
  revalidatePath("/leadgen/admin/attendance");
  refresh();
  return { error: null };
}

// Shared by all six Start/End Break-1/Lunch/Break-2 actions below - see
// the Cleaning CRM's mirror (src/app/agent/(dashboard)/dashboard/
// attendance-actions.ts's setBreakEdge) for the full rationale. Kept as
// its own copy rather than a shared helper for the same "these two
// CRMs' logic must never accidentally couple" reason every other
// per-CRM action file in this codebase follows.
async function setBreakEdge(stage: BreakStage, edge: "start" | "end"): Promise<LeadgenAttendanceActionState> {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: openShift, error: openShiftError } = await supabase
    .from("leadgen_agent_attendance")
    .select("*")
    .eq("agent_id", agent.id)
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
    return { error: describeCannotStartBreak(openShift, stage) };
  }
  if (edge === "end" && !canEndBreak(openShift, stage)) {
    return { error: "This break is not currently active." };
  }

  const column = BREAK_COLUMNS[stage][edge];
  const { error } = await supabase
    .from("leadgen_agent_attendance")
    .update({ [column]: new Date().toISOString() })
    .eq("id", openShift.id)
    .eq("agent_id", agent.id)
    .is("clock_out", null);

  if (error) {
    return { error: `Failed to record break: ${error.message}` };
  }

  revalidatePath("/leadgen/agent");
  revalidatePath("/leadgen/agent/my-attendance");
  revalidatePath("/leadgen/admin/attendance");
  refresh();
  return { error: null };
}

// Each takes the same (prevState, formData) shape as leadgenClockInAction/
// leadgenClockOutAction above purely so useActionState can drive it -
// neither argument is used.
export async function leadgenStartBreak1Action(_p: LeadgenAttendanceActionState, _f: FormData): Promise<LeadgenAttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("break1", "start");
}
export async function leadgenEndBreak1Action(_p: LeadgenAttendanceActionState, _f: FormData): Promise<LeadgenAttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("break1", "end");
}
export async function leadgenStartLunchAction(_p: LeadgenAttendanceActionState, _f: FormData): Promise<LeadgenAttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("lunch", "start");
}
export async function leadgenEndLunchAction(_p: LeadgenAttendanceActionState, _f: FormData): Promise<LeadgenAttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("lunch", "end");
}
export async function leadgenStartBreak2Action(_p: LeadgenAttendanceActionState, _f: FormData): Promise<LeadgenAttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("break2", "start");
}
export async function leadgenEndBreak2Action(_p: LeadgenAttendanceActionState, _f: FormData): Promise<LeadgenAttendanceActionState> {
  void _p;
  void _f;
  return setBreakEdge("break2", "end");
}
