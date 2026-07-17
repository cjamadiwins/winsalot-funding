"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashProviderToken } from "@/lib/tokens";
import { sendSms } from "@/lib/twilio";
import { getResendClient } from "@/lib/resend";
import { getSiteUrl } from "@/lib/site-url";
import { escapeHtml } from "@/lib/html";

const PRICE_TYPES = ["hourly", "per_visit", "weekly", "monthly", "one_time"] as const;

function toNullableNumber(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

async function notifyAdminOfProviderQuote(params: {
  companyName: string;
  customerName: string;
  customerCity: string;
  cleaningType: string;
  price: number;
  priceType: string;
  quoteRequestId: string;
}) {
  const adminUrl = `${getSiteUrl()}/admin/requests/${params.quoteRequestId}`;

  const smsBody = [
    "New provider quote submitted",
    `Provider: ${params.companyName}`,
    `Customer: ${params.customerName}`,
    `Job: ${params.cleaningType} in ${params.customerCity}`,
    `Price: $${params.price} (${params.priceType})`,
    `View: ${adminUrl}`,
  ].join("\n");

  const results = await Promise.allSettled([
    sendSms(smsBody),
    (async () => {
      const resend = getResendClient();
      const toEmail = process.env.NOTIFICATION_EMAIL;
      const fromEmail = process.env.EMAIL_FROM || "Quote Notifications <onboarding@resend.dev>";
      if (!toEmail) throw new Error("NOTIFICATION_EMAIL is not configured.");

      const html = `
        <p>New provider quote submitted</p>
        <ul>
          <li><strong>Provider:</strong> ${escapeHtml(params.companyName)}</li>
          <li><strong>Customer:</strong> ${escapeHtml(params.customerName)}</li>
          <li><strong>Job:</strong> ${escapeHtml(params.cleaningType)} in ${escapeHtml(params.customerCity)}</li>
          <li><strong>Price:</strong> $${params.price} (${escapeHtml(params.priceType)})</li>
        </ul>
        <p><a href="${escapeHtml(adminUrl)}">View the request in the admin dashboard</a></p>
      `;

      const { error } = await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        subject: "Provider Quote Received",
        text: smsBody,
        html,
      });
      if (error) throw new Error(error.message ?? "Unknown Resend error.");
    })(),
  ]);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("[provider-quote] Failed to send admin notification:", result.reason);
    }
  });
}

export async function submitProviderQuoteAction(
  token: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  const tokenHash = hashProviderToken(token);

  // Never trust a request/provider ID from the client — always re-derive
  // the scope from the server-side token lookup, same as the page itself.
  const { data: tokenRow } = await supabase
    .from("provider_quote_tokens")
    .select("id, quote_request_id, provider_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (
    !tokenRow ||
    tokenRow.revoked_at ||
    new Date(tokenRow.expires_at).getTime() < Date.now()
  ) {
    return { ok: false, error: "This link is no longer valid." };
  }

  const { data: existing } = await supabase
    .from("provider_quote_submissions")
    .select("id")
    .eq("token_id", tokenRow.id)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: "A quote has already been submitted for this request." };
  }

  const priceRaw = String(formData.get("price") ?? "").trim();
  const priceType = String(formData.get("priceType") ?? "").trim();
  const price = Number(priceRaw);

  if (!priceRaw || Number.isNaN(price) || price < 0) {
    return { ok: false, error: "Please enter a valid price." };
  }
  if (!PRICE_TYPES.includes(priceType as (typeof PRICE_TYPES)[number])) {
    return { ok: false, error: "Please select a price type." };
  }

  const { error: insertError } = await supabase.from("provider_quote_submissions").insert({
    quote_request_id: tokenRow.quote_request_id,
    provider_id: tokenRow.provider_id,
    token_id: tokenRow.id,
    price,
    price_type: priceType,
    estimated_hours: toNullableNumber(formData.get("estimatedHours")),
    travel_charge: toNullableNumber(formData.get("travelCharge")),
    additional_charges: toNullableNumber(formData.get("additionalCharges")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (insertError) {
    console.error("[provider-quote] Failed to save submission:", insertError);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  await supabase
    .from("quote_requests")
    .update({ status: "provider_quote_received" })
    .eq("id", tokenRow.quote_request_id);

  const [{ data: provider }, { data: request }] = await Promise.all([
    supabase
      .from("cleaning_providers")
      .select("company_name")
      .eq("id", tokenRow.provider_id)
      .maybeSingle(),
    supabase
      .from("quote_requests")
      .select("full_name, city, cleaning_type")
      .eq("id", tokenRow.quote_request_id)
      .maybeSingle(),
  ]);

  await notifyAdminOfProviderQuote({
    companyName: provider?.company_name ?? "A provider",
    customerName: request?.full_name ?? "A customer",
    customerCity: request?.city ?? "",
    cleaningType: request?.cleaning_type ?? "",
    price,
    priceType,
    quoteRequestId: tokenRow.quote_request_id,
  });

  return { ok: true };
}
