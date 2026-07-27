import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderDuplicateMatch } from "./provider-types";

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
