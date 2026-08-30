import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { sendLeadgenEmail, leadgenButtonHtml, textToSimpleHtml } from "./leadgen-email";
import { CLIENT_PORTAL_URL, LEADGEN_PRODUCTION_ORIGIN } from "./client-portal-shared";

export type PortalEmailKind = "invite" | "reset";

const PORTAL_SETUP_PATH = "/client/setup";
const PORTAL_RESET_PATH = "/client/reset-password";

function buildBrandedCallbackUrl(hashedToken: string, nextPath: string): string {
  const url = new URL("/client/auth/callback", LEADGEN_PRODUCTION_ORIGIN);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", nextPath);
  return url.toString();
}

function buildPortalEmailCopy(
  kind: PortalEmailKind,
  clientName: string,
  actionUrl: string
): { subject: string; body: string; html: string } {
  if (kind === "invite") {
    const intro = [
      `Hi ${clientName} team,`,
      "",
      "Your Winsalot Client Portal is ready. You can securely view your campaign leads, appointments, reports, progress, client-visible notes, and feedback.",
      "",
      "Use the link below to choose your password and finish setting up your portal.",
    ].join("\n");
    const closing = [
      `After setup, sign in any time at ${CLIENT_PORTAL_URL}.`,
      "",
      "If you have any questions, reply to this email.",
      "",
      "Best,",
      "Winsalot Corp",
    ].join("\n");
    return {
      subject: "Your Winsalot Client Portal is ready",
      body: `${intro}\n\nSET UP MY CLIENT PORTAL\n${actionUrl}\n\n${closing}`,
      html: `${textToSimpleHtml(intro)}${leadgenButtonHtml(actionUrl, "SET UP MY CLIENT PORTAL")}${textToSimpleHtml(closing)}`,
    };
  }

  const intro = [
    `Hi ${clientName} team,`,
    "",
    "A password reset was requested for your Winsalot Client Portal.",
    "",
    "Use the secure link below to choose a new password.",
  ].join("\n");
  const closing = [
    `After resetting your password, sign in at ${CLIENT_PORTAL_URL}.`,
    "",
    "If you did not request this, please contact Winsalot Corp.",
    "",
    "Best,",
    "Winsalot Corp",
  ].join("\n");
  return {
    subject: "Reset your Winsalot Client Portal access",
    body: `${intro}\n\nRESET MY CLIENT PORTAL PASSWORD\n${actionUrl}\n\n${closing}`,
    html: `${textToSimpleHtml(intro)}${leadgenButtonHtml(actionUrl, "RESET MY CLIENT PORTAL PASSWORD")}${textToSimpleHtml(closing)}`,
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

// Supabase remains an implementation detail. generateLink() is used only
// to mint a one-time recovery token. The raw Supabase action_link is never
// placed in an email. Instead, the token hash is wrapped in our own
// leads.winsalotcorp.com callback URL, where the session is verified and
// established server-side before continuing to /client/setup or
// /client/reset-password.
export async function sendPortalEmail(input: SendPortalEmailInput): Promise<SendPortalEmailResult> {
  const admin = getSupabaseAdmin();
  const nextPath = input.kind === "invite" ? PORTAL_SETUP_PATH : PORTAL_RESET_PATH;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: input.toEmail,
    options: { redirectTo: `${LEADGEN_PRODUCTION_ORIGIN}/client/auth/callback` },
  });

  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    return { error: linkError?.message ?? "Failed to generate a secure portal access link." };
  }

  const actionUrl = buildBrandedCallbackUrl(hashedToken, nextPath);
  const { subject, body, html } = buildPortalEmailCopy(input.kind, input.clientName, actionUrl);

  const result = await sendLeadgenEmail(admin, {
    clientId: input.leadgenClientId,
    campaignId: null,
    templateKey: null,
    toEmail: input.toEmail,
    toName: input.toName,
    subject,
    body,
    text: body,
    html,
    sentBy: null,
    clientVisible: true,
  });

  if (result.error) return { error: result.error };
  return {};
}
