import { escapeHtml } from "./html";
import type { OpportunityType } from "./crm-types";
import { winsalotServiceTypeLabel } from "./winsalot-consultation-types";

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
                Winsalot Corp · 647-300-1270 · info@winsalotcorp.com · winsalotcorp.com
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
  startUtcIso: string;
  timezone: string; // display timezone - prospect's local when known, else business timezone
  rescheduleUrl?: string;
  cancelUrl?: string;
};

// Confirmation copy is fixed exactly to the brief's required subject and
// body template - do not reword without checking the brief first.
export function buildWinsalotConfirmationEmail(params: ConsultationEmailParams): WinsalotEmailBody {
  const { date, time, timezoneLabel } = formatAppointmentDateTime(params.startUtcIso, params.timezone);
  const serviceLabel = winsalotServiceTypeLabel(params.serviceType);
  const subject = "Your consultation is confirmed";

  const textLines = [
    `Hi ${params.contactName},`,
    "",
    "Your free 15-minute business consultation with Winsalot Corp has been confirmed.",
    "",
    `Business: ${params.businessName}`,
    `Service: ${serviceLabel}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Timezone: ${timezoneLabel}`,
    "",
    "We look forward to learning more about your business and discussing how Winsalot Corp may be able to support your goals.",
  ];
  if (params.rescheduleUrl) textLines.push("", `Need to reschedule? ${params.rescheduleUrl}`);
  if (params.cancelUrl) textLines.push(`Need to cancel? ${params.cancelUrl}`);
  textLines.push(
    "",
    "Best regards,",
    "Winsalot Corp",
    "Empowering Businesses, One Solution at a Time.",
    "647-300-1270",
    "info@winsalotcorp.com",
    "winsalotcorp.com"
  );

  const detailsHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 20px; font-size:14px; color:#111827;">
      <tr><td style="padding:4px 0; font-weight:bold; width:110px;">Business:</td><td style="padding:4px 0;">${escapeHtml(params.businessName)}</td></tr>
      <tr><td style="padding:4px 0; font-weight:bold;">Service:</td><td style="padding:4px 0;">${escapeHtml(serviceLabel)}</td></tr>
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
    ${paragraphsHtml([`Hi ${params.contactName},`, "", "Your free 15-minute business consultation with Winsalot Corp has been confirmed."])}
    ${detailsHtml}
    ${paragraphsHtml(["We look forward to learning more about your business and discussing how Winsalot Corp may be able to support your goals."])}
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
    `Date: ${date}`,
    `Time: ${time} (${timezoneLabel})`,
    `Assigned Agent: ${params.assignedAgentName || "Unassigned"}`,
    "",
    `Open in CRM: ${params.crmLink}`,
  ];

  const bodyHtml = paragraphsHtml(lines);
  return { subject, text: lines.join("\n"), html: shell(bodyHtml, subject) };
}

export function buildWinsalotRescheduleEmail(params: ConsultationEmailParams): WinsalotEmailBody {
  const { date, time, timezoneLabel } = formatAppointmentDateTime(params.startUtcIso, params.timezone);
  const subject = "Your consultation has been rescheduled";
  const lines = [
    `Hi ${params.contactName},`,
    "",
    "Your free 15-minute business consultation with Winsalot Corp has been rescheduled.",
    "",
    `Business: ${params.businessName}`,
    `New Date: ${date}`,
    `New Time: ${time}`,
    `Timezone: ${timezoneLabel}`,
  ];
  if (params.rescheduleUrl) lines.push("", `Need to reschedule again? ${params.rescheduleUrl}`);
  if (params.cancelUrl) lines.push(`Need to cancel? ${params.cancelUrl}`);
  lines.push("", "Best regards,", "Winsalot Corp", "Empowering Businesses, One Solution at a Time.");

  let linksHtml = "";
  if (params.rescheduleUrl) linksHtml += ctaButtonHtml(params.rescheduleUrl, "Reschedule Again");
  if (params.cancelUrl) {
    linksHtml += `<div style="text-align:center; margin-top:8px;"><a href="${escapeHtml(params.cancelUrl)}" style="font-size:12.5px; color:#9ca3af;">Cancel this consultation</a></div>`;
  }

  const bodyHtml = `${paragraphsHtml([
    `Hi ${params.contactName},`,
    "",
    "Your free 15-minute business consultation with Winsalot Corp has been rescheduled.",
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
  const subject = "Your consultation has been cancelled";
  const lines = [
    `Hi ${params.contactName},`,
    "",
    `Your consultation scheduled for ${date} at ${time} (${timezoneLabel}) has been cancelled.`,
    "",
    "If you'd like to book a new time, just reply to this email or visit our booking page again.",
    "",
    "Best regards,",
    "Winsalot Corp",
    "Empowering Businesses, One Solution at a Time.",
  ];
  const bodyHtml = paragraphsHtml(lines);
  return { subject, text: lines.join("\n"), html: shell(bodyHtml, subject) };
}

export function buildWinsalotReminderEmail(
  params: ConsultationEmailParams & { reminderType: "24_hour_reminder" | "1_hour_reminder" }
): WinsalotEmailBody {
  const { date, time, timezoneLabel } = formatAppointmentDateTime(params.startUtcIso, params.timezone);
  const when = params.reminderType === "24_hour_reminder" ? "tomorrow" : "in about 1 hour";
  const subject = params.reminderType === "24_hour_reminder" ? "Reminder: consultation tomorrow" : "Reminder: consultation in 1 hour";

  const lines = [
    `Hi ${params.contactName},`,
    "",
    `This is a reminder that your free 15-minute business consultation with Winsalot Corp is ${when}.`,
    "",
    `Business: ${params.businessName}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Timezone: ${timezoneLabel}`,
  ];
  if (params.rescheduleUrl) lines.push("", `Need to reschedule? ${params.rescheduleUrl}`);
  if (params.cancelUrl) lines.push(`Need to cancel? ${params.cancelUrl}`);
  lines.push("", "We look forward to speaking with you!", "", "Best regards,", "Winsalot Corp");

  let linksHtml = "";
  if (params.rescheduleUrl) linksHtml += ctaButtonHtml(params.rescheduleUrl, "Reschedule");

  const bodyHtml = `${paragraphsHtml([
    `Hi ${params.contactName},`,
    "",
    `This is a reminder that your free 15-minute business consultation with Winsalot Corp is ${when}.`,
  ])}${paragraphsHtml([`Business: ${params.businessName}`, `Date: ${date}`, `Time: ${time}`, `Timezone: ${timezoneLabel}`])}${linksHtml}`;

  return { subject, text: lines.join("\n"), html: shell(bodyHtml, subject) };
}
