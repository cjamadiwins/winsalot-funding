import "server-only";
import { escapeHtml } from "./html";

// The "Get a Free Cleaning Quote" prospecting email, sent to a CRM lead
// only when an agent or admin clicks "Send Quote Request Email" on that
// lead's record — never automatically. Its only call to action is the
// public quote form at cleaning.winsalotcorp.com; it does not carry a
// token or any other link, matching the fixed destination this email is
// required to use.
export const QUOTE_REQUEST_URL = "https://cleaning.winsalotcorp.com";

function firstNameFrom(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "there";
}

export function buildQuoteRequestEmailText(customerName: string): string {
  const firstName = firstNameFrom(customerName);

  return [
    `Hello ${firstName},`,
    "",
    "Thank you for your interest in our cleaning services.",
    "",
    "Please click below to request your free cleaning quote:",
    "",
    `Get a Free Cleaning Quote: ${QUOTE_REQUEST_URL}`,
    "",
    "If the button does not work, use this link:",
    QUOTE_REQUEST_URL,
    "",
    "Once submitted, we will review your request and follow up with you.",
    "",
    "Best regards,",
    "Winsalot Corp.",
    "647-300-1270",
    "info@winsalotcorp.com",
  ].join("\n");
}

export function buildQuoteRequestEmailHtml(customerName: string): string {
  const firstName = firstNameFrom(customerName);
  const url = QUOTE_REQUEST_URL;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Request Your Free Cleaning Quote</title>
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
                Thank you for your interest in our cleaning services.
              </p>

              <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#374151;">
                Please click below to request your free cleaning quote:
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
                Once submitted, we will review your request and follow up with you.
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
