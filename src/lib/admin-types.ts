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
