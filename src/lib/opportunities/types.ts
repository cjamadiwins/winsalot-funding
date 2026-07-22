export type OpportunityType =
  | "rfp_tender"
  | "quote_request"
  | "hiring_signal"
  | "new_location"
  | "other";

export const OPPORTUNITY_TYPES: OpportunityType[] = [
  "rfp_tender",
  "quote_request",
  "hiring_signal",
  "new_location",
  "other",
];

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  rfp_tender: "Public RFP / Tender",
  quote_request: "Quote / Proposal Request",
  hiring_signal: "Cleaning Hiring Signal",
  new_location: "New Commercial Location",
  other: "Other Signal",
};

export const OPPORTUNITY_STATUSES = [
  "New",
  "Reviewing",
  "Assigned",
  "Contacted",
  "Follow-up",
  "Quote requested",
  "Converted",
  "Not suitable",
  "Expired",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_STATUS_STYLES: Record<OpportunityStatus, string> = {
  New: "bg-slate-100 text-slate-700",
  Reviewing: "bg-sky-100 text-sky-800",
  Assigned: "bg-indigo-100 text-indigo-800",
  Contacted: "bg-amber-100 text-amber-800",
  "Follow-up": "bg-orange-100 text-orange-800",
  "Quote requested": "bg-purple-100 text-purple-800",
  Converted: "bg-emerald-100 text-emerald-800",
  "Not suitable": "bg-slate-200 text-slate-600",
  Expired: "bg-rose-100 text-rose-800",
};

export type IntentLevel = "Hot" | "Warm" | "Research";

export const INTENT_LEVEL_STYLES: Record<IntentLevel, string> = {
  Hot: "bg-rose-100 text-rose-800",
  Warm: "bg-amber-100 text-amber-800",
  Research: "bg-slate-100 text-slate-600",
};

export type Province = "BC" | "ON";

// The full persisted record - matches supabase/migrations/0012_active_cleaning_opportunities.sql.
export type ActiveCleaningOpportunityRow = {
  id: string;
  organization_name: string | null;
  opportunity_title: string;
  description: string | null;
  opportunity_type: OpportunityType;
  service_needed: string | null;
  city: string | null;
  province: Province | null;
  contact_name: string | null;
  public_email: string | null;
  public_phone: string | null;
  website: string | null;
  source_name: string;
  source_url: string;
  date_posted: string | null;
  deadline: string | null;
  date_discovered: string;
  intent_score: number;
  intent_level: IntentLevel;
  status: OpportunityStatus;
  assigned_agent: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// What a connector hands back, before scoring/dedupe/persistence. Every
// field a connector can't determine from its source is left undefined -
// scoring and the dashboard both treat a missing field as "unknown", never
// as a false negative signal.
export type OpportunityCandidate = {
  organization_name?: string | null;
  opportunity_title: string;
  description?: string | null;
  opportunity_type: OpportunityType;
  service_needed?: string | null;
  city?: string | null;
  province?: Province | null;
  contact_name?: string | null;
  public_email?: string | null;
  public_phone?: string | null;
  website?: string | null;
  source_name: string;
  source_url: string;
  date_posted?: string | null; // ISO date (yyyy-mm-dd)
  deadline?: string | null; // ISO date (yyyy-mm-dd)
};

// One connector's outcome for a single run. `error` is set (and
// `candidates` left empty) when the connector failed for any reason - the
// orchestrator logs it and moves on to the next connector rather than
// aborting the whole run, per the "a broken source does not stop the
// entire search" requirement.
export type ConnectorResult = {
  source_name: string;
  candidates: OpportunityCandidate[];
  error?: string;
};

export type Connector = {
  sourceName: string;
  run: () => Promise<ConnectorResult>;
};
