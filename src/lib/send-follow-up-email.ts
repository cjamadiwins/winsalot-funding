import "server-only";
import { createSupabaseServerClient } from "./supabase-server";
import { buildFollowUpEmailHtml, buildFollowUpEmailText } from "./follow-up-email";
import { sendTrackedCrmEmail } from "./send-crm-email";
import type { CrmUserRow } from "./crm-types";

// Shared by both the admin (/admin/crm/leads/[id]) and agent
// (/agent/leads/[id]) "Send Follow-Up Email" actions, mirroring
// sendQuoteRequestEmailForLead — same tracking, same RLS-backed lead
// scoping, just a different template for a lead who hasn't responded to
// an earlier quote request yet.
export async function sendFollowUpEmailForLead(
  leadId: string,
  crmUser: CrmUserRow
): Promise<{ email: string }> {
  const supabase = await createSupabaseServerClient();

  // Falls back the same way the quote request email does, so a follow-up
  // also reads as Winsalot Corp's own address out of the box.
  const fromEmail =
    process.env.QUOTE_REQUEST_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    "Winsalot Corp <info@winsalotcorp.com>";
  const replyToEmail = process.env.EMAIL_REPLY_TO || "info@winsalotcorp.com";

  return sendTrackedCrmEmail(supabase, {
    leadId,
    crmUser,
    emailType: "follow_up",
    fromEmail,
    replyToEmail,
    subject: "Following Up on Your Cleaning Quote Request",
    buildText: buildFollowUpEmailText,
    buildHtml: buildFollowUpEmailHtml,
    activityNotePrefix: "Follow-up email",
    noEmailMessage: "This lead has no email address on file — the follow-up email can't be sent.",
  });
}
