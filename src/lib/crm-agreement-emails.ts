import "server-only";
import { getResendClient } from "./resend";
import { getEmailSender, getEmailReplyTo } from "./email-senders";
import { getSiteUrl } from "./site-url";
import { escapeHtml } from "./html";
import { renderAgreementPdfBuffer } from "./crm-agreement-pdf";
import { AGREEMENT_SERVICE_TYPE_LABELS, type CrmAgreementTemplateRow, type CrmClientAgreementRow } from "./crm-agreement-types";

// Every email in this module is sent via getEmailSender("growth") -
// already "Winsalot Corp"-branded with no agent name (see
// src/lib/email-senders.ts), so "no agent-specific sender" (brief
// section 4) is satisfied by reuse, not new code.

function textToSimpleHtml(paragraphs: string[]): string {
  return `<div style="font-family: Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#111827;">
${paragraphs.map((p) => `<p style="margin:0 0 16px 0;">${p}</p>`).join("\n")}
</div>`;
}

function ctaButtonHtml(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<div style="text-align:center; margin:24px 0;">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block; background-color:#1a56db; color:#ffffff; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; text-decoration:none; padding:12px 28px; border-radius:6px;">${safeLabel}</a>
</div>`;
}

export async function sendAgreementSignEmail(agreement: CrmClientAgreementRow, token: string): Promise<{ error?: string }> {
  const signUrl = `${getSiteUrl()}/agreement-sign/${token}`;
  const subject = `Your Winsalot Corp Service Agreement is ready to sign - ${agreement.legal_business_name}`;
  const greeting = agreement.contact_person.trim().split(/\s+/)[0] || "there";

  const text = [
    `Hi ${greeting},`,
    "",
    `Your Winsalot Corp service agreement for ${agreement.legal_business_name} is ready for your review and signature.`,
    "",
    `Please review and sign here: ${signUrl}`,
    "",
    "If you have any questions, just reply to this email.",
    "",
    "Best regards,",
    "Winsalot Corp",
    "Empowering Businesses, One Solution at a Time.",
  ].join("\n");

  const html = textToSimpleHtml([
    `Hi ${escapeHtml(greeting)},`,
    `Your Winsalot Corp service agreement for ${escapeHtml(agreement.legal_business_name)} is ready for your review and signature.`,
  ]) + ctaButtonHtml(signUrl, "Review and Sign Agreement") + textToSimpleHtml([
    "If you have any questions, just reply to this email.",
    "Best regards,<br>Winsalot Corp<br>Empowering Businesses, One Solution at a Time.",
  ]);

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getEmailSender("growth"),
    to: agreement.business_email,
    replyTo: getEmailReplyTo(),
    subject,
    text,
    html,
  });

  if (error) return { error: error.message };
  return {};
}

export async function sendSignedAgreementCopies(
  agreement: CrmClientAgreementRow,
  template: Pick<CrmAgreementTemplateRow, "content">,
  adminNotificationEmail: string
): Promise<{ error?: string }> {
  const pdfBuffer = await renderAgreementPdfBuffer({ agreement, template });
  const filename = `Winsalot-Corp-Agreement-${agreement.legal_business_name.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
  const subject = `Signed: Winsalot Corp Service Agreement - ${agreement.legal_business_name}`;

  const text = [
    `The service agreement for ${agreement.legal_business_name} has been signed.`,
    "",
    `Signed by: ${agreement.signer_full_name} (${agreement.signer_job_title || "n/a"})`,
    `Signed at: ${agreement.accepted_at}`,
    "",
    "A copy of the signed agreement is attached to this email.",
  ].join("\n");
  const html = textToSimpleHtml([
    `The service agreement for ${escapeHtml(agreement.legal_business_name)} has been signed.`,
    `Signed by: ${escapeHtml(agreement.signer_full_name ?? "")} (${escapeHtml(agreement.signer_job_title || "n/a")})`,
    "A copy of the signed agreement is attached to this email.",
  ]);

  const resend = getResendClient();
  const [clientResult, adminResult] = await Promise.all([
    resend.emails.send({
      from: getEmailSender("growth"),
      to: agreement.business_email,
      replyTo: getEmailReplyTo(),
      subject,
      text,
      html,
      attachments: [{ filename, content: pdfBuffer }],
    }),
    resend.emails.send({
      from: getEmailSender("growth"),
      to: adminNotificationEmail,
      replyTo: getEmailReplyTo(),
      subject,
      text,
      html,
      attachments: [{ filename, content: pdfBuffer }],
    }),
  ]);

  if (clientResult.error) return { error: clientResult.error.message };
  if (adminResult.error) return { error: adminResult.error.message };
  return {};
}

export async function sendIntakeFormEmail(agreement: CrmClientAgreementRow, token: string): Promise<{ error?: string }> {
  const intakeUrl = `${getSiteUrl()}/client-intake/${token}`;
  const subject = `Client Intake Form - ${agreement.legal_business_name}`;
  const greeting = agreement.contact_person.trim().split(/\s+/)[0] || "there";

  const text = [
    `Hi ${greeting},`,
    "",
    `Thank you for signing your Winsalot Corp service agreement for ${agreement.legal_business_name}.`,
    "",
    `Please complete your client intake form here: ${intakeUrl}`,
    "",
    "Best regards,",
    "Winsalot Corp",
    "Empowering Businesses, One Solution at a Time.",
  ].join("\n");

  const html = textToSimpleHtml([
    `Hi ${escapeHtml(greeting)},`,
    `Thank you for signing your Winsalot Corp service agreement for ${escapeHtml(agreement.legal_business_name)}.`,
  ]) + ctaButtonHtml(intakeUrl, "Complete Client Intake Form") + textToSimpleHtml([
    "Best regards,<br>Winsalot Corp<br>Empowering Businesses, One Solution at a Time.",
  ]);

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getEmailSender("growth"),
    to: agreement.business_email,
    replyTo: getEmailReplyTo(),
    subject,
    text,
    html,
  });

  if (error) return { error: error.message };
  return {};
}

export function agreementServiceLabel(agreement: Pick<CrmClientAgreementRow, "service_type">): string {
  return AGREEMENT_SERVICE_TYPE_LABELS[agreement.service_type];
}
