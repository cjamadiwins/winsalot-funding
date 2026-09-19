import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { BreakStage } from "./attendance-pay";

// Lead Generation CRM mirror of crm-agent-activity-notifications.ts - see
// that file for the full rationale. Kept as its own copy rather than a
// shared helper for the same "these two CRMs' data must never accidentally
// couple" reason every other per-CRM notification file in this codebase
// follows (crm-leave-notifications.ts / leadgen-leave-notifications.ts).

const ATTENDANCE_ADMIN_PATH = "/leadgen/admin/attendance";

async function loadActiveAdminIds(): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("leadgen_users").select("id").eq("role", "admin").eq("active", true);
  if (error) {
    console.error("[leadgen-agent-activity] Failed to load admins to notify:", error);
    return [];
  }
  return (data ?? []).map((row) => row.id as string);
}

export async function notifyAdminsOfAgentIdle(input: { idleSessionId: string; agentName: string }): Promise<void> {
  const admin = getSupabaseAdmin();
  const adminIds = await loadActiveAdminIds();
  if (adminIds.length === 0) return;

  const { error } = await admin.from("leadgen_notifications").insert(
    adminIds.map((userId) => ({
      user_id: userId,
      title: `${input.agentName} has been inactive for 45 minutes.`,
      body: null,
      link_path: `${ATTENDANCE_ADMIN_PATH}?idle=${input.idleSessionId}`,
    }))
  );
  if (error) console.error("[leadgen-agent-activity] Failed to notify admins of idle agent:", error);
}

export async function notifyAdminsOfBreakOverdue(input: {
  attendanceId: string;
  stage: BreakStage;
  agentName: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const adminIds = await loadActiveAdminIds();
  if (adminIds.length === 0) return;

  const limitLabel = input.stage === "lunch" ? "the 30-minute lunch limit" : "the 15-minute break limit";
  const { error } = await admin.from("leadgen_notifications").insert(
    adminIds.map((userId) => ({
      user_id: userId,
      title: `${input.agentName} has exceeded ${limitLabel}.`,
      body: null,
      link_path: `${ATTENDANCE_ADMIN_PATH}?break_overdue=${input.attendanceId}-${input.stage}`,
    }))
  );
  if (error) console.error("[leadgen-agent-activity] Failed to notify admins of break overdue:", error);
}
