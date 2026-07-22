import "server-only";
import { getResendClient } from "./resend";
import { escapeHtml } from "./html";
import type { ActiveCleaningOpportunityRow } from "./opportunities/types";

// Fired once per newly-discovered Hot opportunity (see run.ts - it only
// ever calls this for rows it just inserted, so a record that was already
// in the database on a previous run never re-triggers this, satisfying
// "do not send duplicate alerts" without needing a separate sent-log table.
export async function sendHotOpportunityAlert(opportunity: ActiveCleaningOpportunityRow): Promise<void> {
  const resend = getResendClient();
  const to = process.env.OPPORTUNITY_ALERT_EMAIL || "info@winsalotcorp.com";
  const fromEmail = process.env.EMAIL_FROM || "Winsalot Corp <info@winsalotcorp.com>";

  const subject = `Hot Cleaning Opportunity: ${opportunity.organization_name ?? opportunity.opportunity_title}`;
  const lines = [
    `Organization: ${opportunity.organization_name ?? "Unknown"}`,
    `Service required: ${opportunity.service_needed ?? opportunity.opportunity_title}`,
    `City: ${[opportunity.city, opportunity.province].filter(Boolean).join(", ") || "Unknown"}`,
    `Deadline: ${opportunity.deadline ?? "None listed"}`,
    `Intent score: ${opportunity.intent_score}/100 (Hot)`,
    `Source: ${opportunity.source_name}`,
  ];

  const text = [
    "A new Hot cleaning opportunity was just discovered.",
    "",
    ...lines,
    "",
    opportunity.source_url,
    "",
    "This is a potential opportunity identified from a public source, not a guaranteed buyer.",
  ].join("\n");

  const html = `
    <p>A new <strong>Hot</strong> cleaning opportunity was just discovered.</p>
    <ul>
      ${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("\n")}
    </ul>
    <p><a href="${escapeHtml(opportunity.source_url)}">View original source</a></p>
    <p style="color:#64748b;font-size:12px;">This is a potential opportunity identified from a public source, not a guaranteed buyer.</p>
  `;

  const { error } = await resend.emails.send({ from: fromEmail, to, subject, text, html });
  if (error) {
    throw new Error(`Failed to send Hot opportunity alert email: ${error.message ?? "Unknown Resend error"}`);
  }
}
