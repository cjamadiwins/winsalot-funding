import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";

// Provider Profile's "Quote History" section. quote_requests/
// cleaning_providers (the private admin quote-assignment system, migration
// 0004) has always been a completely separate table from provider_leads
// (Provider Acquisition, migration 0026) - this reads across the two only
// once an administrator has explicitly linked them via
// provider_leads.cleaning_provider_id (migration 0028). Nothing about
// either system's own tables, policies, or behavior changes here; this is
// a read-only join for display.
export type ProviderQuoteHistoryRow = {
  id: string;
  customerName: string;
  city: string;
  quoteRequestDate: string;
  quoteSentAt: string | null;
  quoteValue: number | null;
  finalStatus: string;
  accepted: boolean;
  declined: boolean;
  expired: boolean;
};

export async function getProviderQuoteHistory(cleaningProviderId: string | null): Promise<ProviderQuoteHistoryRow[]> {
  if (!cleaningProviderId) return [];

  const admin = getSupabaseAdmin();
  const { data: requests } = await admin
    .from("quote_requests")
    .select("id, full_name, city, created_at, status, customer_quote_price, customer_quote_sent_at, quote_expires_at")
    .eq("assigned_provider_id", cleaningProviderId)
    .order("created_at", { ascending: false });

  if (!requests || requests.length === 0) return [];

  const ids = requests.map((r) => r.id as string);
  const { data: submissions } = await admin
    .from("provider_quote_submissions")
    .select("quote_request_id")
    .in("quote_request_id", ids);
  const submittedIds = new Set((submissions ?? []).map((s) => s.quote_request_id as string));

  return requests.map((r) => {
    const hasSubmission = submittedIds.has(r.id as string);
    const accepted = r.status === "Customer Accepted";
    const declined = r.status === "Customer Declined";
    const expired =
      !accepted &&
      !declined &&
      Boolean(r.quote_expires_at) &&
      new Date(r.quote_expires_at as string).getTime() < Date.now();

    let finalStatus: string;
    if (accepted) finalStatus = "Accepted";
    else if (declined) finalStatus = "Declined";
    else if (expired) finalStatus = "Expired";
    else if (r.status === "Sent to Customer") finalStatus = "Sent to Customer — Awaiting Response";
    else if (r.status === "Approved") finalStatus = "Approved — Not Yet Sent";
    else if (hasSubmission) finalStatus = "Quote Submitted — Pending Review";
    else if (r.status === "Sent to Provider") finalStatus = "Awaiting Provider Quote";
    else finalStatus = r.status as string;

    return {
      id: r.id as string,
      customerName: r.full_name as string,
      city: r.city as string,
      quoteRequestDate: r.created_at as string,
      quoteSentAt: (r.customer_quote_sent_at as string) ?? null,
      quoteValue: (r.customer_quote_price as number) ?? null,
      finalStatus,
      accepted,
      declined,
      expired,
    };
  });
}
