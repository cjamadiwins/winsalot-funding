import "server-only";
import { escapeHtml } from "./html";
import { PROVIDER_INTAKE_URL, firstNameFrom } from "./provider-intake-content";

export { PROVIDER_INTAKE_URL, PROVIDER_INTAKE_EMAIL_SUBJECT, buildProviderIntakeEmailText } from "./provider-intake-content";

export function buildProviderIntakeEmailHtml(contactName: string): string {
  const firstName = firstNameFrom(contactName);
  const url = PROVIDER_INTAKE_URL;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Complete Your Winsalot Cleaning Provider Intake Form</title>
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
                Thank you for speaking with us.
              </p>

              <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#374151;">
                Winsalot Corp is currently expanding its network of professional cleaning providers across Canada.
              </p>

              <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#374151;">
                Please complete our short cleaning provider intake form so we can learn more about your business, the services you provide, and the areas you serve.
              </p>

              <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#374151;">
                Completing the form does not obligate you to accept any cleaning opportunity.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px auto;">
                <tr>
                  <td align="center" style="border-radius:6px; background-color:#2563eb;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:56px;v-text-anchor:middle;width:320px;" arcsize="11%" stroke="f" fillcolor="#2563eb">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;">Complete Provider Intake Form</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${url}"
                       target="_blank"
                       rel="noopener noreferrer"
                       style="display:inline-block; padding:18px 44px; font-size:18px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:6px; background-color:#2563eb;">
                      COMPLETE PROVIDER INTAKE FORM
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
                Once your information has been submitted, our team will review your application and contact you regarding suitable opportunities.
              </p>

              <p style="margin:0; font-size:15px; line-height:1.6; color:#374151;">
                Thank you,<br>
                Winsalot Corp<br>
                Empowering Businesses, One Solution at a Time<br>
                647-300-1270
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px; background-color:#f9fafb; text-align:center; border-top:1px solid #e5e7eb;">
              <p style="margin:0; font-size:12px; line-height:1.5; color:#9ca3af;">
                You're receiving this because you spoke with Winsalot Corp about joining our cleaning provider network.
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
