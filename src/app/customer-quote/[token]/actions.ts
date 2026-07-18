"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashProviderToken } from "@/lib/tokens";
import { isTokenActive } from "@/lib/admin-types";
import { sendSms } from "@/lib/twilio";
import { getResendClient } from "@/lib/resend";
import { getSiteUrl } from "@/lib/site-url";
import { escapeHtml } from "@/lib/html";

type Decision = "accepted" | "declined";

async function notifyAdminOfCustomerResponse(params: {
  decision: Decision;
  customerName: string;
  customerCity: string;
  cleaningType: string;
  comments: string | null;
  quoteRequestId: string;
}) {
  const adminUrl = `${getSiteUrl()}/admin/requests/${params.quoteRequestId}`;
  const verb = params.decision === "accepted" ? "accepted" : "declined";

  const bodyLines = [
    `Customer ${verb} their quote`,
    `Customer: ${params.customerName}`,
    `Job: ${params.cleaningType} in ${params.customerCity}`,
  ];
  if (params.comments) bodyLines.push(`Comments: ${params.comments}`);
  bodyLines.push(`View: ${adminUrl}`);
  const messageBody = bodyLines.join("\n");

  const notifications: Promise<void>[] = [
    (async () => {
      const resend = getResendClient();
      const toEmail = process.env.NOTIFICATION_EMAIL;
      const fromEmail = process.env.EMAIL_FROM || "Quote Notifications <onboarding@resend.dev>";
      if (!toEmail) throw new Error("NOTIFICATION_EMAIL is not configured.");

      const html = `
        <p>Customer ${verb} their quote</p>
        <ul>
          <li><strong>Customer:</strong> ${escapeHtml(params.customerName)}</li>
          <li><strong>Job:</strong> ${escapeHtml(params.cleaningType)} in ${escapeHtml(params.customerCity)}</li>
          ${params.comments ? `<li><strong>Comments:</strong> ${escapeHtml(params.comments)}</li>` : ""}
        </ul>
        <p><a href="${escapeHtml(adminUrl)}">View the request in the admin dashboard</a></p>
      `;

      const { error } = await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        subject: params.decision === "accepted" ? "Customer Accepted Quote" : "Customer Declined Quote",
        text: messageBody,
        html,
      });
      if (error) {
        throw new Error(
          `${error.message ?? "Unknown Resend error."} (NOTIFICATION_EMAIL="${toEmail}", EMAIL_FROM="${fromEmail}")`
        );
      }
    })(),
  ];

  // SMS only on acceptance — decline is email-only, per spec.
  if (params.decision === "accepted") {
    notifications.push(sendSms(messageBody));
  }

  const results = await Promise.allSettled(notifications);
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("[customer-quote] Failed to send admin notification:", result.reason);
    }
  });
}

// Keeps a linked CRM lead's stage in sync with the customer's response, so
// agents never have to manually enter the outcome. Uses the service-role
// client because this route has no CRM user session (it's a public,
// token-gated page) - crm_leads has no anonymous RLS policy, so this is
// the only way to write here, same as every other write in this file.
// Never blocks the customer's accept/decline on a sync failure.
async function syncCrmLeadOnCustomerResponse(quoteRequestId: string, decision: Decision) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: lead } = await supabase
      .from("crm_leads")
      .select("id")
      .eq("quote_request_id", quoteRequestId)
      .maybeSingle();

    if (!lead) return;

    const stage = decision === "accepted" ? "Customer accepted" : "Customer declined";

    const { error: leadError } = await supabase
      .from("crm_leads")
      .update({ stage })
      .eq("id", lead.id);

    if (leadError) {
      console.error("[customer-quote] Failed to sync CRM lead stage:", leadError);
      return;
    }

    await supabase.from("crm_activities").insert({
      lead_id: lead.id,
      agent_id: null,
      activity_type: "outcome",
      notes: `Customer ${decision} the quote (synced automatically).`,
    });
  } catch (err) {
    console.error("[customer-quote] Failed to sync CRM lead:", err);
  }
}

export async function respondToCustomerQuoteAction(
  token: string,
  decision: Decision,
  comments: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  const tokenHash = hashProviderToken(token);

  const { data: tokenRow } = await supabase
    .from("customer_quote_tokens")
    .select("id, quote_request_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || !isTokenActive(tokenRow)) {
    return { ok: false, error: "This quote is no longer available." };
  }

  const { data: request } = await supabase
    .from("quote_requests")
    .select("status, full_name, city, cleaning_type, customer_response")
    .eq("id", tokenRow.quote_request_id)
    .maybeSingle();

  if (!request) {
    return { ok: false, error: "This quote is no longer available." };
  }

  if (request.customer_response) {
    return { ok: false, error: "You've already responded to this quote." };
  }

  if (request.status !== "Sent to Customer") {
    return { ok: false, error: "This quote is no longer available." };
  }

  const trimmedComments = comments.trim().slice(0, 2000) || null;

  const { error: updateError } = await supabase
    .from("quote_requests")
    .update({
      status: decision === "accepted" ? "Customer Accepted" : "Customer Declined",
      customer_response: decision,
      customer_response_at: new Date().toISOString(),
      customer_response_comments: trimmedComments,
    })
    .eq("id", tokenRow.quote_request_id);

  if (updateError) {
    console.error("[customer-quote] Failed to record response:", updateError);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  await syncCrmLeadOnCustomerResponse(tokenRow.quote_request_id, decision);

  await notifyAdminOfCustomerResponse({
    decision,
    customerName: request.full_name,
    customerCity: request.city,
    cleaningType: request.cleaning_type,
    comments: trimmedComments,
    quoteRequestId: tokenRow.quote_request_id,
  });

  return { ok: true };
}
