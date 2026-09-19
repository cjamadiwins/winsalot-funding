"use server";

import { refresh, revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { computeAgentActivityPollPlan, type AgentActivityRow } from "@/lib/attendance-pay";
import { notifyAdminsOfAgentIdle, notifyAdminsOfBreakOverdue } from "@/lib/leadgen-agent-activity-notifications";
import type { LeadgenAgentAttendanceRow } from "@/lib/leadgen-types";

// Lead Generation CRM mirror of src/app/agent/(dashboard)/dashboard/
// activity-actions.ts - see that file for the full rationale. Kept as its
// own copy rather than a shared helper for the same "these two CRMs'
// data must never accidentally couple" reason every other per-CRM
// attendance action file in this codebase follows.

export type LeadgenAgentActivityPollResult = { row: LeadgenAgentAttendanceRow | null; error?: string };

async function loadOwnOpenShift(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  agentId: string
): Promise<{ data: LeadgenAgentAttendanceRow | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from("leadgen_agent_attendance")
    .select("*")
    .eq("agent_id", agentId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: data as LeadgenAgentAttendanceRow | null, error };
}

export async function pollLeadgenAgentActivityAction(hadInteraction: boolean): Promise<LeadgenAgentActivityPollResult> {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: openShift, error: openShiftError } = await loadOwnOpenShift(supabase, agent.id);
  if (openShiftError) return { row: null, error: openShiftError.message };
  if (!openShift) return { row: null }; // clocked out - nothing to monitor

  const plan = computeAgentActivityPollPlan(openShift as AgentActivityRow, { hadInteraction });

  if (plan.attendancePatch) {
    const { error } = await supabase
      .from("leadgen_agent_attendance")
      .update(plan.attendancePatch)
      .eq("id", openShift.id)
      .eq("agent_id", agent.id)
      .is("clock_out", null);
    if (error) return { row: openShift, error: error.message };
  }

  if (plan.idleTransition === "end") {
    await supabase
      .from("leadgen_agent_idle_sessions")
      .update({ idle_end: new Date().toISOString() })
      .eq("attendance_id", openShift.id)
      .eq("agent_id", agent.id)
      .is("idle_end", null);
  }

  const agentName = agent.full_name.trim() || agent.email;

  if (plan.idleTransition === "start" && plan.idleStartIso) {
    const { data: idleSession, error: idleInsertError } = await supabase
      .from("leadgen_agent_idle_sessions")
      .insert({ attendance_id: openShift.id, agent_id: agent.id, idle_start: plan.idleStartIso })
      .select("id")
      .single();
    if (!idleInsertError && idleSession) {
      await notifyAdminsOfAgentIdle({ idleSessionId: idleSession.id as string, agentName });
    }
  }

  for (const stage of plan.overdueStagesToNotify) {
    await notifyAdminsOfBreakOverdue({ attendanceId: openShift.id, stage, agentName });
  }

  if (plan.idleTransition !== "none" || plan.overdueStagesToNotify.length > 0) {
    revalidatePath("/leadgen/admin/attendance");
  }

  const updatedRow: LeadgenAgentAttendanceRow = plan.attendancePatch ? { ...openShift, ...plan.attendancePatch } : openShift;
  return { row: updatedRow };
}

export async function setLeadgenOnCallStatusAction(onCall: boolean): Promise<LeadgenAgentActivityPollResult> {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: openShift, error: openShiftError } = await loadOwnOpenShift(supabase, agent.id);
  if (openShiftError) return { row: null, error: openShiftError.message };
  if (!openShift) return { row: null, error: "You must be clocked in to change call status." };

  const { error } = await supabase
    .from("leadgen_agent_attendance")
    .update({ is_on_call: onCall })
    .eq("id", openShift.id)
    .eq("agent_id", agent.id)
    .is("clock_out", null);
  if (error) return { row: openShift, error: error.message };

  revalidatePath("/leadgen/agent");
  refresh();
  return { row: { ...openShift, is_on_call: onCall } };
}
