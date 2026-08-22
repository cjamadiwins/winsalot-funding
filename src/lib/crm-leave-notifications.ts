import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { LeaveRequestAuditAction } from "./leave-requests";

// Audit trail + in-app notifications for the Cleaning CRM's Leave
// Requests feature (crm_leave_requests / crm_leave_request_audit_log,
// migration 0069). Always uses the service-role admin client, same
// rationale as notifyCrmUsers in provider-intake-submission.ts: the
// audit log has no agent-facing insert RLS policy (admin-only, by
// design - see migration 0069), and crm_notifications has no insert
// policy for any signed-in user at all, so both are only ever written
// from trusted server code, never the caller's own session client.

export async function recordCrmLeaveAudit(params: {
  leaveRequestId: string;
  agentId: string | null;
  agentName: string;
  action: LeaveRequestAuditAction;
  performedById: string | null;
  performedByName: string;
  note?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("crm_leave_request_audit_log").insert({
    leave_request_id: params.leaveRequestId,
    agent_id: params.agentId,
    agent_name: params.agentName,
    action: params.action,
    performed_by: params.performedById,
    performed_by_name: params.performedByName,
    note: params.note ?? null,
    details: params.details ?? null,
  });
  if (error) {
    console.error("[crm-leave] Failed to record audit row:", error);
  }
}

// Notifies every active admin that an agent submitted a new leave
// request. Short-notice requests get a distinct title so they stand out
// in the notification list without needing to open the request first.
export async function notifyAdminsOfNewCrmLeaveRequest(input: {
  agentName: string;
  isShortNotice: boolean;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: admins, error: adminsError } = await admin
    .from("crm_users")
    .select("id")
    .eq("role", "admin")
    .eq("active", true);

  if (adminsError || !admins || admins.length === 0) {
    if (adminsError) console.error("[crm-leave] Failed to load admins to notify:", adminsError);
    return;
  }

  const title = input.isShortNotice
    ? `Short Notice: Leave request from ${input.agentName}`
    : `New leave request from ${input.agentName}`;

  const { error } = await admin.from("crm_notifications").insert(
    admins.map((a) => ({
      user_id: a.id as string,
      title,
      body: input.isShortNotice
        ? "Planned leave submitted with fewer than seven days' notice."
        : null,
      link_path: "/admin/crm/leave-requests",
    }))
  );
  if (error) {
    console.error("[crm-leave] Failed to notify admins:", error);
  }
}

// Notifies the agent that their leave request was approved or declined.
export async function notifyAgentOfCrmLeaveDecision(input: {
  agentId: string;
  status: "approved" | "declined";
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("crm_notifications").insert({
    user_id: input.agentId,
    title: input.status === "approved" ? "Your leave request was approved" : "Your leave request was declined",
    link_path: "/agent/leave-requests",
  });
  if (error) {
    console.error("[crm-leave] Failed to notify agent of decision:", error);
  }
}
