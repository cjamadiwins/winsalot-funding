"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generateProviderToken, hashProviderToken } from "@/lib/tokens";

const PRICE_TYPES = ["hourly", "per_visit", "weekly", "monthly", "one_time"] as const;

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
      status: "assigned",
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

export async function saveCustomerQuoteAction(requestId: string, formData: FormData) {
  await requireAdminUser();

  const priceRaw = String(formData.get("price") ?? "").trim();
  const priceType = String(formData.get("priceType") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();

  const price = priceRaw ? Number(priceRaw) : null;
  if (priceRaw && (Number.isNaN(price) || (price ?? 0) < 0)) {
    throw new Error("Price must be a valid non-negative number.");
  }
  if (priceType && !PRICE_TYPES.includes(priceType as (typeof PRICE_TYPES)[number])) {
    throw new Error("Invalid price type.");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("quote_requests")
    .update({
      customer_quote_price: price,
      customer_quote_price_type: priceType || null,
      customer_quote_summary: summary || null,
    })
    .eq("id", requestId);

  if (error) throw new Error("Failed to save the customer quote.");

  revalidatePath(`/admin/requests/${requestId}`);
}

export async function approveCustomerQuoteAction(requestId: string) {
  await requireAdminUser();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("quote_requests")
    .update({
      customer_quote_approved_at: new Date().toISOString(),
      status: "quote_approved",
    })
    .eq("id", requestId);

  if (error) throw new Error("Failed to approve the quote.");

  revalidatePath(`/admin/requests/${requestId}`);
}

export async function markQuoteSentAction(requestId: string) {
  await requireAdminUser();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("quote_requests")
    .update({ customer_quote_sent_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) throw new Error("Failed to mark the quote as sent.");

  revalidatePath(`/admin/requests/${requestId}`);
}
