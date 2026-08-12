"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generateProviderToken, hashProviderToken } from "@/lib/tokens";
import { getResendClient } from "@/lib/resend";
import { getSiteUrl } from "@/lib/site-url";
import { PRICE_TYPE_LABELS, QUOTE_INCENTIVE_STATUSES, type PriceType, type QuoteIncentiveStatus } from "@/lib/admin-types";
import {
  buildCustomerQuoteEmailHtml,
  buildCustomerQuoteEmailText,
} from "@/lib/customer-quote-email";

const PRICE_TYPES = ["hourly", "per_visit", "weekly", "monthly", "one_time"] as const;
const DEFAULT_EXPIRES_IN_DAYS = 7;

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

export async function assignProviderAction(requestId: string, providerId: string) {
  await requireAdminUser();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("quote_requests")
    .update({
      assigned_provider_id: providerId,
      assigned_at: new Date().toISOString(),
      status: "Sent to Provider",
    })
    .eq("id", requestId);

  if (error) throw new Error("Failed to assign provider.");

  revalidatePath(`/admin/requests/${requestId}`);
}

export async function createProviderAndAssignAction(requestId: string, formData: FormData) {
  await requireAdminUser();

  const companyName = String(formData.get("companyName") ?? "").trim();
  if (!isNonEmptyString(companyName, 200)) {
    throw new Error("Company name is required.");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("cleaning_providers")
    .insert({
      company_name: companyName,
      contact_person: String(formData.get("contactPerson") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      service_locations: String(formData.get("serviceLocations") ?? "").trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("Failed to create provider.");

  await assignProviderAction(requestId, data.id);
}

export async function generateProviderLinkAction(
  requestId: string,
  providerId: string
): Promise<{ path: string }> {
  await requireAdminUser();

  const supabase = getSupabaseAdmin();
  const token = generateProviderToken();

  const { error } = await supabase.from("provider_quote_tokens").insert({
    quote_request_id: requestId,
    provider_id: providerId,
    token_hash: hashProviderToken(token),
  });

  if (error) throw new Error("Failed to generate provider link.");

  revalidatePath(`/admin/requests/${requestId}`);

  return { path: `/provider-quote/${token}` };
}

export async function revokeProviderLinkAction(tokenId: string, requestId: string) {
  await requireAdminUser();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("provider_quote_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId);

  if (error) throw new Error("Failed to revoke provider link.");

  revalidatePath(`/admin/requests/${requestId}`);
}

// Review + edit + approve. This never sends anything to the customer — it
// only records what Winsalot Corp has approved. Sending is a deliberate,
// separate step (sendQuoteToCustomerAction) so approving alone can never
// result in an email going out.
export async function approveCustomerQuoteAction(requestId: string, formData: FormData) {
  await requireAdminUser();

  const providerName = String(formData.get("providerName") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const priceType = String(formData.get("priceType") ?? "").trim();

  const price = Number(priceRaw);
  if (!priceRaw || Number.isNaN(price) || price < 0) {
    throw new Error("Price must be a valid non-negative number.");
  }
  if (!PRICE_TYPES.includes(priceType as (typeof PRICE_TYPES)[number])) {
    throw new Error("Please select a valid price type.");
  }
  if (!providerName) {
    throw new Error("Provider name (shown to the customer) is required.");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("quote_requests")
    .update({
      customer_quote_price: price,
      customer_quote_price_type: priceType,
      customer_quote_summary: summary || null,
      customer_quote_provider_name: providerName,
      customer_quote_notes: notes || null,
      customer_quote_approved_at: new Date().toISOString(),
      status: "Approved",
    })
    .eq("id", requestId);

  if (error) throw new Error("Failed to approve the quote.");

  revalidatePath(`/admin/requests/${requestId}`);
}

// The only code path that ever emails the customer. Only reachable once a
// quote has been explicitly approved (status === "Approved").
export async function sendQuoteToCustomerAction(
  requestId: string,
  expiresInDaysRaw: number
): Promise<{ path: string }> {
  await requireAdminUser();

  const supabase = getSupabaseAdmin();
  const { data: request, error: fetchError } = await supabase
    .from("quote_requests")
    .select(
      "email, full_name, city, cleaning_type, property_type, status, customer_quote_price, customer_quote_price_type, customer_quote_provider_name, customer_quote_notes"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !request) throw new Error("Failed to load the request.");
  if (request.status !== "Approved") {
    throw new Error("The quote must be approved before it can be sent.");
  }
  if (!request.email) {
    throw new Error("This customer has no email address on file — the quote can't be sent.");
  }
  if (
    request.customer_quote_price == null ||
    !request.customer_quote_price_type ||
    !request.customer_quote_provider_name
  ) {
    throw new Error("The approved quote is missing required fields. Please approve it again.");
  }

  const expiresInDays =
    Number.isFinite(expiresInDaysRaw) && expiresInDaysRaw > 0
      ? expiresInDaysRaw
      : DEFAULT_EXPIRES_IN_DAYS;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const token = generateProviderToken();
  const { error: tokenError } = await supabase.from("customer_quote_tokens").insert({
    quote_request_id: requestId,
    token_hash: hashProviderToken(token),
    expires_at: expiresAt,
  });

  if (tokenError) throw new Error("Failed to generate the customer link.");

  // Customer-facing quote emails must always appear to come from Winsalot
  // Corp's own address, never a per-purpose alias, unless an admin
  // explicitly configures one later via EMAIL_FROM.
  const siteUrl = getSiteUrl();
  const acceptUrl = `${siteUrl}/customer-quote/${token}`;
  const declineUrl = `${siteUrl}/customer-quote/${token}?action=decline`;
  const priceTypeLabel =
    PRICE_TYPE_LABELS[request.customer_quote_price_type as PriceType] ??
    request.customer_quote_price_type;

  const emailParams = {
    customerName: request.full_name,
    cleaningType: request.cleaning_type,
    propertyType: request.property_type,
    city: request.city,
    price: request.customer_quote_price,
    priceTypeLabel,
    providerName: request.customer_quote_provider_name,
    notes: request.customer_quote_notes,
    acceptUrl,
    declineUrl,
    expiresAt,
  };

  const resend = getResendClient();
  const fromEmail =
    process.env.CUSTOMER_QUOTE_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    "Winsalot Corp <info@winsalotcorp.com>";
  const replyToEmail = process.env.EMAIL_REPLY_TO || "info@winsalotcorp.com";
  const { error: emailError } = await resend.emails.send({
    from: fromEmail,
    to: request.email,
    replyTo: replyToEmail,
    subject: "Your Cleaning Quote Is Ready",
    text: buildCustomerQuoteEmailText(emailParams),
    html: buildCustomerQuoteEmailHtml(emailParams),
  });

  if (emailError) {
    throw new Error(
      `Failed to send the quote email: ${emailError.message ?? "Unknown Resend error."}`
    );
  }

  const { error: updateError } = await supabase
    .from("quote_requests")
    .update({
      status: "Sent to Customer",
      customer_quote_sent_at: new Date().toISOString(),
      quote_expires_at: expiresAt,
    })
    .eq("id", requestId);

  if (updateError) {
    throw new Error("The quote email was sent, but the request status failed to update.");
  }

  revalidatePath(`/admin/requests/${requestId}`);

  return { path: `/customer-quote/${token}` };
}

// Weekly Incentive qualification review (brief: "Admin must be able to
// verify or reject the qualifying records") - sets quote_requests.
// incentive_status, entirely separate from the `status` pipeline column
// above (see migration 0058's header comment for why). Uses
// requireAdminUser(), the same guard every other action in this file
// already uses, and the service-role client, since quote_requests has
// RLS enabled with zero policies (migration 0004) - no session client
// can read or write it at all. Throws on failure, matching every other
// action in this file (RequestWorkflowPanel's runAction() catches it).
export async function setQuoteIncentiveStatusAction(requestId: string, formData: FormData): Promise<void> {
  const user = await requireAdminUser();

  const raw = String(formData.get("incentive_status") ?? "").trim();
  if (raw && !QUOTE_INCENTIVE_STATUSES.includes(raw as QuoteIncentiveStatus)) {
    throw new Error("Invalid incentive status.");
  }
  const incentiveStatus: QuoteIncentiveStatus | null = raw ? (raw as QuoteIncentiveStatus) : null;

  // Brief: "Reject invalid records using a required reason." Only
  // required when the record is being marked as something other than
  // Qualified (i.e. rejected) - a plain Qualified marking, or clearing
  // back to unreviewed, never needs one.
  const incentiveStatusReasonRaw = String(formData.get("incentive_status_reason") ?? "").trim() || null;
  if (incentiveStatus && incentiveStatus !== "Qualified" && !incentiveStatusReasonRaw) {
    throw new Error("A reason is required when marking a quote as anything other than Qualified.");
  }
  const incentiveStatusReason = incentiveStatus && incentiveStatus !== "Qualified" ? incentiveStatusReasonRaw : null;

  const supabase = getSupabaseAdmin();

  // incentive_status_set_by references crm_users(id) - only fill it in
  // when this admin also happens to have a crm_users row; the column is
  // nullable precisely because this quote dashboard's admins
  // (requireAdminUser()) aren't required to have one.
  const { data: crmUser } = await supabase.from("crm_users").select("id").eq("id", user.id).maybeSingle();

  const { error } = await supabase
    .from("quote_requests")
    .update({
      incentive_status: incentiveStatus,
      incentive_status_reason: incentiveStatusReason,
      incentive_status_set_by: crmUser?.id ?? null,
      incentive_status_set_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) throw new Error("Failed to update the incentive review status.");

  revalidatePath(`/admin/requests/${requestId}`);
  revalidatePath("/admin/crm/incentives");
}
