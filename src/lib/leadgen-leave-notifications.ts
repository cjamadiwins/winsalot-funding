import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { getResendClient } from "./resend";
import { getLeadgenReplyToEmail, getLeadgenSenderEmail, textToSimpleHtml } from "./leadgen-email";
import { getSiteUrl } from "./site-url";
import { formatLeaveDateRangeLabel, type LeaveRequestAuditAction } from "./leave-requests";

// Audit trail + notifications for the Lead Generation CRM's Leave
// Requests feature (leadgen_leave_requests / leadgen_leave_request_audit_log,
// migration 0070). This CRM now has its own in-app notification table
// (leadgen_notifications, migration 0071), mirroring the Cleaning CRM's
// crm_notifications - written here alongside the pre-existing outbound
// email (see leadgen-appointment-notifications.ts for that pattern),
// not instead of it, so nothing already relying on the email goes away.

async function sendPlainEmail(to: string, subject: string, body: string): Promise<void> {
  try {
    const resend = getResendClient();
    await resend.emails.send({
      from: getLeadgenSenderEmail(),
      to,
      replyTo: getLeadgenReplyToEmail(),
      subject,
      text: body,
      html: textToSimpleHtml(body),
    });
  } catch (error) {
    console.error("[leadgen-leave] Failed to send email:", error);
  }
}

export async function recordLeadgenLeaveAudit(params: {
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
  const { error } = await admin.from("leadgen_leave_request_audit_log").insert({
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
    console.error("[leadgen-leave] Failed to record audit row:", error);
  }
}

function leadgenLeaveRequestAdminLinkPath(leaveRequestId: string): string {
  return `/leadgen/admin/leave-requests?highlight=${leaveRequestId}`;
}

function leadgenLeaveRequestAgentLinkPath(leaveRequestId: string): string {
  return `/leadgen/agent/leave-requests?highlight=${leaveRequestId}`;
}

// Notifies every active admin (in-app + email) that an agent submitted a
// new leave request. The in-app half guards against duplicate
// notifications for the same request (e.g. a retried Server Action
// call) by checking, per recipient, whether a notification linking to
// this exact request already exists before inserting.
export async function notifyAdminsOfNewLeadgenLeaveRequest(input: {
  leaveRequestId: string;
  agentName: string;
  startDate: string;
  endDate: string;
  isShortNotice: boolean;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const dateRangeLabel = formatLeaveDateRangeLabel(input.startDate, input.endDate);

  const { data: admins, error: adminsError } = await admin
    .from("leadgen_users")
    .select("id")
    .eq("role", "admin")
    .eq("active", true);

  if (adminsError) {
    console.error("[leadgen-leave] Failed to load admins to notify:", adminsError);
  } else if (admins && admins.length > 0) {
    const linkPath = leadgenLeaveRequestAdminLinkPath(input.leaveRequestId);
    const { data: existing } = await admin
      .from("leadgen_notifications")
      .select("user_id")
      .eq("link_path", linkPath)
      .in(
        "user_id",
        admins.map((a) => a.id as string)
      );
    const alreadyNotified = new Set((existing ?? []).map((n) => n.user_id as string));
    const recipients = admins.filter((a) => !alreadyNotified.has(a.id as string));

    if (recipients.length > 0) {
      const title = `${input.agentName} submitted a leave request for ${dateRangeLabel}.`;
      const { error } = await admin.from("leadgen_notifications").insert(
        recipients.map((a) => ({
          user_id: a.id as string,
          title,
          body: input.isShortNotice ? "Short Notice: fewer than seven days' notice was given." : null,
          link_path: linkPath,
        }))
      );
      if (error) console.error("[leadgen-leave] Failed to notify admins in-app:", error);
    }
  }

  const adminEmail = process.env.LEADGEN_ADMIN_NOTIFICATION_EMAIL || "info@winsalotcorp.com";
  const crmLink = `${getSiteUrl()}${leadgenLeaveRequestAdminLinkPath(input.leaveRequestId)}`;
  const subject = input.isShortNotice
    ? `Short Notice: Leave request from ${input.agentName}`
    : `New leave request from ${input.agentName}`;
  const body = [
    `${input.agentName} submitted a leave request for ${dateRangeLabel}.`,
    input.isShortNotice ? "This is Planned Leave submitted with fewer than seven days' notice." : "",
    "",
    `Review it here: ${crmLink}`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendPlainEmail(adminEmail, subject, body);
}

// Notifies the agent (in-app + email) that their leave request was
// approved or declined. Same duplicate-notification guard as above,
// scoped to this one agent.
export async function notifyAgentOfLeadgenLeaveDecision(input: {
  leaveRequestId: string;
  agentId: string;
  agentEmail: string;
  agentName: string;
  startDate: string;
  endDate: string;
  status: "approved" | "declined";
  decisionNote?: string | null;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const dateRangeLabel = formatLeaveDateRangeLabel(input.startDate, input.endDate);
  const linkPath = leadgenLeaveRequestAgentLinkPath(input.leaveRequestId);

  const { data: existing } = await admin
    .from("leadgen_notifications")
    .select("id")
    .eq("user_id", input.agentId)
    .eq("link_path", linkPath)
    .maybeSingle();

  if (!existing) {
    const { error } = await admin.from("leadgen_notifications").insert({
      user_id: input.agentId,
      title: `Your leave request for ${dateRangeLabel} was ${input.status}.`,
      body: input.decisionNote ?? null,
      link_path: linkPath,
    });
    if (error) console.error("[leadgen-leave] Failed to notify agent of decision in-app:", error);
  }

  const crmLink = `${getSiteUrl()}${linkPath}`;
  const subject = input.status === "approved" ? "Your leave request was approved" : "Your leave request was declined";
  const body = [
    `Hi ${input.agentName},`,
    "",
    `Your leave request for ${dateRangeLabel} was ${input.status}.`,
    input.decisionNote ? `Note from the admin: ${input.decisionNote}` : "",
    "",
    `View it here: ${crmLink}`,
  ]
    .filter(Boolean)
    .join("\n");

  if (input.agentEmail) {
    await sendPlainEmail(input.agentEmail, subject, body);
  }
}
