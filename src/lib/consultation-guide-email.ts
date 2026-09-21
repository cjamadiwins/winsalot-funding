import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { getEmailSender, getEmailReplyTo } from "./email-senders";
import { getSiteUrl } from "./site-url";
import { buildWinsalotFollowUpEmail, buildWinsalotBusinessFinanceFollowUpEmail, type WinsalotEmailBody } from "./winsalot-consultation-emails";
import { ARRANGEMENT_TYPE_LABELS, type ArrangementType } from "./commercial-arrangement";
import type { ConsultationGuideAnswers, ConsultationGuideService, CrmConsultationGuideRow } from "./consultation-guide";

// Growth CRM Client Consultation Guide - service-specific follow-up email.
// Mirrors winsalot-consultation-completion.ts's role for the appointment-
// based flow, but for crm_consultation_guides, which can be completed
// with or without a linked appointment/opportunity at all.
//
// Deliberately review-before-send, never automatic: completing a
// consultation only ever GENERATES a draft subject/body (saved on the
// guide row as follow_up_email_subject/follow_up_email_body) - nothing is
// sent until Admin explicitly clicks Send (or, for an already-sent guide,
// the separately-confirmed Resend). The saved draft, not a freshly
// recomputed template, is always what actually gets sent - so an edit
// Admin makes before clicking Send is exactly what the prospect receives.

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

// Builds the base service-specific email (subject/text/html) for a given
// service, with the arrangement note appended - the starting point for a
// guide's follow-up email DRAFT (see buildFollowUpEmailDraft below).
// Never sent directly; kept as its own function purely so the base
// template + arrangement composition stays independently testable/
// reusable, same as before this change.
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

// A short, factual recap of what was actually recorded in Section 8
// (Consultation Summary) - never invented, only ever lines the guide's
// own saved answers actually have a value for. This is what lets the
// generated draft "include...discussion summary, next steps" using the
// real consultation instead of a one-size-fits-all template.
function buildConsultationRecapLines(summary: ConsultationGuideAnswers | null | undefined): string[] {
  const answers = summary ?? {};
  const lines: string[] = [];
  if (answers.primary_need) lines.push(`As discussed, your primary need is: ${answers.primary_need}`);
  if (answers.next_step) lines.push(`Next step: ${answers.next_step}`);
  return lines;
}

export type FollowUpEmailDraft = { subject: string; body: string };

// Generates the initial follow-up email draft for a guide - called once,
// automatically, the moment a consultation is marked Completed (see
// completeConsultationGuideAction), and never again automatically after
// that. Nothing is sent here; this only computes the subject/body text
// that gets saved onto the guide row for Admin to review, edit, and
// eventually send. Safe to call again later too (e.g. to recompute a
// draft for a guide completed before this feature existed) since it's
// pure - same inputs, same output, never sends anything itself.
export function buildFollowUpEmailDraft(
  guide: Pick<CrmConsultationGuideRow, "service" | "contact_name" | "consultant_name" | "arrangement_type" | "arrangement_payment_trigger" | "summary">,
  consultantName: string
): FollowUpEmailDraft | null {
  const service = guide.service;
  if (!service) return null;

  const base = buildConsultationGuideFollowUpEmail(
    service,
    { contactName: guide.contact_name || "there", consultantName: guide.consultant_name || consultantName },
    { type: guide.arrangement_type, paymentTrigger: guide.arrangement_payment_trigger }
  );

  const recapLines = buildConsultationRecapLines(guide.summary);
  const body = recapLines.length > 0 ? `${base.text}\n\n${recapLines.join("\n")}` : base.text;

  return { subject: base.subject, body };
}

// Lazily backfills a draft for a completed guide that doesn't have one yet
// - e.g. one completed directly via a database migration before this
// review-before-send feature existed (the Web6 Solutions consultation is
// exactly this case). Called from the guide detail page on every view;
// a no-op once a draft exists (an Admin edit is never overwritten), and
// never sends anything itself.
export async function ensureFollowUpEmailDraft(
  supabase: SupabaseClient,
  guide: Pick<
    CrmConsultationGuideRow,
    "id" | "service" | "contact_name" | "consultant_name" | "arrangement_type" | "arrangement_payment_trigger" | "summary" | "follow_up_email_subject" | "follow_up_email_body"
  >,
  consultantName: string
): Promise<FollowUpEmailDraft | null> {
  if (guide.follow_up_email_subject && guide.follow_up_email_body) {
    return { subject: guide.follow_up_email_subject, body: guide.follow_up_email_body };
  }

  const draft = buildFollowUpEmailDraft(guide, consultantName);
  if (!draft) return null;

  await supabase
    .from("crm_consultation_guides")
    .update({ follow_up_email_subject: draft.subject, follow_up_email_body: draft.body })
    .eq("id", guide.id);

  return draft;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Renders the Admin-edited plain-text draft body into the HTML actually
// sent - a blank line starts a new paragraph, a single line break becomes
// <br>. Deliberately simple (no markdown, no rich formatting) since the
// draft is edited in a plain <textarea>, and escapes HTML-special
// characters so an edited draft can never inject markup into the sent
// email.
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 14px;white-space:pre-line;">${escapeHtml(paragraph)}</p>`)
    .join("");
}

export type ConsultationGuideEmailSendResult =
  | { status: "sent"; resendEmailId: string; crmLeadEmailId: string | null }
  | { status: "failed"; error: string };

// Sends the guide's currently-saved follow-up email draft (subject/body -
// whatever Admin last saved, via "Edit Email" or the auto-generated
// original) - never recomputed from the base template at send time, so
// what actually goes out always matches exactly what Admin reviewed.
// Only ever called from an explicit, manual admin click
// (sendConsultationFollowUpEmailAction) - never automatically, and never
// from completeConsultationGuideAction, which only generates the draft.
export async function sendConsultationGuideFollowUpEmail(
  admin: SupabaseClient,
  guide: Pick<
    CrmConsultationGuideRow,
    "id" | "opportunity_id" | "contact_name" | "business_name" | "email" | "consultant_name" | "service" | "follow_up_email_subject" | "follow_up_email_body"
  >,
  consultant: ConsultationGuideEmailConsultant
): Promise<ConsultationGuideEmailSendResult> {
  const service = guide.service;
  if (!service) return { status: "failed", error: "No service selected." };
  if (!guide.email) return { status: "failed", error: "No recipient email." };
  if (!guide.follow_up_email_subject || !guide.follow_up_email_body) {
    return { status: "failed", error: "No email draft has been generated for this consultation yet." };
  }

  // Atomic claim, guarding against a duplicate/concurrent send (a
  // double-click, or two admins/tabs open on the same guide) - only a
  // guide currently 'not_sent' or 'failed' can ever be claimed, and the
  // claim itself is the same compare-and-swap update .eq(...) row-count
  // pattern completeConsultationGuideAction already uses for its own
  // draft->completed transition. A second, near-simultaneous call sees
  // zero rows affected and bails out here, before either one ever calls
  // Resend - so this can never send two copies of the same email.
  const { data: claimed, error: claimError } = await admin
    .from("crm_consultation_guides")
    .update({ follow_up_email_status: "sending" })
    .eq("id", guide.id)
    .in("follow_up_email_status", ["not_sent", "failed"])
    .select("id")
    .maybeSingle();
  if (claimError) return { status: "failed", error: claimError.message };
  if (!claimed) return { status: "failed", error: "This follow-up email has already been sent or is currently sending." };

  const subject = guide.follow_up_email_subject;
  const text = guide.follow_up_email_body;
  const html = textToHtml(text);

  try {
    const resend = getResendClient();
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: getEmailSender(service === "business_financing" ? "funding" : "growth"),
      to: guide.email,
      replyTo: getEmailReplyTo(),
      subject,
      text,
      html,
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
          subject,
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
// - never automatic, always a confirmed click). Sends whatever is
// currently saved as the guide's draft (Admin may have edited it again
// since the original send - "so I can review it and manually send or
// resend it when I am ready"), but - unlike sendConsultationGuideFollowUpEmail
// above - never touches follow_up_email_status/sent_at/service/error/
// follow_up_crm_lead_email_id: those columns must keep describing the
// *original* send exactly as CJ asked ("preserve the original recipient,
// template, send time and delivery status"). Only the separate
// follow_up_email_resend_count/last_resent_* columns change here.
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
    | "follow_up_email_subject"
    | "follow_up_email_body"
  >,
  consultant: ConsultationGuideEmailConsultant
): Promise<ConsultationGuideEmailSendResult> {
  const service = guide.service;
  if (!service) return { status: "failed", error: "No service selected." };
  if (!guide.email) return { status: "failed", error: "No recipient email." };
  if (!guide.follow_up_email_subject || !guide.follow_up_email_body) {
    return { status: "failed", error: "No email draft is saved for this consultation." };
  }

  const subject = guide.follow_up_email_subject;
  const text = guide.follow_up_email_body;
  const html = textToHtml(text);

  try {
    const resend = getResendClient();
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: getEmailSender(service === "business_financing" ? "funding" : "growth"),
      to: guide.email,
      replyTo: getEmailReplyTo(),
      subject,
      text,
      html,
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
          subject,
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
