import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { sendLeadgenEmail } from "./leadgen-email";
import { CLIENT_PORTAL_URL, LEADGEN_PRODUCTION_ORIGIN } from "./client-portal-shared";

export type PortalEmailKind = "invite" | "reset";

function buildPortalEmailCopy(kind: PortalEmailKind, clientName: string, actionUrl: string): { subject: string; body: string } {
  if (kind === "invite") {
    return {
      subject: "Your Winsalot Client Portal is ready",
      body: [
        `Hi ${clientName} team,`,
        "",
        "Your Winsalot Client Portal is ready. You can now securely view your campaign leads, appointments, and progress online.",
        "",
        "Use the secure link below to set up your account and choose a password:",
        actionUrl,
        "",
        `Once your account is set up, you can sign in any time at ${CLIENT_PORTAL_URL}.`,
        "",
        "If you have any questions, just reply to this email.",
        "",
        "Best,",
        "Winsalot Corp",
      ].join("\n"),
    };
  }
  return {
    subject: "Reset your Winsalot Client Portal access",
    body: [
      `Hi ${clientName} team,`,
      "",
      "Use the secure link below to set a new password for your Winsalot Client Portal account:",
      actionUrl,
      "",
      `You can sign in afterward at ${CLIENT_PORTAL_URL}.`,
      "",
      "If you did not request this, please contact Winsalot Corp.",
      "",
      "Best,",
      "Winsalot Corp",
    ].join("\n"),
  };
}

export type SendPortalEmailInput = {
  kind: PortalEmailKind;
  leadgenClientId: string;
  clientName: string;
  toEmail: string;
  toName: string | null;
};

export type SendPortalEmailResult = { error?: string };

// Generates a fresh, single-use Supabase Auth "recovery" link (works
// identically for an already-created-but-unconfirmed user, unlike
// admin.auth.admin.inviteUserByEmail, which errors if the auth user
// already exists - this Growth CRM flow always creates the auth user up
// front, silently, in createPortalAccessAction) and sends it through the
// Lead Gen CRM's own tracked email pipeline (leadgen_emails, client-
// visible) rather than Supabase's own default-branded template, so the
// client also sees this message in their Communications view and it gets
// the same Resend delivery-status tracking as every other client email.
//
// redirectTo is deliberately built from LEADGEN_PRODUCTION_ORIGIN, not
// getAuthRedirectBaseUrl() - this function is called from a Growth CRM
// Server Action (src/app/admin/.../portal-actions.ts), which always
// executes inside the winsalot-funding Vercel project. getAuthRedirectBaseUrl()
// would resolve to that project's own site URL (growth.winsalotcorp.com),
// producing a link that sends the client into the Growth CRM instead of
// the Client Portal - the redirect must always point at the Lead Gen CRM
// deployment regardless of which CRM's server generated the link.
export async function sendPortalEmail(input: SendPortalEmailInput): Promise<SendPortalEmailResult> {
  const admin = getSupabaseAdmin();

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: input.toEmail,
    options: { redirectTo: `${LEADGEN_PRODUCTION_ORIGIN}/leadgen/set-password` },
  });

  const actionLink = linkData?.properties?.action_link;
  if (linkError || !actionLink) {
    return { error: linkError?.message ?? "Failed to generate a secure portal access link." };
  }

  const { subject, body } = buildPortalEmailCopy(input.kind, input.clientName, actionLink);

  const result = await sendLeadgenEmail(admin, {
    clientId: input.leadgenClientId,
    campaignId: null,
    // leadgen_emails.template_key is a foreign key into
    // leadgen_email_templates(key), not a free-text label - it must be
    // null unless a matching admin-editable template row actually exists
    // (see the consultation_information/consultation_invitation/
    // consultation_follow_up/mantra_collab_intro sends in the leadgen
    // lead-detail actions). The portal invite/reset email has no such
    // template - passing a made-up key here violated that FK constraint
    // on every insert, which is exactly what "Failed to save the email
    // record." was reporting. null matches how every other system-
    // generated, non-template email in this CRM already sends (see
    // leadgen-appointment-notifications.ts, leadgen-appointment-emails.ts,
    // leadgen-appointment-reminders.ts, leadgen-business-appointment-
    // reminders.ts).
    templateKey: null,
    toEmail: input.toEmail,
    toName: input.toName,
    subject,
    body,
    sentBy: null,
    clientVisible: true,
  });

  if (result.error) return { error: result.error };
  return {};
}
