"use server";

import { refresh, revalidatePath } from "next/cache";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { computeAgentActivityPollPlan, computeIdleDurationMinutes, isIdleAckReason, type AgentActivityRow } from "@/lib/attendance-pay";
import { notifyAdminsOfAgentIdle, notifyAdminsOfBreakOverdue, notifyAdminsOfIdleAcknowledgment } from "@/lib/crm-agent-activity-notifications";
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

  const agentName = crmUser.full_name.trim() || crmUser.email;

  // The 30-minute idle acknowledgment episode - open/escalate/resolve the
  // one agent_idle_sessions row for it. Independent of idleTransition
  // above (which only ever reflects the 45-minute idle_since marker) -
  // see computeAgentActivityPollPlan's own comment for why these two are
  // now separate.
  if (plan.idleWarningTransition === "open" && plan.idleWarningAtIso && plan.idleEpisodeStartIso) {
    // idle_start is the agent's TRUE last-activity timestamp (the actual
    // start of the inactivity period), not the moment this warning was
    // raised - alert_at records that separately, so idle_duration_minutes
    // (computed from idle_start/idle_end) always reflects real total
    // inactivity time, never just "warning shown to acknowledged."
    await supabase.from("agent_idle_sessions").insert({
      attendance_id: openShift.id,
      agent_id: crmUser.id,
      idle_start: plan.idleEpisodeStartIso,
      alert_at: plan.idleWarningAtIso,
    });
  } else if (plan.idleWarningTransition === "resolve_exempted" && plan.idleWarningAtIso) {
    await supabase
      .from("agent_idle_sessions")
      .update({ idle_end: plan.idleWarningAtIso })
      .eq("attendance_id", openShift.id)
      .eq("agent_id", crmUser.id)
      .is("idle_end", null);
  } else if (plan.idleWarningTransition === "escalate" && plan.idleWarningAtIso) {
    const { data: escalatedSession } = await supabase
      .from("agent_idle_sessions")
      .update({ escalated_at: plan.idleWarningAtIso })
      .eq("attendance_id", openShift.id)
      .eq("agent_id", crmUser.id)
      .is("idle_end", null)
      .select("id")
      .maybeSingle();
    let sessionId = escalatedSession?.id as string | undefined;
    if (!sessionId && plan.idleEpisodeStartIso) {
      // Defensive fallback only - the 30-minute warning always opens the
      // row before this branch can ever run, so this insert should never
      // actually be needed in practice.
      const { data: inserted } = await supabase
        .from("agent_idle_sessions")
        .insert({
          attendance_id: openShift.id,
          agent_id: crmUser.id,
          idle_start: plan.idleEpisodeStartIso,
          alert_at: plan.idleWarningAtIso,
          escalated_at: plan.idleWarningAtIso,
        })
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
    revalidatePath("/admin/crm/attendance");
  }

  const updatedRow: AgentAttendanceRow = plan.attendancePatch ? { ...openShift, ...plan.attendancePatch } : openShift;
  return { row: updatedRow };
}

// Submitted from the required 30-minute idle acknowledgment modal
// (src/components/agent-activity/AgentActivityMonitor.tsx). Closes the
// agent's own currently-open idle session with their reason (and written
// explanation if "Other"), clears the pending-acknowledgment flag and any
// 45-minute escalation, and notifies every admin immediately - "even
// though the agent immediately returns to Active afterward." Uses the
// same session-scoped client as the poll action above, so RLS (agent may
// only insert/select their own rows, and only update their own still-open
// row - never a closed/historical one) is the actual enforcement
// boundary, not just this function's own requireCrmUser() gate.
export async function acknowledgeIdleWarningAction(input: { reason: string; explanation?: string }): Promise<AgentActivityPollResult> {
  const crmUser = await requireCrmUser();
  if (!isIdleAckReason(input.reason)) return { row: null, error: "Select a valid reason." };
  const explanation = (input.explanation ?? "").trim();
  if (input.reason === "other" && !explanation) return { row: null, error: "Please describe the reason for the inactivity." };

  const supabase = await createSupabaseServerClient();
  const { data: openShift, error: openShiftError } = await loadOwnOpenShift(supabase, crmUser.id);
  if (openShiftError) return { row: null, error: openShiftError.message };
  if (!openShift) return { row: null, error: "You are not clocked in." };
  if (!openShift.idle_ack_pending_since) return { row: openShift }; // nothing pending - safe no-op (e.g. a double submit)

  const nowIso = new Date().toISOString();

  const { data: session, error: sessionFetchError } = await supabase
    .from("agent_idle_sessions")
    .select("id, idle_start, escalated_at")
    .eq("attendance_id", openShift.id)
    .eq("agent_id", crmUser.id)
    .is("idle_end", null)
    .maybeSingle();
  if (sessionFetchError) return { row: openShift, error: sessionFetchError.message };

  let idleDurationMinutes = 0;
  if (session) {
    idleDurationMinutes = computeIdleDurationMinutes(session.idle_start as string, nowIso);
    const { error: sessionUpdateError } = await supabase
      .from("agent_idle_sessions")
      .update({
        idle_end: nowIso,
        acknowledged_at: nowIso,
        acknowledged_reason: input.reason,
        acknowledged_explanation: input.reason === "other" ? explanation : null,
        acknowledged_before_escalation: !session.escalated_at,
      })
      .eq("id", session.id)
      .eq("agent_id", crmUser.id)
      .is("idle_end", null);
    if (sessionUpdateError) return { row: openShift, error: sessionUpdateError.message };
  }

  const attendancePatch = { idle_ack_pending_since: null, idle_since: null, last_activity_at: nowIso };
  const { error: attendanceError } = await supabase
    .from("agent_attendance")
    .update(attendancePatch)
    .eq("id", openShift.id)
    .eq("agent_id", crmUser.id)
    .is("clock_out", null);
  if (attendanceError) return { row: openShift, error: attendanceError.message };

  if (session) {
    const agentName = crmUser.full_name.trim() || crmUser.email;
    await notifyAdminsOfIdleAcknowledgment({
      idleSessionId: session.id as string,
      agentName,
      reason: input.reason,
      explanation: input.reason === "other" ? explanation : null,
      idleDurationMinutes,
    });
  }

  revalidatePath("/admin/crm/attendance");

  return { row: { ...openShift, ...attendancePatch } as AgentAttendanceRow };
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
