import "server-only";
import { createSupabaseServerClient } from "./supabase-server";
import { getResendClient } from "./resend";
import { buildQuoteRequestEmailHtml, buildQuoteRequestEmailText } from "./quote-request-email";
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

  const { data: lead, error: fetchError } = await supabase
    .from("crm_leads")
    .select("email, contact_name, business_name")
    .eq("id", leadId)
    .maybeSingle();

  if (fetchError || !lead) {
    throw new Error("Lead not found.");
  }
  if (!lead.email) {
    throw new Error(
      "This lead has no email address on file — the quote request email can't be sent."
    );
  }

  // Dedicated override (falling back to the general EMAIL_FROM, then a
  // hardcoded default) so this customer-facing email always reads as
  // Winsalot Corp's own address out of the box, the same layering used
  // for the customer-facing quote email in send-quote-to-customer.
  const fromEmail =
    process.env.QUOTE_REQUEST_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    "Winsalot Corp <info@winsalotcorp.com>";
  const replyToEmail = process.env.EMAIL_REPLY_TO || "info@winsalotcorp.com";

  const resend = getResendClient();
  const { error: emailError } = await resend.emails.send({
    from: fromEmail,
    to: lead.email,
    replyTo: replyToEmail,
    subject: "Request Your Free Cleaning Quote",
    text: buildQuoteRequestEmailText(lead.contact_name || lead.business_name),
    html: buildQuoteRequestEmailHtml(lead.contact_name || lead.business_name),
  });

  if (emailError) {
    throw new Error(
      `Failed to send the quote request email: ${emailError.message ?? "Unknown Resend error."}`
    );
  }

  const senderName = crmUser.full_name || crmUser.email;
  const { error: activityError } = await supabase.from("crm_activities").insert({
    lead_id: leadId,
    agent_id: crmUser.id,
    activity_type: "email",
    notes: `Quote request email sent to ${lead.email} by ${senderName}.`,
  });

  if (activityError) {
    throw new Error("The email was sent, but recording it in the activity history failed.");
  }

  return { email: lead.email };
}
