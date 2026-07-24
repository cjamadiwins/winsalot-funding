import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CrmUserRow, EmailType } from "./crm-types";

type SendTrackedCrmEmailInput = {
  leadId: string;
  crmUser: CrmUserRow;
  emailType: EmailType;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
  buildText: (name: string) => string;
  buildHtml: (name: string) => string;
  activityNotePrefix: string;
  noEmailMessage: string;
};

// Shared by every CRM-side email an agent/admin can send to a lead (the
// quote request email and the follow-up email, both from
// /admin/crm/leads/[id] and /agent/leads/[id]) so sending, activity
// logging, and Resend delivery tracking stay identical no matter which
// one it is or who sends it. Callers must already have run
// requireCrmAdmin()/requireCrmUser() themselves - this relies on the
// session-scoped Supabase client (RLS) to keep an agent scoped to their
// own leads, same as sendQuoteRequestEmailForLead always has.
export async function sendTrackedCrmEmail(
  supabase: SupabaseClient,
  input: SendTrackedCrmEmailInput
): Promise<{ email: string }> {
  const { data: lead, error: fetchError } = await supabase
    .from("crm_leads")
    .select("email, contact_name, business_name")
    .eq("id", input.leadId)
    .maybeSingle();

  if (fetchError || !lead) {
    throw new Error("Lead not found.");
  }
  if (!lead.email) {
    throw new Error(input.noEmailMessage);
  }

  const name = lead.contact_name || lead.business_name;
  const resend = getResendClient();
  const { data: sendResult, error: emailError } = await resend.emails.send({
    from: input.fromEmail,
    to: lead.email,
    replyTo: input.replyToEmail,
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
      lead_id: input.leadId,
      agent_id: input.crmUser.id,
      activity_type: "email",
      notes: `${input.activityNotePrefix} sent to ${lead.email} by ${senderName}.`,
    })
    .select("id")
    .single();

  if (activityError) {
    throw new Error("The email was sent, but recording it in the activity history failed.");
  }

  // crm_lead_emails has no RLS policies of its own (service-role only -
  // see migration 0022) since it's internal Resend delivery-tracking
  // bookkeeping, not something agents query directly; what an agent
  // actually sees (the activity entry above, and the lead's last_email_*
  // columns below) both go through the normal session-scoped client and
  // its existing RLS.
  const admin = getSupabaseAdmin();
  const { error: trackingError } = await admin.from("crm_lead_emails").insert({
    lead_id: input.leadId,
    agent_id: input.crmUser.id,
    activity_id: activity?.id ?? null,
    resend_email_id: sendResult.id,
    email_type: input.emailType,
    to_email: lead.email,
    subject: input.subject,
    status: "sent",
    status_at: sentAt,
    sent_at: sentAt,
  });

  if (trackingError) {
    throw new Error("The email was sent, but delivery tracking could not be recorded.");
  }

  const { error: leadUpdateError } = await supabase
    .from("crm_leads")
    .update({
      last_email_status: "sent",
      last_email_status_at: sentAt,
      last_email_type: input.emailType,
      last_email_to: lead.email,
    })
    .eq("id", input.leadId);

  if (leadUpdateError) {
    throw new Error("The email was sent, but updating the lead's email status failed.");
  }

  return { email: lead.email };
}
