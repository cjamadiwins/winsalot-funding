"use server";

import { refresh, revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";

export type AttendanceActionState = {
  error: string | null;
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
    .select("id")
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
  revalidatePath("/admin/crm/attendance");
  refresh();
  return { error: null };
}
