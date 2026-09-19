"use server";

import { refresh, revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { computeAgentActivityPollPlan, isIdleAckReason, type AgentActivityRow } from "@/lib/attendance-pay";
import { notifyAdminsOfAgentIdle, notifyAdminsOfBreakOverdue, notifyAdminsOfIdleAcknowledgment } from "@/lib/leadgen-agent-activity-notifications";
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

  const agentName = agent.full_name.trim() || agent.email;

  // The 30-minute idle acknowledgment episode - see
  // src/app/agent/(dashboard)/dashboard/activity-actions.ts's mirror of
  // this block for the full rationale.
  if (plan.idleWarningTransition === "open" && plan.idleWarningAtIso) {
    await supabase
      .from("leadgen_agent_idle_sessions")
      .insert({ attendance_id: openShift.id, agent_id: agent.id, idle_start: plan.idleWarningAtIso });
  } else if (plan.idleWarningTransition === "resolve_exempted" && plan.idleWarningAtIso) {
    await supabase
      .from("leadgen_agent_idle_sessions")
      .update({ idle_end: plan.idleWarningAtIso })
      .eq("attendance_id", openShift.id)
      .eq("agent_id", agent.id)
      .is("idle_end", null);
  } else if (plan.idleWarningTransition === "escalate" && plan.idleWarningAtIso) {
    const { data: escalatedSession } = await supabase
      .from("leadgen_agent_idle_sessions")
      .update({ escalated_at: plan.idleWarningAtIso })
      .eq("attendance_id", openShift.id)
      .eq("agent_id", agent.id)
      .is("idle_end", null)
      .select("id")
      .maybeSingle();
    let sessionId = escalatedSession?.id as string | undefined;
    if (!sessionId) {
      const { data: inserted } = await supabase
        .from("leadgen_agent_idle_sessions")
        .insert({ attendance_id: openShift.id, agent_id: agent.id, idle_start: plan.idleWarningAtIso, escalated_at: plan.idleWarningAtIso })
        .select("id")
        .single();
      sessionId = inserted?.id as string | undefined;
    }
    if (sessionId) {
      await notifyAdminsOfAgentIdle({ idleSessionId: sessionId, agentName });
    }
  }

  for (const stage of plan.overdueStagesToNotify) {
    await notifyAdminsOfBreakOverdue({ attendanceId: openShift.id, stage, agentName });
  }

  if (plan.idleTransition !== "none" || plan.idleWarningTransition !== "none" || plan.overdueStagesToNotify.length > 0) {
    revalidatePath("/leadgen/admin/attendance");
  }

  const updatedRow: LeadgenAgentAttendanceRow = plan.attendancePatch ? { ...openShift, ...plan.attendancePatch } : openShift;
  return { row: updatedRow };
}

// Lead Generation CRM mirror of
// src/app/agent/(dashboard)/dashboard/activity-actions.ts's
// acknowledgeIdleWarningAction - see that file for the full rationale.
export async function acknowledgeLeadgenIdleWarningAction(input: { reason: string; explanation?: string }): Promise<LeadgenAgentActivityPollResult> {
  const agent = await requireLeadgenAgent();
  if (!isIdleAckReason(input.reason)) return { row: null, error: "Select a valid reason." };
  const explanation = (input.explanation ?? "").trim();
  if (input.reason === "other" && !explanation) return { row: null, error: "Please describe the reason for the inactivity." };

  const supabase = await createSupabaseServerClient();
  const { data: openShift, error: openShiftError } = await loadOwnOpenShift(supabase, agent.id);
  if (openShiftError) return { row: null, error: openShiftError.message };
  if (!openShift) return { row: null, error: "You are not clocked in." };
  if (!openShift.idle_ack_pending_since) return { row: openShift };

  const nowIso = new Date().toISOString();

  const { data: session, error: sessionFetchError } = await supabase
    .from("leadgen_agent_idle_sessions")
    .select("id, idle_start, escalated_at")
    .eq("attendance_id", openShift.id)
    .eq("agent_id", agent.id)
    .is("idle_end", null)
    .maybeSingle();
  if (sessionFetchError) return { row: openShift, error: sessionFetchError.message };

  let idleDurationMinutes = 0;
  if (session) {
    idleDurationMinutes = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(session.idle_start as string).getTime()) / 60000));
    const { error: sessionUpdateError } = await supabase
      .from("leadgen_agent_idle_sessions")
      .update({
        idle_end: nowIso,
        acknowledged_at: nowIso,
        acknowledged_reason: input.reason,
        acknowledged_explanation: input.reason === "other" ? explanation : null,
        acknowledged_before_escalation: !session.escalated_at,
      })
      .eq("id", session.id)
      .eq("agent_id", agent.id)
      .is("idle_end", null);
    if (sessionUpdateError) return { row: openShift, error: sessionUpdateError.message };
  }

  const attendancePatch = { idle_ack_pending_since: null, idle_since: null, last_activity_at: nowIso };
  const { error: attendanceError } = await supabase
    .from("leadgen_agent_attendance")
    .update(attendancePatch)
    .eq("id", openShift.id)
    .eq("agent_id", agent.id)
    .is("clock_out", null);
  if (attendanceError) return { row: openShift, error: attendanceError.message };

  if (session) {
    const agentName = agent.full_name.trim() || agent.email;
    await notifyAdminsOfIdleAcknowledgment({
      idleSessionId: session.id as string,
      agentName,
      reason: input.reason,
      explanation: input.reason === "other" ? explanation : null,
      idleDurationMinutes,
    });
  }

  revalidatePath("/leadgen/admin/attendance");

  return { row: { ...openShift, ...attendancePatch } as LeadgenAgentAttendanceRow };
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
