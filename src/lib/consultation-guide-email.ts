import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { getEmailSender, getEmailReplyTo } from "./email-senders";
import { getSiteUrl } from "./site-url";
import { buildWinsalotFollowUpEmail, buildWinsalotBusinessFinanceFollowUpEmail, type WinsalotEmailBody } from "./winsalot-consultation-emails";
import { ARRANGEMENT_TYPE_LABELS, type ArrangementType } from "./commercial-arrangement";
import type { ConsultationGuideService, CrmConsultationGuideRow } from "./consultation-guide";

// Growth CRM Client Consultation Guide - service-specific completion
// follow-up email. Mirrors winsalot-consultation-completion.ts's role for
// the appointment-based flow, but for crm_consultation_guides, which can
// be completed with or without a linked appointment/opportunity at all.

export type ConsultationGuideEmailConsultant = { name: string; email: string; userId?: string };

// Appended only for a non-Standard-Monthly arrangement (Performance-Based
// Trial or Custom Arrangement) - never modifies buildWinsalotFollowUpEmail/
// buildWinsalotBusinessFinanceFollowUpEmail themselves (both explicitly
// "do not change wording or functionality" elsewhere), so every other
// caller of those two functions - the original appointment-completion
// flow included - is completely unaffected. This is what keeps a
// Performance-Based Trial client from receiving an email that's silent
// about (and so could be read as implicitly promising) the standard
// upfront-monthly arrangement: it states the actual agreed trigger and
// explicitly does not promise a conversion will happen.
function appendArrangementNote(email: WinsalotEmailBody, arrangement: { type: ArrangementType; paymentTrigger: string | null } | null): WinsalotEmailBody {
  if (!arrangement || arrangement.type === "standard_monthly") return email;

  const arrangementLabel = ARRANGEMENT_TYPE_LABELS[arrangement.type].toLowerCase();
  const triggerLine = arrangement.paymentTrigger
    ? `As discussed, this campaign is structured under a ${arrangementLabel} arrangement: our service fee becomes due when ${arrangement.paymentTrigger.charAt(0).toLowerCase()}${arrangement.paymentTrigger.slice(1)}`
    : `As discussed, this campaign is structured under a ${arrangementLabel} arrangement, as agreed during our consultation.`;
  const disclaimerLine =
    "Winsalot Corp. generates and qualifies opportunities for your business - we do not guarantee that a prospect will purchase or become a paying client.";

  return {
    subject: email.subject,
    text: `${email.text}\n\n${triggerLine}\n\n${disclaimerLine}`,
    html: `${email.html}<p style="margin:16px 0 0;">${triggerLine}</p><p style="margin:8px 0 0;">${disclaimerLine}</p>`,
  };
}

// Builds the exact email a guide's follow-up would send for a given
// service - shared by the completion-confirmation preview and the real
// send/retry paths below, so "preview" can never show something
// different from what "send" actually sends.
export function buildConsultationGuideFollowUpEmail(
  service: ConsultationGuideService,
  params: { contactName: string; consultantName: string },
  arrangement?: { type: ArrangementType; paymentTrigger: string | null } | null
): WinsalotEmailBody {
  if (service === "business_financing") {
    return appendArrangementNote(
      buildWinsalotBusinessFinanceFollowUpEmail({ contactName: params.contactName, consultantName: params.consultantName }),
      arrangement ?? null
    );
  }
  // Lead Generation reuses the existing appointment-completion email
  // unchanged - "Do not change its current wording or functionality." -
  // appendArrangementNote only ever adds text after it, never edits it.
  return appendArrangementNote(
    buildWinsalotFollowUpEmail({ contactName: params.contactName, continueUrl: `${getSiteUrl()}/continue-with-winsalot` }),
    arrangement ?? null
  );
}

export type ConsultationGuideEmailSendResult =
  | { status: "sent"; resendEmailId: string; crmLeadEmailId: string | null }
  | { status: "failed"; error: string };

// Sends and tracks the consultation-completion follow-up email for one
// guide. Called at most once automatically (from the guarded status
// transition in completeConsultationGuideAction) and again, deliberately,
// by the admin-only "Retry Follow-Up Email" action for a guide whose
// prior attempt failed. Never throws - a send failure is recorded on the
// guide row and returned, but the guide's own 'completed' status is never
// touched here: the consultation happened and was marked complete by a
// real admin action, independent of whether Resend/the network
// cooperated.
export async function sendConsultationGuideFollowUpEmail(
  admin: SupabaseClient,
  guide: Pick<
    CrmConsultationGuideRow,
    "id" | "opportunity_id" | "contact_name" | "business_name" | "email" | "consultant_name" | "service" | "arrangement_type" | "arrangement_payment_trigger"
  >,
  consultant: ConsultationGuideEmailConsultant
): Promise<ConsultationGuideEmailSendResult> {
  const service = guide.service;
  if (!service) return { status: "failed", error: "No service selected." };
  if (!guide.email) return { status: "failed", error: "No recipient email." };

  await admin.from("crm_consultation_guides").update({ follow_up_email_status: "sending" }).eq("id", guide.id);

  const email = buildConsultationGuideFollowUpEmail(
    service,
    { contactName: guide.contact_name || "there", consultantName: guide.consultant_name || consultant.name },
    { type: guide.arrangement_type, paymentTrigger: guide.arrangement_payment_trigger }
  );

  try {
    const resend = getResendClient();
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: getEmailSender(service === "business_financing" ? "funding" : "growth"),
      to: guide.email,
      replyTo: getEmailReplyTo(),
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    if (sendError || !sendResult) {
      const errorDetail = sendError?.message ?? "Unknown Resend error.";
      await admin.from("crm_consultation_guides").update({ follow_up_email_status: "failed", follow_up_email_error: errorDetail }).eq("id", guide.id);
      return { status: "failed", error: errorDetail };
    }

    const sentAt = new Date().toISOString();
    let crmLeadEmailId: string | null = null;

    // crm_lead_emails enforces "exactly one of lead_id/opportunity_id/
    // provider_lead_id" (migration 0085) - a guide logged without a
    // linked opportunity has nothing to satisfy that with, so it has no
    // crm_lead_emails row at all; the guide's own follow_up_email_*
    // columns below are the source of truth either way.
    if (guide.opportunity_id) {
      const emailType = service === "business_financing" ? "business_finance_follow_up" : "consultation_follow_up";
      const { data: tracked } = await admin
        .from("crm_lead_emails")
        .insert({
          opportunity_id: guide.opportunity_id,
          resend_email_id: sendResult.id,
          email_type: emailType,
          to_email: guide.email,
          subject: email.subject,
          status: "sent",
          status_at: sentAt,
          sent_at: sentAt,
        })
        .select("id")
        .maybeSingle();
      crmLeadEmailId = (tracked?.id as string | undefined) ?? null;

      await admin.from("crm_activities").insert({
        opportunity_id: guide.opportunity_id,
        agent_id: null,
        activity_type: "email",
        notes: `Consultation follow-up email (${service === "business_financing" ? "Business Finance" : "Lead Generation"}) sent to ${guide.email} by ${consultant.name}.`,
        occurred_at: sentAt,
      });
    }

    await admin
      .from("crm_consultation_guides")
      .update({
        follow_up_email_status: "sent",
        follow_up_email_sent_at: sentAt,
        follow_up_email_service: service,
        follow_up_email_error: null,
        follow_up_crm_lead_email_id: crmLeadEmailId,
        no_follow_up_email_reason: null,
      })
      .eq("id", guide.id);

    return { status: "sent", resendEmailId: sendResult.id, crmLeadEmailId };
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : "Unknown error sending follow-up email.";
    await admin.from("crm_consultation_guides").update({ follow_up_email_status: "failed", follow_up_email_error: errorDetail }).eq("id", guide.id);
    return { status: "failed", error: errorDetail };
  }
}

// A deliberate, admin-confirmed "Resend Follow-Up Email" of a guide whose
// original send already succeeded (see resendConsultationFollowUpEmailAction
// - never automatic, always a confirmed click). Sends the exact same
// template/recipient as the original via buildConsultationGuideFollowUpEmail,
// so it can never diverge from what was actually sent the first time, but
// - unlike sendConsultationGuideFollowUpEmail above - never touches
// follow_up_email_status/sent_at/service/error/follow_up_crm_lead_email_id:
// those columns must keep describing the *original* send exactly as CJ
// asked ("preserve the original recipient, template, send time and
// delivery status"). Only the separate follow_up_email_resend_count/
// last_resent_* columns change here.
export async function resendConsultationGuideFollowUpEmail(
  admin: SupabaseClient,
  guide: Pick<
    CrmConsultationGuideRow,
    | "id"
    | "opportunity_id"
    | "contact_name"
    | "business_name"
    | "email"
    | "consultant_name"
    | "service"
    | "follow_up_email_resend_count"
    | "arrangement_type"
    | "arrangement_payment_trigger"
  >,
  consultant: ConsultationGuideEmailConsultant
): Promise<ConsultationGuideEmailSendResult> {
  const service = guide.service;
  if (!service) return { status: "failed", error: "No service selected." };
  if (!guide.email) return { status: "failed", error: "No recipient email." };

  const email = buildConsultationGuideFollowUpEmail(
    service,
    { contactName: guide.contact_name || "there", consultantName: guide.consultant_name || consultant.name },
    { type: guide.arrangement_type, paymentTrigger: guide.arrangement_payment_trigger }
  );

  try {
    const resend = getResendClient();
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: getEmailSender(service === "business_financing" ? "funding" : "growth"),
      to: guide.email,
      replyTo: getEmailReplyTo(),
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    if (sendError || !sendResult) {
      const errorDetail = sendError?.message ?? "Unknown Resend error.";
      await admin.from("crm_consultation_guides").update({ follow_up_email_last_resend_error: errorDetail }).eq("id", guide.id);
      return { status: "failed", error: errorDetail };
    }

    const sentAt = new Date().toISOString();
    let crmLeadEmailId: string | null = null;

    if (guide.opportunity_id) {
      const emailType = service === "business_financing" ? "business_finance_follow_up" : "consultation_follow_up";
      const { data: tracked } = await admin
        .from("crm_lead_emails")
        .insert({
          opportunity_id: guide.opportunity_id,
          resend_email_id: sendResult.id,
          email_type: emailType,
          to_email: guide.email,
          subject: email.subject,
          status: "sent",
          status_at: sentAt,
          sent_at: sentAt,
        })
        .select("id")
        .maybeSingle();
      crmLeadEmailId = (tracked?.id as string | undefined) ?? null;

      await admin.from("crm_activities").insert({
        opportunity_id: guide.opportunity_id,
        agent_id: null,
        activity_type: "email",
        notes: `Consultation follow-up email (${service === "business_financing" ? "Business Finance" : "Lead Generation"}) resent to ${guide.email} by ${consultant.name}.`,
        occurred_at: sentAt,
      });
    }

    await admin
      .from("crm_consultation_guides")
      .update({
        follow_up_email_resend_count: (guide.follow_up_email_resend_count ?? 0) + 1,
        follow_up_email_last_resent_at: sentAt,
        follow_up_email_last_resent_by: consultant.userId ?? null,
        follow_up_email_last_resend_error: null,
      })
      .eq("id", guide.id);

    return { status: "sent", resendEmailId: sendResult.id, crmLeadEmailId };
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : "Unknown error resending follow-up email.";
    await admin.from("crm_consultation_guides").update({ follow_up_email_last_resend_error: errorDetail }).eq("id", guide.id);
    return { status: "failed", error: errorDetail };
  }
}
