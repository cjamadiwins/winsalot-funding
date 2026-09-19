import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { IDLE_ACK_REASON_LABELS, type BreakStage, type IdleAckReason } from "./attendance-pay";

// Admin notifications for the Agent Idle & Break Alert System - reuses
// the existing crm_notifications table/NotificationBell delivery exactly
// as-is (see crm-leave-notifications.ts, the established "notify every
// active admin" pattern this mirrors), never a second notification
// system. Always the service-role client: crm_notifications has no
// insert policy for any signed-in user, admin included - see that file's
// own header comment for the full rationale.

const ATTENDANCE_ADMIN_PATH = "/admin/crm/attendance";

async function loadActiveAdminIds(): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("crm_users").select("id").eq("role", "admin").eq("active", true);
  if (error) {
    console.error("[crm-agent-activity] Failed to load admins to notify:", error);
    return [];
  }
  return (data ?? []).map((row) => row.id as string);
}

// "Henry Osuji has been inactive for 45 minutes and did not acknowledge
// the 30-minute idle warning." - by construction this is always true: the
// 45-minute escalation only ever fires (see computeAgentActivityPollPlan's
// idleWarningTransition "escalate") on an episode whose 30-minute warning
// was already raised and never acknowledged. One row per admin, link_path
// embeds the idle session's own id so a later idle episode for the same
// agent always gets its own fresh notification rather than being silently
// deduplicated against an earlier one.
export async function notifyAdminsOfAgentIdle(input: { idleSessionId: string; agentName: string }): Promise<void> {
  const admin = getSupabaseAdmin();
  const adminIds = await loadActiveAdminIds();
  if (adminIds.length === 0) return;

  const { error } = await admin.from("crm_notifications").insert(
    adminIds.map((userId) => ({
      user_id: userId,
      title: `${input.agentName} has been inactive for 45 minutes and did not acknowledge the 30-minute idle warning.`,
      body: null,
      link_path: `${ATTENDANCE_ADMIN_PATH}?idle=${input.idleSessionId}`,
    }))
  );
  if (error) console.error("[crm-agent-activity] Failed to notify admins of idle agent:", error);
}

// "Henry Osuji acknowledged a 30-minute idle alert. Reason: Researching a
// prospect." - fired immediately every time an agent submits the
// 30-minute acknowledgment, even though they're immediately back to
// Active afterward; body always carries the idle duration, plus the
// agent's own written explanation when they picked "Other" (Notification
// Bell already renders body inline under the title whenever it's
// non-null, so no separate "expand" UI is needed for Admin to see it).
export async function notifyAdminsOfIdleAcknowledgment(input: {
  idleSessionId: string;
  agentName: string;
  reason: IdleAckReason;
  explanation: string | null;
  idleDurationMinutes: number;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const adminIds = await loadActiveAdminIds();
  if (adminIds.length === 0) return;

  const reasonLabel = IDLE_ACK_REASON_LABELS[input.reason];
  const durationLabel = `Idle duration: ${input.idleDurationMinutes} min`;
  const body = input.reason === "other" && input.explanation ? `${durationLabel} · Explanation: ${input.explanation}` : durationLabel;

  const { error } = await admin.from("crm_notifications").insert(
    adminIds.map((userId) => ({
      user_id: userId,
      title: `${input.agentName} acknowledged a 30-minute idle alert. Reason: ${reasonLabel}.`,
      body,
      link_path: `${ATTENDANCE_ADMIN_PATH}?idleAck=${input.idleSessionId}`,
    }))
  );
  if (error) console.error("[crm-agent-activity] Failed to notify admins of idle acknowledgment:", error);
}

// "Henry Osuji has exceeded the 15-minute break limit." /
// "...the 30-minute lunch limit." Idempotency is the caller's
// responsibility (the *_overdue_notified_at column on agent_attendance is
// the guard - this is only ever called once per occurrence).
export async function notifyAdminsOfBreakOverdue(input: {
  attendanceId: string;
  stage: BreakStage;
  agentName: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const adminIds = await loadActiveAdminIds();
  if (adminIds.length === 0) return;

  const limitLabel = input.stage === "lunch" ? "the 30-minute lunch limit" : "the 15-minute break limit";
  const { error } = await admin.from("crm_notifications").insert(
    adminIds.map((userId) => ({
      user_id: userId,
      title: `${input.agentName} has exceeded ${limitLabel}.`,
      body: null,
      link_path: `${ATTENDANCE_ADMIN_PATH}?break_overdue=${input.attendanceId}-${input.stage}`,
    }))
  );
  if (error) console.error("[crm-agent-activity] Failed to notify admins of break overdue:", error);
}
