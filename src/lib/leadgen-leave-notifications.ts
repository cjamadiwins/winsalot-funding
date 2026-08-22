import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { getResendClient } from "./resend";
import { getLeadgenReplyToEmail, getLeadgenSenderEmail, textToSimpleHtml } from "./leadgen-email";
import { getSiteUrl } from "./site-url";
import type { LeaveRequestAuditAction } from "./leave-requests";

// Audit trail + notifications for the Lead Generation CRM's Leave
// Requests feature (leadgen_leave_requests / leadgen_leave_request_audit_log,
// migration 0070). Unlike the Cleaning CRM, this CRM has no in-app
// notification table (crm_notifications is cleaning-CRM-only) - every
// existing leadgen notification is outbound email (see
// leadgen-appointment-notifications.ts), so leave-request notifications
// follow that same pattern. Sent directly via Resend rather than through
// sendLeadgenEmail/leadgen_emails - that table and its bounce/tracking
// machinery exist for client- and lead-attributed emails, and an
// internal HR notification has no client_id or lead_id to attach to.

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

export async function notifyAdminsOfNewLeadgenLeaveRequest(input: {
  agentName: string;
  isShortNotice: boolean;
}): Promise<void> {
  const adminEmail = process.env.LEADGEN_ADMIN_NOTIFICATION_EMAIL || "info@winsalotcorp.com";
  const crmLink = `${getSiteUrl()}/leadgen/admin/leave-requests`;
  const subject = input.isShortNotice
    ? `Short Notice: Leave request from ${input.agentName}`
    : `New leave request from ${input.agentName}`;
  const body = [
    `${input.agentName} submitted a new leave request.`,
    input.isShortNotice ? "This is Planned Leave submitted with fewer than seven days' notice." : "",
    "",
    `Review it here: ${crmLink}`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendPlainEmail(adminEmail, subject, body);
}

export async function notifyAgentOfLeadgenLeaveDecision(input: {
  agentEmail: string;
  agentName: string;
  status: "approved" | "declined";
}): Promise<void> {
  const crmLink = `${getSiteUrl()}/leadgen/agent/leave-requests`;
  const subject = input.status === "approved" ? "Your leave request was approved" : "Your leave request was declined";
  const body = [
    `Hi ${input.agentName},`,
    "",
    input.status === "approved"
      ? "Your leave request has been approved."
      : "Your leave request has been declined.",
    "",
    `View it here: ${crmLink}`,
  ].join("\n");

  await sendPlainEmail(input.agentEmail, subject, body);
}
