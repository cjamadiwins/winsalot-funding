import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderDuplicateMatch } from "./provider-types";
import { getSupabaseAdmin } from "./supabase-admin";

// Strips characters that would otherwise be parsed as PostgREST .or()
// filter/value delimiters instead of literal search text - same
// sanitization already used by searchQuoteRequestsAction
// (src/app/admin/(dashboard)/crm/leads/[id]/actions.ts).
function sanitizeForFilter(value: string): string {
  return value.replace(/[,()]/g, "");
}

// Duplicate-prevention check (section 12 of the Provider Acquisition
// brief): before a new provider lead is created, look for an existing
// record matching the same business name, phone, or email. Not a hard
// block - the caller decides whether to surface a warning and let the
// agent/admin either open the existing record or proceed anyway.
export async function findProviderDuplicates(
  supabase: SupabaseClient,
  input: { businessName?: string; email?: string | null; phone?: string | null },
  excludeId?: string
): Promise<ProviderDuplicateMatch[]> {
  const businessName = input.businessName ? sanitizeForFilter(input.businessName.trim()) : "";
  const email = input.email ? sanitizeForFilter(input.email.trim()) : "";
  const phone = input.phone ? sanitizeForFilter(input.phone.trim()) : "";

  const filters: string[] = [];
  if (businessName) filters.push(`business_name.ilike.%${businessName}%`);
  if (email) filters.push(`email.ilike.%${email}%`);
  if (phone) filters.push(`phone.ilike.%${phone}%`);
  if (filters.length === 0) return [];

  let query = supabase
    .from("provider_leads")
    .select("id, business_name, contact_person, phone, email, city, status")
    .or(filters.join(","))
    .limit(5);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as ProviderDuplicateMatch[];
}

// Matches an approved Provider Acquisition lead against an existing
// operational provider (cleaning_providers) by email, then phone, then
// business name - same precedence as findMatchingProviderLead in
// provider-intake-submission.ts. Used by the "Approve and Add to
// Providers" action (lib/provider-approval.ts) to decide whether to
// update an existing cleaning_providers row or create a new one,
// preventing a duplicate operational provider for the same real
// business. Always uses the service-role client since matching must see
// every cleaning_providers row (RLS scopes an agent's own session to only
// their assigned providers).
export async function findCleaningProviderMatch(input: {
  businessName: string;
  email: string | null;
  phone: string;
}): Promise<{ id: string } | null> {
  const admin = getSupabaseAdmin();

  const email = input.email?.trim();
  if (email) {
    const { data } = await admin
      .from("cleaning_providers")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string };
  }

  const phoneDigits = input.phone.replace(/\D/g, "");
  if (phoneDigits.length >= 7) {
    const last10 = phoneDigits.slice(-10);
    const { data } = await admin
      .from("cleaning_providers")
      .select("id")
      .ilike("phone", `%${last10}%`)
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string };
  }

  const businessName = input.businessName.trim();
  if (businessName) {
    const { data } = await admin
      .from("cleaning_providers")
      .select("id")
      .ilike("company_name", businessName)
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string };
  }

  return null;
}
