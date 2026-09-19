"use server";

import { refresh, revalidatePath } from "next/cache";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { computeAgentActivityPollPlan, type AgentActivityRow } from "@/lib/attendance-pay";
import { notifyAdminsOfAgentIdle, notifyAdminsOfBreakOverdue } from "@/lib/crm-agent-activity-notifications";
import type { AgentAttendanceRow } from "@/lib/crm-types";

// Agent Idle & Break Alert System - the agent-side half of the polling
// loop driven by src/components/agent-activity/useAgentActivityMonitor.ts,
// mounted once in the agent layout so it runs on every page, not just the
// dashboard. All the actual "what changed" logic is the pure, shared
// computeAgentActivityPollPlan (src/lib/attendance-pay.ts) - this file is
// only responsible for reading/writing this CRM's own tables and firing
// the admin notification when the plan calls for one.

export type AgentActivityPollResult = { row: AgentAttendanceRow | null; error?: string };

async function loadOwnOpenShift(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  agentId: string
): Promise<{ data: AgentAttendanceRow | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from("agent_attendance")
    .select("*")
    .eq("agent_id", agentId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: data as AgentAttendanceRow | null, error };
}

// Called on an interval (every ~30s) by every agent-area page while the
// agent is clocked in, plus once immediately when the agent clicks "I'm
// Still Working" on the inactivity warning. `hadInteraction` reflects
// whether the browser saw any mouse/keyboard/etc. activity since the
// previous poll - see the hook for exactly which events count.
export async function pollAgentActivityAction(hadInteraction: boolean): Promise<AgentActivityPollResult> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { data: openShift, error: openShiftError } = await loadOwnOpenShift(supabase, crmUser.id);
  if (openShiftError) return { row: null, error: openShiftError.message };
  if (!openShift) return { row: null }; // clocked out - nothing to monitor

  const plan = computeAgentActivityPollPlan(openShift as AgentActivityRow, { hadInteraction });

  if (plan.attendancePatch) {
    const { error } = await supabase
      .from("agent_attendance")
      .update(plan.attendancePatch)
      .eq("id", openShift.id)
      .eq("agent_id", crmUser.id)
      .is("clock_out", null);
    if (error) return { row: openShift, error: error.message };
  }

  if (plan.idleTransition === "end") {
    await supabase
      .from("agent_idle_sessions")
      .update({ idle_end: new Date().toISOString() })
      .eq("attendance_id", openShift.id)
      .eq("agent_id", crmUser.id)
      .is("idle_end", null);
  }

  const agentName = crmUser.full_name.trim() || crmUser.email;

  if (plan.idleTransition === "start" && plan.idleStartIso) {
    const { data: idleSession, error: idleInsertError } = await supabase
      .from("agent_idle_sessions")
      .insert({ attendance_id: openShift.id, agent_id: crmUser.id, idle_start: plan.idleStartIso })
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
    revalidatePath("/admin/crm/attendance");
  }

  const updatedRow: AgentAttendanceRow = plan.attendancePatch ? { ...openShift, ...plan.attendancePatch } : openShift;
  return { row: updatedRow };
}

// "Actively marked as being on a business call" - a manual toggle, since
// no live on-call/presence system already exists anywhere in the schema
// to integrate with instead (see the migration's header comment). While
// true, the poll above never starts an inactivity clock.
export async function setOnCallStatusAction(onCall: boolean): Promise<AgentActivityPollResult> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { data: openShift, error: openShiftError } = await loadOwnOpenShift(supabase, crmUser.id);
  if (openShiftError) return { row: null, error: openShiftError.message };
  if (!openShift) return { row: null, error: "You must be clocked in to change call status." };

  const { error } = await supabase
    .from("agent_attendance")
    .update({ is_on_call: onCall })
    .eq("id", openShift.id)
    .eq("agent_id", crmUser.id)
    .is("clock_out", null);
  if (error) return { row: openShift, error: error.message };

  revalidatePath("/agent/dashboard");
  refresh();
  return { row: { ...openShift, is_on_call: onCall } };
}
