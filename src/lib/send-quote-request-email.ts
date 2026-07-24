import "server-only";
import { createSupabaseServerClient } from "./supabase-server";
import { buildQuoteRequestEmailHtml, buildQuoteRequestEmailText } from "./quote-request-email";
import { sendTrackedCrmEmail } from "./send-crm-email";
import type { CrmUserRow } from "./crm-types";

// Shared by both the admin (/admin/crm/leads/[id]) and agent
// (/agent/leads/[id]) "Send Quote Request Email" actions so the email and
// activity-log entry are identical regardless of who sends it. Callers
// must already have run requireCrmAdmin()/requireCrmUser() themselves —
// this function doesn't re-check role, it relies on the session-scoped
// Supabase client plus RLS (crm_leads_agent_select_own,
// crm_activities_agent_insert_own_lead) to keep an agent scoped to their
// own leads exactly like every other agent action in this CRM.
export async function sendQuoteRequestEmailForLead(
  leadId: string,
  crmUser: CrmUserRow
): Promise<{ email: string }> {
  const supabase = await createSupabaseServerClient();

  // Dedicated override (falling back to the general EMAIL_FROM, then a
  // hardcoded default) so this customer-facing email always reads as
  // Winsalot Corp's own address out of the box, the same layering used
  // for the customer-facing quote email in send-quote-to-customer.
  const fromEmail =
    process.env.QUOTE_REQUEST_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    "Winsalot Corp <info@winsalotcorp.com>";
  const replyToEmail = process.env.EMAIL_REPLY_TO || "info@winsalotcorp.com";

  return sendTrackedCrmEmail(supabase, {
    leadId,
    crmUser,
    emailType: "quote_request",
    fromEmail,
    replyToEmail,
    subject: "Request Your Free Cleaning Quote",
    buildText: buildQuoteRequestEmailText,
    buildHtml: buildQuoteRequestEmailHtml,
    activityNotePrefix: "Quote request email",
    noEmailMessage:
      "This lead has no email address on file — the quote request email can't be sent.",
  });
}
