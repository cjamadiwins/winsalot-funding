import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { getEmailReplyTo, senderForOpportunityType } from "./email-senders";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmUserRow, EmailType } from "./crm-types";

type SendTrackedCrmEmailInput = {
  opportunityId: string;
  crmUser: CrmUserRow;
  emailType: EmailType;
  subject: string;
  buildText: (name: string) => string;
  buildHtml: (name: string) => string;
  activityNotePrefix: string;
  noEmailMessage: string;
};

// Shared by every CRM-side email an agent/admin can send from an
// opportunity's page (currently just the follow-up email, from
// /admin/crm/opportunities/[id] and /agent/opportunities/[id]) so
// sending, activity logging, and Resend delivery tracking stay identical
// no matter who sends it. Callers must already have run
// requireCrmAdmin()/requireCrmUser() themselves - this relies on the
// session-scoped Supabase client (RLS) to keep an agent scoped to their
// own opportunities.
export async function sendTrackedCrmEmail(
  supabase: SupabaseClient,
  input: SendTrackedCrmEmailInput
): Promise<{ email: string }> {
  const { data: opportunity, error: fetchError } = await supabase
    .from("crm_opportunities")
    .select("email, contact_name, business_name, opportunity_type")
    .eq("id", input.opportunityId)
    .maybeSingle();

  if (fetchError || !opportunity) {
    throw new Error("Opportunity not found.");
  }
  if (!opportunity.email) {
    throw new Error(input.noEmailMessage);
  }

  const name = opportunity.contact_name || opportunity.business_name;
  const resend = getResendClient();
  const { data: sendResult, error: emailError } = await resend.emails.send({
    from: senderForOpportunityType(opportunity.opportunity_type),
    to: opportunity.email,
    replyTo: getEmailReplyTo(),
    subject: input.subject,
    text: input.buildText(name),
    html: input.buildHtml(name),
  });

  if (emailError || !sendResult) {
    throw new Error(`Failed to send the email: ${emailError?.message ?? "Unknown Resend error."}`);
  }

  const senderName = input.crmUser.full_name || input.crmUser.email;
  const sentAt = new Date().toISOString();

  const { data: activity, error: activityError } = await supabase
    .from("crm_activities")
    .insert({
      opportunity_id: input.opportunityId,
      agent_id: input.crmUser.id,
      activity_type: "email",
      notes: `${input.activityNotePrefix} sent to ${opportunity.email} by ${senderName}.`,
    })
    .select("id")
    .single();

  if (activityError) {
    throw new Error("The email was sent, but recording it in the activity history failed.");
  }

  // crm_lead_emails has no RLS policies of its own (service-role only -
  // see migration 0022) since it's internal Resend delivery-tracking
  // bookkeeping, not something agents query directly; what an agent
  // actually sees (the activity entry above, and the opportunity's
  // last_email_* columns below) both go through the normal session-scoped
  // client and its existing RLS.
  const admin = getSupabaseAdmin();
  const { error: trackingError } = await admin.from("crm_lead_emails").insert({
    opportunity_id: input.opportunityId,
    agent_id: input.crmUser.id,
    activity_id: activity?.id ?? null,
    resend_email_id: sendResult.id,
    email_type: input.emailType,
    to_email: opportunity.email,
    subject: input.subject,
    status: "sent",
    status_at: sentAt,
    sent_at: sentAt,
  });

  if (trackingError) {
    throw new Error("The email was sent, but delivery tracking could not be recorded.");
  }

  const { error: opportunityUpdateError } = await supabase
    .from("crm_opportunities")
    .update({
      last_email_status: "sent",
      last_email_status_at: sentAt,
      last_email_type: input.emailType,
      last_email_to: opportunity.email,
    })
    .eq("id", input.opportunityId);

  if (opportunityUpdateError) {
    throw new Error("The email was sent, but updating the opportunity's email status failed.");
  }

  return { email: opportunity.email };
}
