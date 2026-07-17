import "server-only";
import { escapeHtml } from "./html";

// The branded email sent to a customer only when an admin clicks "Send
// Quote to Customer" — never automatically. Both buttons link to the same
// secure /customer-quote/[token] page; the Decline link just adds a query
// param to pre-focus the comments field there. Accepting/declining always
// happens on that page, never as a one-click action from the email itself.
export function buildCustomerQuoteEmailText(params: {
  customerName: string;
  cleaningType: string;
  propertyType: string;
  city: string;
  price: number;
  priceTypeLabel: string;
  providerName: string;
  notes: string | null;
  acceptUrl: string;
  declineUrl: string;
  expiresAt: string;
}): string {
  const lines = [
    `Hi ${params.customerName},`,
    "",
    `Your cleaning quote is ready. Here are the details:`,
    "",
    `Service: ${params.cleaningType} (${params.propertyType})`,
    `Location: ${params.city}`,
    `Provider: ${params.providerName}`,
    `Price: $${params.price.toFixed(2)} (${params.priceTypeLabel})`,
  ];

  if (params.notes) {
    lines.push("", `Notes: ${params.notes}`);
  }

  lines.push(
    "",
    `This quote expires on ${new Date(params.expiresAt).toLocaleDateString()}.`,
    "",
    `Accept this quote: ${params.acceptUrl}`,
    `Decline this quote: ${params.declineUrl}`,
    "",
    "Thank you,",
    "Winsalot Corp"
  );

  return lines.join("\n");
}

export function buildCustomerQuoteEmailHtml(params: {
  customerName: string;
  cleaningType: string;
  propertyType: string;
  city: string;
  price: number;
  priceTypeLabel: string;
  providerName: string;
  notes: string | null;
  acceptUrl: string;
  declineUrl: string;
  expiresAt: string;
}): string {
  const {
    customerName,
    cleaningType,
    propertyType,
    city,
    price,
    priceTypeLabel,
    providerName,
    notes,
    acceptUrl,
    declineUrl,
    expiresAt,
  } = params;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Cleaning Quote</title>
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
              <h1 style="margin:0 0 16px 0; font-size:22px; line-height:1.3; color:#111827;">
                Your Cleaning Quote Is Ready
              </h1>

              <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#374151;">
                Hi ${escapeHtml(customerName)},
              </p>

              <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#374151;">
                Thank you for requesting a cleaning quote. Here are the details:
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0; border:1px solid #e5e7eb; border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px; font-size:14px; color:#6b7280; border-bottom:1px solid #e5e7eb;">Service</td>
                  <td style="padding:16px 20px; font-size:14px; color:#111827; font-weight:600; text-align:right; border-bottom:1px solid #e5e7eb;">${escapeHtml(cleaningType)} (${escapeHtml(propertyType)})</td>
                </tr>
                <tr>
                  <td style="padding:16px 20px; font-size:14px; color:#6b7280; border-bottom:1px solid #e5e7eb;">Location</td>
                  <td style="padding:16px 20px; font-size:14px; color:#111827; font-weight:600; text-align:right; border-bottom:1px solid #e5e7eb;">${escapeHtml(city)}</td>
                </tr>
                <tr>
                  <td style="padding:16px 20px; font-size:14px; color:#6b7280; border-bottom:1px solid #e5e7eb;">Provider</td>
                  <td style="padding:16px 20px; font-size:14px; color:#111827; font-weight:600; text-align:right; border-bottom:1px solid #e5e7eb;">${escapeHtml(providerName)}</td>
                </tr>
                <tr>
                  <td style="padding:16px 20px; font-size:14px; color:#6b7280; ${notes ? "border-bottom:1px solid #e5e7eb;" : ""}">Price</td>
                  <td style="padding:16px 20px; font-size:16px; color:#1e3a8a; font-weight:700; text-align:right; ${notes ? "border-bottom:1px solid #e5e7eb;" : ""}">$${price.toFixed(2)} (${escapeHtml(priceTypeLabel)})</td>
                </tr>
                ${
                  notes
                    ? `<tr>
                  <td colspan="2" style="padding:16px 20px; font-size:14px; color:#374151;">
                    <span style="color:#6b7280;">Notes:</span><br>${escapeHtml(notes).replace(/\n/g, "<br>")}
                  </td>
                </tr>`
                    : ""
                }
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px auto;">
                <tr>
                  <td align="center" style="border-radius:6px; background-color:#2563eb;">
                    <a href="${escapeHtml(acceptUrl)}"
                       target="_blank"
                       style="display:inline-block; padding:16px 40px; font-size:17px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:6px; background-color:#2563eb;">
                      Accept Quote
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px auto;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(declineUrl)}"
                       target="_blank"
                       style="display:inline-block; padding:8px 16px; font-size:13px; font-weight:600; color:#6b7280; text-decoration:underline;">
                      Decline Quote
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px 0; font-size:13px; line-height:1.6; color:#9ca3af; text-align:center;">
                This quote expires on ${new Date(expiresAt).toLocaleDateString()}.
              </p>

              <p style="margin:24px 0 0 0; font-size:15px; line-height:1.6; color:#374151;">
                Thank you,<br>
                Winsalot Corp
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px; background-color:#f9fafb; text-align:center; border-top:1px solid #e5e7eb;">
              <p style="margin:0; font-size:12px; line-height:1.5; color:#9ca3af;">
                You're receiving this because you requested a cleaning quote from Winsalot Corp.
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
