import { escapeHtml } from "./html";
import type { OpportunityType } from "./crm-types";
import { winsalotAppointmentTypeCopyLabel, winsalotServiceTypeLabel, type WinsalotAppointmentType } from "./winsalot-consultation-types";

// Winsalot-branded email templates for the consultation-booking system.
// Same plain personal-email visual language as the existing prospect-
// email system (src/lib/prospect-email-templates.ts - black text on a
// white background, no banner, plain text links instead of buttons,
// Winsalot Corp footer) but written as fully independent functions here,
// and never shared with (or imported by) any Lead Gen CRM / Brent's
// Essentials / Mantra Collab email code.

export type WinsalotEmailBody = { subject: string; text: string; html: string };

function formatAppointmentDateTime(startUtcIso: string, timeZone: string): { date: string; time: string; timezoneLabel: string } {
  const d = new Date(startUtcIso);
  const date = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(d);
  const tzPart = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName");
  return { date, time, timezoneLabel: tzPart?.value ?? timeZone };
}

function shell(bodyHtml: string, title: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#ffffff; font-family: Arial, Helvetica, sans-serif; color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; padding:24px 20px;">
          <tr>
            <td>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding-top:16px; border-top:1px solid #e5e7eb;">
              <p style="margin:0; font-size:12px; line-height:1.6; color:#6b7280;">
                Winsalot Corp. · 647-300-1270 · info@winsalotcorp.com · winsalotcorp.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

function paragraphsHtml(lines: string[]): string {
  return lines
    .map((line) =>
      line === ""
        ? ""
        : `<p style="margin:0 0 14px 0; font-size:15px; line-height:1.6; color:#111827;">${escapeHtml(line)}</p>`
    )
    .join("\n");
}

// A plain inline text link, not a colored button graphic - per the
// deliverability brief, a promotional-looking button is exactly the
// visual cue that pushes a transactional appointment email toward
// Gmail's Promotions tab.
function ctaButtonHtml(url: string, label: string): string {
  return `<p style="margin:0 0 14px 0; font-size:15px; line-height:1.6;"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:#1a56db; text-decoration:underline;">${escapeHtml(label)}</a></p>`;
}

export type ConsultationEmailParams = {
  contactName: string;
  businessName: string;
  serviceType: OpportunityType;
  appointmentType: WinsalotAppointmentType;
  startUtcIso: string;
  timezone: string; // display timezone - prospect's local when known, else business timezone
  rescheduleUrl?: string;
  cancelUrl?: string;
};

// Confirmation copy is fixed exactly to the brief's required subject and
// body template - do not reword without checking the brief first. Subject
// is the literal, exact line the brief requires - "Your appointment with
// Winsalot Corp." - with no "is confirmed" or other promotional wording
// appended, so it reads as plainly as possible and keeps a transactional
// message out of the pattern Gmail's Promotions classifier looks for. The
// "[TEST] " prefix a test send shows in front of this comes from
// testSubject() in send-test-email.ts, not from this string.
export function buildWinsalotConfirmationEmail(params: ConsultationEmailParams): WinsalotEmailBody {
  const { date, time, timezoneLabel } = formatAppointmentDateTime(params.startUtcIso, params.timezone);
  const appointmentTypeLabel = winsalotAppointmentTypeCopyLabel(params.appointmentType);
  const subject = "Your appointment with Winsalot Corp.";

  const textLines = [
    `Hi ${params.contactName},`,
    "",
    `Your free 15-minute ${appointmentTypeLabel} with Winsalot Corp. has been confirmed.`,
    "",
    `Business: ${params.businessName}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Timezone: ${timezoneLabel}`,
    "",
    "We look forward to learning more about your business and discussing how Winsalot Corp. may be able to support your goals.",
  ];
  if (params.rescheduleUrl) textLines.push("", `Need to reschedule? ${params.rescheduleUrl}`);
  if (params.cancelUrl) textLines.push(`Need to cancel? ${params.cancelUrl}`);
  textLines.push("", "Best regards,", "Winsalot Corp.", "647-300-1270", "info@winsalotcorp.com", "winsalotcorp.com");

  const detailsHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 20px; font-size:14px; color:#111827;">
      <tr><td style="padding:4px 0; font-weight:bold; width:110px;">Business:</td><td style="padding:4px 0;">${escapeHtml(params.businessName)}</td></tr>
      <tr><td style="padding:4px 0; font-weight:bold;">Date:</td><td style="padding:4px 0;">${escapeHtml(date)}</td></tr>
      <tr><td style="padding:4px 0; font-weight:bold;">Time:</td><td style="padding:4px 0;">${escapeHtml(time)}</td></tr>
      <tr><td style="padding:4px 0; font-weight:bold;">Timezone:</td><td style="padding:4px 0;">${escapeHtml(timezoneLabel)}</td></tr>
    </table>`;

  let linksHtml = "";
  if (params.rescheduleUrl) linksHtml += ctaButtonHtml(params.rescheduleUrl, "Reschedule");
  if (params.cancelUrl) {
    linksHtml += `<div style="text-align:center; margin-top:8px;"><a href="${escapeHtml(params.cancelUrl)}" style="font-size:12.5px; color:#9ca3af;">Cancel this consultation</a></div>`;
  }

  const bodyHtml = `
    ${paragraphsHtml([`Hi ${params.contactName},`, "", `Your free 15-minute ${appointmentTypeLabel} with Winsalot Corp. has been confirmed.`])}
    ${detailsHtml}
    ${paragraphsHtml(["We look forward to learning more about your business and discussing how Winsalot Corp. may be able to support your goals."])}
    ${linksHtml}
  `;

  return { subject, text: textLines.join("\n"), html: shell(bodyHtml, subject) };
}

export function buildWinsalotInternalBookingNotification(
  params: ConsultationEmailParams & { recipientName: string | null; assignedAgentName: string | null; crmLink: string; bookedBy: "agent" | "self" }
): WinsalotEmailBody {
  const { date, time, timezoneLabel } = formatAppointmentDateTime(params.startUtcIso, params.timezone);
  const serviceLabel = winsalotServiceTypeLabel(params.serviceType);
  const subject = `New Consultation Booked: ${params.businessName}`;

  const lines = [
    `Hi ${params.recipientName || "there"},`,
    "",
    params.bookedBy === "self" ? "A prospect just self-booked a free 15-minute consultation." : "A consultation was booked for a prospect.",
    "",
    `Prospect: ${params.contactName}`,
    `Business: ${params.businessName}`,
    `Service: ${serviceLabel}`,
    `Appointment Type: ${params.appointmentType}`,
    `Date: ${date}`,
    `Time: ${time} (${timezoneLabel})`,
    `Assigned Agent: ${params.assignedAgentName || "Unassigned"}`,
    "",
    `Open in CRM: ${params.crmLink}`,
  ];

  const bodyHtml = paragraphsHtml(lines);
  return { subject, text: lines.join("\n"), html: shell(bodyHtml, subject) };
}

// Internal admin notification for the public "Continue With Winsalot
// Corp" next-step page (/continue-with-winsalot) - fires once per
// submission (see notifyOfWinsalotContinueRequest's admin_notified_at
// claim in src/lib/winsalot-continue-request.ts). Never sent to the
// prospect themselves - this is the same "Winsalot admin notification"
// channel buildWinsalotInternalBookingNotification above already uses.
export function buildWinsalotContinueRequestNotification(params: {
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  serviceType: OpportunityType;
  notes: string | null;
  crmLink: string;
}): WinsalotEmailBody {
  const serviceLabel = winsalotServiceTypeLabel(params.serviceType);
  const subject = `${params.businessName} wants to continue with Winsalot Corp.`;

  const lines = [
    "Hi there,",
    "",
    `${params.contactName} at ${params.businessName} clicked "Continue With Winsalot Corp." after their consultation and wants to move forward.`,
    "",
    `Contact: ${params.contactName}`,
    `Business: ${params.businessName}`,
    `Email: ${params.email}`,
    `Phone: ${params.phone}`,
    `Service Interest: ${serviceLabel}`,
  ];
  if (params.notes) lines.push(`Notes: ${params.notes}`);
  lines.push("", `Open in CRM: ${params.crmLink}`);

  const bodyHtml = paragraphsHtml(lines);
  return { subject, text: lines.join("\n"), html: shell(bodyHtml, subject) };
}

export function buildWinsalotRescheduleEmail(params: ConsultationEmailParams): WinsalotEmailBody {
  const { date, time, timezoneLabel } = formatAppointmentDateTime(params.startUtcIso, params.timezone);
  const appointmentTypeLabel = winsalotAppointmentTypeCopyLabel(params.appointmentType);
  const subject = "Your appointment with Winsalot Corp. has been rescheduled";
  const lines = [
    `Hi ${params.contactName},`,
    "",
    `Your free 15-minute ${appointmentTypeLabel} with Winsalot Corp. has been rescheduled.`,
    "",
    `Business: ${params.businessName}`,
    `New Date: ${date}`,
    `New Time: ${time}`,
    `Timezone: ${timezoneLabel}`,
  ];
  if (params.rescheduleUrl) lines.push("", `Need to reschedule again? ${params.rescheduleUrl}`);
  if (params.cancelUrl) lines.push(`Need to cancel? ${params.cancelUrl}`);
  lines.push("", "Best regards,", "Winsalot Corp.");

  let linksHtml = "";
  if (params.rescheduleUrl) linksHtml += ctaButtonHtml(params.rescheduleUrl, "Reschedule Again");
  if (params.cancelUrl) {
    linksHtml += `<div style="text-align:center; margin-top:8px;"><a href="${escapeHtml(params.cancelUrl)}" style="font-size:12.5px; color:#9ca3af;">Cancel this consultation</a></div>`;
  }

  const bodyHtml = `${paragraphsHtml([
    `Hi ${params.contactName},`,
    "",
    `Your free 15-minute ${appointmentTypeLabel} with Winsalot Corp. has been rescheduled.`,
  ])}${paragraphsHtml([
    `Business: ${params.businessName}`,
    `New Date: ${date}`,
    `New Time: ${time}`,
    `Timezone: ${timezoneLabel}`,
  ])}${linksHtml}`;

  return { subject, text: lines.join("\n"), html: shell(bodyHtml, subject) };
}

export function buildWinsalotCancellationEmail(params: {
  contactName: string;
  businessName: string;
  startUtcIso: string;
  timezone: string;
}): WinsalotEmailBody {
  const { date, time, timezoneLabel } = formatAppointmentDateTime(params.startUtcIso, params.timezone);
  const subject = "Your appointment with Winsalot Corp. has been cancelled";
  const lines = [
    `Hi ${params.contactName},`,
    "",
    `Your consultation scheduled for ${date} at ${time} (${timezoneLabel}) has been cancelled.`,
    "",
    "If you'd like to book a new time, just reply to this email or visit our booking page again.",
    "",
    "Best regards,",
    "Winsalot Corp.",
  ];
  const bodyHtml = paragraphsHtml(lines);
  return { subject, text: lines.join("\n"), html: shell(bodyHtml, subject) };
}

// Extracts a first name for the greeting ("Hi [First Name],") - this one
// email is the only place in this file that personalizes by first name
// rather than the full contact name, per the brief's exact copy. Falls
// back to the full (trimmed) name if it's already just one word.
export function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

// A plain, mobile-friendly bullet list - stacked <p> lines rather than a
// <ul> (some email clients, notably older Outlook, mangle list
// indentation/markers), each with a leading "•" exactly like the plain
// text version, so the two never visually diverge.
function bulletListHtml(lines: string[]): string {
  return lines
    .map(
      (line) =>
        `<p style="margin:0 0 6px 18px; font-size:15px; line-height:1.5; color:#111827; text-indent:-18px;">&#8226;&nbsp;&nbsp;${escapeHtml(line)}</p>`
    )
    .join("\n");
}

export type FollowUpEmailParams = {
  contactName: string;
  // Absolute URL to the public, unauthenticated "Continue With Winsalot
  // Corp" next-step page (/continue-with-winsalot - see
  // src/lib/winsalot-continue-request.ts). Always present and always the
  // same page for every recipient, client or prospect alike - this email
  // must never link straight to the protected client dashboard or any
  // other authenticated page (see winsalot-consultation-completion.ts's
  // buildFollowUpEmailForAppointment for how it's built).
  continueUrl: string;
};

// One-time consultation follow-up email - sent only once "Complete
// Consultation" is clicked (never for a cancelled/no-show appointment,
// never on a timer) unless an admin explicitly chooses to send/resend it
// from the appointment record. Deliberately plain, personal copy matching
// the rest of this file - see winsalot-consultation-completion.ts for the
// send/tracking/dedup logic itself. Never promises closed sales, specific
// revenue, or guaranteed results - only describes what a campaign can
// include and the next step.
export function buildWinsalotFollowUpEmail(params: FollowUpEmailParams): WinsalotEmailBody {
  const firstName = firstNameOf(params.contactName);
  const subject = "Thank you for speaking with Winsalot Corp.";

  const campaignBullets = [
    "Dedicated outbound prospecting for your business",
    "Targeted outreach based on your ideal customer profile",
    "Qualified B2B appointment setting",
    "Follow-up with interested prospects",
    "Call activity and campaign tracking",
    "Appointment tracking",
    "Call logs and campaign visibility",
    "Monthly performance reporting",
    "Ongoing campaign optimization",
    "Access to your client dashboard to monitor leads, appointments, and campaign progress",
    "Ongoing support from the Winsalot Corp. team",
  ];

  const introLines = [
    `Hi ${firstName},`,
    "",
    "Thank you for taking the time to speak with Winsalot Corp.",
    "",
    "As discussed, our goal is to help your business consistently connect with qualified potential customers through targeted B2B outreach and appointment setting.",
    "",
    "When you work with Winsalot Corp., your campaign can include:",
  ];

  const closingLines = [
    "Our focus is to give you a structured and transparent prospecting system while helping your team spend more time speaking with potential customers.",
    "",
    "If you decide to move forward, we will complete your onboarding and set up your campaign based on your target market, services, and ideal customer.",
  ];

  const nextStepLines = ["If you'd like to move forward with Winsalot Corp., click the button below to continue with the next step."];
  const replyLine = "You can also reply directly to this email if you have any questions.";

  const textLines = [
    ...introLines,
    ...campaignBullets.map((line) => `• ${line}`),
    "",
    ...closingLines,
    "",
    ...nextStepLines,
    "",
    `Continue With Winsalot Corp.: ${params.continueUrl}`,
    "",
    replyLine,
    "",
    "Best regards,",
    "Winsalot Corp.",
    "647-300-1270",
    "info@winsalotcorp.com",
    "winsalotcorp.com",
  ];

  const ctaHtml = `
    ${paragraphsHtml(nextStepLines)}
    ${ctaButtonHtml(params.continueUrl, "Continue With Winsalot Corp.")}
    ${paragraphsHtml([replyLine])}
  `;

  const bodyHtml = `
    ${paragraphsHtml(introLines)}
    ${bulletListHtml(campaignBullets)}
    ${paragraphsHtml(["", ...closingLines])}
    ${ctaHtml}
  `;

  return { subject, text: textLines.join("\n"), html: shell(bodyHtml, subject) };
}

export type BusinessFinanceFollowUpEmailParams = {
  contactName: string;
  // The consultant who ran the consultation - always the admin who marks
  // it complete (the guide's own free-text consultant_name field is used
  // for the displayed name when set, so it can still credit whoever
  // actually ran the call even if a different admin clicks Complete).
  consultantName: string;
};

// New Business Finance consultation-completion follow-up email (Growth
// CRM Client Consultation Guide, "Mark Consultation Complete" with
// Service = Business Finance). Copy is fixed exactly to CJ's brief - the
// 2026-09-18 21:05 revision superseded the earlier draft, so this is the
// current version; do not reword without checking the brief first. Never
// sent for the existing Lead Generation flow, which keeps using
// buildWinsalotFollowUpEmail above unchanged. Never exposes internal
// consultation notes, qualification answers, or lender information - it
// only ever takes a contact/consultant name, nothing from the guide's own
// discovery/fit/summary answers.
export function buildWinsalotBusinessFinanceFollowUpEmail(params: BusinessFinanceFollowUpEmailParams): WinsalotEmailBody {
  const firstName = firstNameOf(params.contactName);
  const subject = "Next Steps for Your Business Financing Request";

  const introLines = [
    `Hi ${firstName},`,
    "",
    "Thank you for taking the time to speak with Winsalot Corp. about your business financing needs.",
    "",
    "Based on our consultation, the next step is to review your business information and recent bank statements so we can determine which financing options may be available.",
    "",
    "Please reply to this email with:",
  ];

  const requestBullets = [
    "Your most recent six months of business bank statements",
    "Your legal business name",
    "The amount of financing requested",
    "How you intend to use the funds",
  ];

  const closingLines = [
    "Once received, we will review the information and, where appropriate, submit it to a suitable funding partner. Financing is subject to the lender's review and approval. Winsalot Corp. does not guarantee approval, rates, terms, or funding amounts.",
    "",
    "There is no fee charged by Winsalot Corp. for helping you explore business financing options. If financing is completed, Winsalot Corp. may receive compensation from the funding provider.",
    "",
    "If you have any questions, reply to this email and we will be happy to assist.",
  ];

  const signOffLines = ["Best regards,", params.consultantName, "Winsalot Corp."];

  const textLines = [...introLines, ...requestBullets.map((line) => `• ${line}`), "", ...closingLines, "", ...signOffLines];
  const bodyHtml = `${paragraphsHtml(introLines)}${bulletListHtml(requestBullets)}${paragraphsHtml(["", ...closingLines])}${paragraphsHtml(signOffLines)}`;

  return { subject, text: textLines.join("\n"), html: shell(bodyHtml, subject) };
}

export function buildWinsalotReminderEmail(
  params: ConsultationEmailParams & { reminderType: "24_hour_reminder" | "1_hour_reminder" }
): WinsalotEmailBody {
  const { date, time, timezoneLabel } = formatAppointmentDateTime(params.startUtcIso, params.timezone);
  const appointmentTypeLabel = winsalotAppointmentTypeCopyLabel(params.appointmentType);
  const when = params.reminderType === "24_hour_reminder" ? "tomorrow" : "in about 1 hour";
  const subject =
    params.reminderType === "24_hour_reminder"
      ? "Reminder: your appointment with Winsalot Corp. is tomorrow"
      : "Reminder: your appointment with Winsalot Corp. is in 1 hour";

  const lines = [
    `Hi ${params.contactName},`,
    "",
    `This is a reminder that your free 15-minute ${appointmentTypeLabel} with Winsalot Corp. is ${when}.`,
    "",
    `Business: ${params.businessName}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Timezone: ${timezoneLabel}`,
  ];
  if (params.rescheduleUrl) lines.push("", `Need to reschedule? ${params.rescheduleUrl}`);
  if (params.cancelUrl) lines.push(`Need to cancel? ${params.cancelUrl}`);
  lines.push("", "We look forward to speaking with you!", "", "Best regards,", "Winsalot Corp.");

  let linksHtml = "";
  if (params.rescheduleUrl) linksHtml += ctaButtonHtml(params.rescheduleUrl, "Reschedule");

  const bodyHtml = `${paragraphsHtml([
    `Hi ${params.contactName},`,
    "",
    `This is a reminder that your free 15-minute ${appointmentTypeLabel} with Winsalot Corp. is ${when}.`,
  ])}${paragraphsHtml([`Business: ${params.businessName}`, `Date: ${date}`, `Time: ${time}`, `Timezone: ${timezoneLabel}`])}${linksHtml}`;

  return { subject, text: lines.join("\n"), html: shell(bodyHtml, subject) };
}
