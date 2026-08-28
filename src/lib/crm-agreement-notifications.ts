import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { signedAgreementNotificationTitle, intakeSubmittedNotificationTitle } from "./crm-agreement-types";

// In-app CRM notifications for Client Agreements / Client Intake -
// crm_notifications has no insert policy for any signed-in user (service
// -role only, migration 0027), so these always use the admin client, same
// rationale as notifyAdminsOfNewCrmLeaveRequest (crm-leave-notifications.ts).
// Every recipient is loaded from crm_users where role = 'admin', so an
// agent can never be a recipient of these - "do not display private
// agreement or intake notifications to agents" holds structurally, not
// just by convention, and crm_notifications' own RLS
// (user_id = auth.uid()) means an agent's session could not read another
// user's row even if it tried.

export function agreementAdminLinkPath(agreementId: string): string {
  return `/admin/crm/agreements/${agreementId}`;
}

export function intakeAdminLinkPath(intakeConfigId: string): string {
  return `/admin/crm/intake/${intakeConfigId}`;
}

async function activeAdminIds(): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const { data: admins, error } = await admin.from("crm_users").select("id").eq("role", "admin").eq("active", true);
  if (error) {
    console.error("[crm-agreement-notifications] Failed to load admins to notify:", error);
    return [];
  }
  return (admins ?? []).map((a) => a.id as string);
}

// Prevents duplicate notifications for the same submission/signature: a
// link_path is unique per record, so once any admin has a notification
// pointing at it, that record is considered already notified and this
// silently no-ops - covers a retried server action as well as an
// explicit retry of a failed notification email (which never re-fires
// the in-app notification, only the email).
async function notifyAdminsOnce(linkPath: string, title: string, body: string | null): Promise<void> {
  const recipientIds = await activeAdminIds();
  if (recipientIds.length === 0) return;

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin.from("crm_notifications").select("user_id").eq("link_path", linkPath).in("user_id", recipientIds);
  const alreadyNotified = new Set((existing ?? []).map((n) => n.user_id as string));
  const recipients = recipientIds.filter((id) => !alreadyNotified.has(id));
  if (recipients.length === 0) return;

  const { error } = await admin.from("crm_notifications").insert(recipients.map((userId) => ({ user_id: userId, title, body, link_path: linkPath })));
  if (error) {
    console.error(`[crm-agreement-notifications] Failed to notify admins (${linkPath}):`, error);
  }
}

export async function notifyAdminsOfSignedAgreement(input: { agreementId: string; businessName: string; agreementNumber: string }): Promise<void> {
  await notifyAdminsOnce(agreementAdminLinkPath(input.agreementId), signedAgreementNotificationTitle(input.businessName, input.agreementNumber), null);
}

export async function notifyAdminsOfIntakeSubmission(input: { intakeConfigId: string; businessName: string }): Promise<void> {
  await notifyAdminsOnce(intakeAdminLinkPath(input.intakeConfigId), intakeSubmittedNotificationTitle(input.businessName), null);
}

// Failure notifications use their own link_path (a distinct suffix on
// the same detail page) so their own dedup check never collides with -
// or gets silently skipped because of - the always-fires "signed"/
// "submitted" notification's dedup key above. Both can legitimately
// exist for the same record: the in-app "signed" notification fires
// unconditionally, while this one only fires in addition, when the
// admin's own notification email specifically failed to send.
export async function notifyAdminsOfAgreementNotificationFailure(input: { agreementId: string; businessName: string; reason: string }): Promise<void> {
  await notifyAdminsOnce(
    `${agreementAdminLinkPath(input.agreementId)}?notify=failed`,
    `Failed to email admin notification for ${input.businessName}'s signed agreement.`,
    input.reason
  );
}

export async function notifyAdminsOfIntakeNotificationFailure(input: { intakeConfigId: string; businessName: string; reason: string }): Promise<void> {
  await notifyAdminsOnce(
    `${intakeAdminLinkPath(input.intakeConfigId)}?notify=failed`,
    `Failed to email admin notification for ${input.businessName}'s intake submission.`,
    input.reason
  );
}
