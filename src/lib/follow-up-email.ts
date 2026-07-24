import "server-only";
import { escapeHtml } from "./html";

// A follow-up nudge sent to a CRM lead who was already sent a quote
// request but hasn't completed it — the email analog of the "Cleaning
// Quote Request Follow-Up" call script (see
// supabase/migrations/0021_followup_call_script.sql). Sent only when an
// agent or admin clicks "Send Follow-Up Email" on that lead's record,
// same fixed destination as the quote request email (no token/link
// specific to this lead).
export const FOLLOW_UP_URL = "https://cleaning.winsalotcorp.com";

function firstNameFrom(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "there";
}

export function buildFollowUpEmailText(customerName: string): string {
  const firstName = firstNameFrom(customerName);

  return [
    `Hello ${firstName},`,
    "",
    "We wanted to follow up on your cleaning quote request — we haven't heard back from you yet.",
    "",
    "If you still need a free cleaning quote, please click below to get started:",
    "",
    `Get a Free Cleaning Quote: ${FOLLOW_UP_URL}`,
    "",
    "If the button does not work, use this link:",
    FOLLOW_UP_URL,
    "",
    "If you have any questions or already found another provider, just reply to let us know.",
    "",
    "Best regards,",
    "Winsalot Corp.",
    "647-300-1270",
    "info@winsalotcorp.com",
  ].join("\n");
}

export function buildFollowUpEmailHtml(customerName: string): string {
  const firstName = firstNameFrom(customerName);
  const url = FOLLOW_UP_URL;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Following Up on Your Cleaning Quote Request</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; max-width:600px; width:100%;">

          <tr>
            <td style="background-color:#1e3a8a; padding:28px 40px; text-align:center;">
              <span style="color:#ffffff; font-size:20px; font-weight:bold; letter-spacing:0.5px;">Winsalot Corp</span>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#374151;">
                Hello ${escapeHtml(firstName)},
              </p>

              <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#374151;">
                We wanted to follow up on your cleaning quote request — we haven&apos;t heard back
                from you yet.
              </p>

              <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#374151;">
                If you still need a free cleaning quote, please click below to get started:
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px auto;">
                <tr>
                  <td align="center" style="border-radius:6px; background-color:#2563eb;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="11%" stroke="f" fillcolor="#2563eb">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;">Get a Free Cleaning Quote</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${url}"
                       target="_blank"
                       rel="noopener noreferrer"
                       style="display:inline-block; padding:16px 40px; font-size:17px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:6px; background-color:#2563eb;">
                      Get a Free Cleaning Quote
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px 0; font-size:13px; line-height:1.6; color:#6b7280; text-align:center;">
                If the button does not work, use this link:<br>
                <a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb; text-decoration:underline;">${url}</a>
              </p>

              <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#374151;">
                If you have any questions or already found another provider, just reply to let us know.
              </p>

              <p style="margin:0; font-size:15px; line-height:1.6; color:#374151;">
                Best regards,<br>
                Winsalot Corp.<br>
                647-300-1270<br>
                info@winsalotcorp.com
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px; background-color:#f9fafb; text-align:center; border-top:1px solid #e5e7eb;">
              <p style="margin:0; font-size:12px; line-height:1.5; color:#9ca3af;">
                You're receiving this because you spoke with Winsalot Corp about a cleaning service.
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
