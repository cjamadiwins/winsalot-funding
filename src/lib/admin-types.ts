export type QuoteRequestRow = {
  id: string;
  created_at: string;
  full_name: string;
  phone: string;
  email: string | null;
  city: string;
  service_address: string | null;
  property_type: string;
  cleaning_type: string;
  bedrooms: string | null;
  bathrooms: string | null;
  property_size: string | null;
  preferred_date: string | null;
  service_frequency: string | null;
  preferred_contact_method: string | null;
  description: string;
  consent_to_contact: boolean;
  status: string;
  source: string;
  assigned_provider_id: string | null;
  assigned_at: string | null;
  customer_quote_price: number | null;
  customer_quote_price_type: string | null;
  customer_quote_summary: string | null;
  customer_quote_approved_at: string | null;
  customer_quote_sent_at: string | null;
  customer_quote_provider_name: string | null;
  customer_quote_notes: string | null;
  quote_expires_at: string | null;
  customer_response: "accepted" | "declined" | null;
  customer_response_at: string | null;
  customer_response_comments: string | null;
  // Weekly Incentive qualification review state (supabase/migrations/
  // 0058_crm_quote_incentive_status.sql) - a separate axis from `status`
  // above. Only a quote with customer_quote_sent_at set *and*
  // incentive_status = 'Qualified' counts toward the sending agent's
  // Weekly Incentive quota - see lib/crm-incentives.ts. Null means "not
  // yet reviewed", same non-counting effect as any other listed value.
  incentive_status: QuoteIncentiveStatus | null;
  incentive_status_set_by: string | null;
  incentive_status_set_at: string | null;
  // Mandatory reason when incentive_status is anything other than
  // Qualified (migration 0062) - null for Qualified or unreviewed.
  incentive_status_reason: string | null;
};

export const QUOTE_INCENTIVE_STATUSES = ["Qualified", "Draft", "Cancelled", "Invalid", "Duplicate", "Test"] as const;
export type QuoteIncentiveStatus = (typeof QUOTE_INCENTIVE_STATUSES)[number];

export const QUOTE_INCENTIVE_STATUS_STYLES: Record<QuoteIncentiveStatus, string> = {
  Qualified: "bg-emerald-100 text-emerald-800",
  Draft: "bg-slate-100 text-slate-600",
  Cancelled: "bg-slate-200 text-slate-500",
  Invalid: "bg-rose-100 text-rose-800",
  Duplicate: "bg-amber-100 text-amber-800",
  Test: "bg-amber-100 text-amber-800",
};

// Shown for a null incentive_status (not yet reviewed by an admin).
export const QUOTE_INCENTIVE_PENDING_LABEL = "Not Reviewed";
export const QUOTE_INCENTIVE_PENDING_STYLE = "bg-slate-100 text-slate-600";

// The 8-stage customer quote approval pipeline. quote_requests.status has no
// CHECK constraint (see migration 0004's comment), so this is purely a
// display convention — earlier rows may still hold the older lowercase
// values ("new", "assigned", "provider_quote_received", "quote_approved")
// and are shown via the raw-string fallback wherever these maps are used.
export const QUOTE_STATUSES = [
  "Request Submitted",
  "Sent to Provider",
  "Awaiting Winsalot Approval",
  "Approved",
  "Sent to Customer",
  "Customer Accepted",
  "Customer Declined",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  "Request Submitted": "Request Submitted",
  "Sent to Provider": "Sent to Provider",
  "Awaiting Winsalot Approval": "Awaiting Winsalot Approval",
  Approved: "Approved",
  "Sent to Customer": "Sent to Customer",
  "Customer Accepted": "Customer Accepted",
  "Customer Declined": "Customer Declined",
};

export const QUOTE_STATUS_STYLES: Record<QuoteStatus, string> = {
  "Request Submitted": "bg-slate-100 text-slate-700",
  "Sent to Provider": "bg-amber-100 text-amber-800",
  "Awaiting Winsalot Approval": "bg-sky-100 text-sky-800",
  Approved: "bg-indigo-100 text-indigo-800",
  "Sent to Customer": "bg-purple-100 text-purple-800",
  "Customer Accepted": "bg-emerald-100 text-emerald-800",
  "Customer Declined": "bg-rose-100 text-rose-800",
};

export type ProviderStatus = "active" | "inactive";

export type ProviderRow = {
  id: string;
  created_at: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  service_locations: string | null;
  pricing_notes: string | null;
  internal_notes: string | null;
  status: ProviderStatus;
};

export type ProviderQuoteTokenRow = {
  id: string;
  created_at: string;
  quote_request_id: string;
  provider_id: string;
  expires_at: string;
  revoked_at: string | null;
  viewed_at: string | null;
};

// Pulled out into a plain helper (rather than inlined in a component body)
// so the `Date.now()` call doesn't trip the react-hooks/purity rule, which
// flags impure calls made directly inside component/page functions. This
// is a display-only check — the server actions that actually accept a
// provider's quote re-validate the token independently.
export function isTokenActive(token: { revoked_at: string | null; expires_at: string }): boolean {
  return !token.revoked_at && new Date(token.expires_at).getTime() > Date.now();
}

export type PriceType = "hourly" | "per_visit" | "weekly" | "monthly" | "one_time";

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  hourly: "Hourly",
  per_visit: "Per visit",
  weekly: "Weekly",
  monthly: "Monthly",
  one_time: "One-time total",
};

export type ProviderQuoteSubmissionRow = {
  id: string;
  created_at: string;
  quote_request_id: string;
  provider_id: string;
  price: number;
  price_type: PriceType;
  estimated_hours: number | null;
  travel_charge: number | null;
  additional_charges: number | null;
  notes: string | null;
};

export type CustomerQuoteTokenRow = {
  id: string;
  created_at: string;
  quote_request_id: string;
  expires_at: string;
  revoked_at: string | null;
  viewed_at: string | null;
};
