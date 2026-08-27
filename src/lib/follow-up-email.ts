import "server-only";
import { escapeHtml } from "./html";

// A follow-up nudge sent to a Growth CRM opportunity's contact who hasn't
// responded yet — the email analog of the "Prospect Follow-Up Script"
// call script (see supabase/migrations/0084_crm_training_growth_content.sql).
// Sent only when an agent or admin clicks "Send Follow-Up Email" on that
// opportunity's record. Unlike the retired quote-request follow-up email,
// there's no public self-serve link to send — Growth CRM opportunities
// move forward through a phone/email conversation with the assigned
// agent, not a form.

function firstNameFrom(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "there";
}

export function buildFollowUpEmailText(customerName: string): string {
  const firstName = firstNameFrom(customerName);

  return [
    `Hello ${firstName},`,
    "",
    "We wanted to follow up — we haven't heard back from you yet about growing your business with Winsalot Corp's lead generation and business financing services.",
    "",
    "If you're still interested, just reply to this email or give us a call and we'll pick up right where we left off.",
    "",
    "If your plans have changed or you've already found another solution, just let us know.",
    "",
    "Best regards,",
    "Winsalot Corp.",
    "647-300-1270",
    "info@winsalotcorp.com",
  ].join("\n");
}

// Plain personal-email layout per the deliverability brief: no banner,
// no colored background - black-on-white text only, matching how this
// same follow-up reads in buildFollowUpEmailText above.
export function buildFollowUpEmailHtml(customerName: string): string {
  const firstName = firstNameFrom(customerName);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Following Up — Winsalot Corp</title>
</head>
<body style="margin:0; padding:0; background-color:#ffffff; font-family: Arial, Helvetica, sans-serif; color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; padding:24px 20px;">
          <tr>
            <td>
              <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6;">
                Hello ${escapeHtml(firstName)},
              </p>

              <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6;">
                We wanted to follow up — we haven&apos;t heard back from you yet about growing your
                business with Winsalot Corp&apos;s lead generation and business financing services.
              </p>

              <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6;">
                If you&apos;re still interested, just reply to this email or give us a call and
                we&apos;ll pick up right where we left off.
              </p>

              <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6;">
                If your plans have changed or you&apos;ve already found another solution, just let
                us know.
              </p>

              <p style="margin:0; font-size:15px; line-height:1.6;">
                Best regards,<br>
                Winsalot Corp.<br>
                647-300-1270<br>
                info@winsalotcorp.com
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:16px; border-top:1px solid #e5e7eb;">
              <p style="margin:0; font-size:12px; line-height:1.5; color:#6b7280;">
                You're receiving this because you spoke with Winsalot Corp about growing your business.
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
