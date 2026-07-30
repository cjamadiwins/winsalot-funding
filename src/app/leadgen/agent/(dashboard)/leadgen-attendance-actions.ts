"use server";

import { refresh, revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type LeadgenAttendanceActionState = {
  error: string | null;
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
    .select("id")
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
  revalidatePath("/leadgen/admin/attendance");
  refresh();
  return { error: null };
}