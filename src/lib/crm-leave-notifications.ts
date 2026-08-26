import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { formatLeaveDateRangeLabel, type LeaveRequestAuditAction } from "./leave-requests";

// Audit trail + in-app notifications for the Winsalot Growth CRM's Leave
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

function crmLeaveRequestAdminLinkPath(leaveRequestId: string): string {
  return `/admin/crm/leave-requests?highlight=${leaveRequestId}`;
}

function crmLeaveRequestAgentLinkPath(leaveRequestId: string): string {
  return `/agent/leave-requests?highlight=${leaveRequestId}`;
}

// Notifies every active admin that an agent submitted a new leave
// request. Guards against duplicate notifications for the same request
// (e.g. a retried Server Action call) by checking, per recipient,
// whether a notification linking to this exact request already exists
// before inserting - link_path is unique per (recipient, request) pair
// since it embeds the request's own id.
export async function notifyAdminsOfNewCrmLeaveRequest(input: {
  leaveRequestId: string;
  agentName: string;
  startDate: string;
  endDate: string;
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

  const linkPath = crmLeaveRequestAdminLinkPath(input.leaveRequestId);
  const { data: existing } = await admin
    .from("crm_notifications")
    .select("user_id")
    .eq("link_path", linkPath)
    .in(
      "user_id",
      admins.map((a) => a.id as string)
    );
  const alreadyNotified = new Set((existing ?? []).map((n) => n.user_id as string));
  const recipients = admins.filter((a) => !alreadyNotified.has(a.id as string));
  if (recipients.length === 0) return;

  const dateRangeLabel = formatLeaveDateRangeLabel(input.startDate, input.endDate);
  const title = `${input.agentName} submitted a leave request for ${dateRangeLabel}.`;

  const { error } = await admin.from("crm_notifications").insert(
    recipients.map((a) => ({
      user_id: a.id as string,
      title,
      body: input.isShortNotice ? "Short Notice: fewer than seven days' notice was given." : null,
      link_path: linkPath,
    }))
  );
  if (error) {
    console.error("[crm-leave] Failed to notify admins:", error);
  }
}

// Notifies the agent that their leave request was approved or declined.
// Same duplicate-notification guard as above, scoped to this one agent.
export async function notifyAgentOfCrmLeaveDecision(input: {
  leaveRequestId: string;
  agentId: string;
  startDate: string;
  endDate: string;
  status: "approved" | "declined";
  decisionNote?: string | null;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const linkPath = crmLeaveRequestAgentLinkPath(input.leaveRequestId);

  const { data: existing } = await admin
    .from("crm_notifications")
    .select("id")
    .eq("user_id", input.agentId)
    .eq("link_path", linkPath)
    .maybeSingle();
  if (existing) return;

  const dateRangeLabel = formatLeaveDateRangeLabel(input.startDate, input.endDate);
  const { error } = await admin.from("crm_notifications").insert({
    user_id: input.agentId,
    title: `Your leave request for ${dateRangeLabel} was ${input.status}.`,
    body: input.decisionNote ?? null,
    link_path: linkPath,
  });
  if (error) {
    console.error("[crm-leave] Failed to notify agent of decision:", error);
  }
}
