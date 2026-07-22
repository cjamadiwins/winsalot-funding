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

// Full status list. 'Reviewing' and 'Assigned' are admin/system stages (an
// admin triaging a new record, or the system marking it Assigned the
// moment an agent is set) - the other eight are exactly the agent-facing
// status list from the brief, and are the *only* ones an agent can set
// (enforced in the database too - see migration 0012's
// active_cleaning_opportunities_restrict_agent_edits trigger).
export const OPPORTUNITY_STATUSES = [
  "New",
  "Reviewing",
  "Assigned",
  "Contacted",
  "No answer",
  "Follow-up required",
  "Quote requested",
  "Converted",
  "Not suitable",
  "Expired",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const AGENT_SETTABLE_OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  "New",
  "Contacted",
  "No answer",
  "Follow-up required",
  "Quote requested",
  "Converted",
  "Not suitable",
  "Expired",
];

export const ADMIN_ONLY_OPPORTUNITY_STATUSES: OpportunityStatus[] = ["Reviewing", "Assigned"];

export const OPPORTUNITY_STATUS_STYLES: Record<OpportunityStatus, string> = {
  New: "bg-slate-100 text-slate-700",
  Reviewing: "bg-sky-100 text-sky-800",
  Assigned: "bg-indigo-100 text-indigo-800",
  Contacted: "bg-amber-100 text-amber-800",
  "No answer": "bg-orange-100 text-orange-800",
  "Follow-up required": "bg-orange-100 text-orange-800",
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

// The full persisted record - matches
// supabase/migrations/0012_active_cleaning_opportunities.sql.
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
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  // The strong cleaning-specific phrase(s) that got this record accepted
  // (see src/lib/opportunities/cleaning-relevance.ts), and a short
  // human-readable reason. Both null for any row inserted before this
  // filter existed - see migration 0015.
  matched_cleaning_terms: string[] | null;
  accepted_reason: string | null;
  created_at: string;
  updated_at: string;
};

// crm_activities row scoped to an opportunity (opportunity_id set, lead_id
// null) - see migration 0013. Deliberately a separate type from the
// existing CrmActivityRow (crm-types.ts) rather than widening that one:
// every existing lead-focused query/component keeps assuming lead_id is
// always present, exactly as before, since it only ever fetches rows
// filtered to lead_id is not null.
export type OpportunityActivityRow = {
  id: string;
  created_at: string;
  opportunity_id: string;
  agent_id: string | null;
  activity_type: "call" | "email" | "text" | "voicemail" | "note" | "outcome";
  notes: string | null;
  occurred_at: string;
  next_follow_up_at: string | null;
};

// crm_followups row scoped to an opportunity - same rationale as above.
export type OpportunityFollowUpRow = {
  id: string;
  created_at: string;
  opportunity_id: string;
  scheduled_by: string | null;
  scheduled_at: string;
  note: string | null;
  status: "pending" | "completed";
  completed_at: string | null;
  completed_by: string | null;
};

export type OpportunityAuditAction =
  | "created"
  | "edited"
  | "assigned"
  | "reassigned"
  | "unassigned"
  | "status_changed"
  | "archived"
  | "restored"
  | "deleted"
  | "merged";

export type OpportunityAuditLogRow = {
  id: string;
  created_at: string;
  opportunity_id: string | null;
  opportunity_title_snapshot: string;
  actor_id: string | null;
  action: OpportunityAuditAction;
  details: string | null;
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
  // Set by every connector via evaluateCleaningRelevance() before a
  // candidate is ever returned - a candidate that didn't pass that check
  // is never included in a connector's `candidates` array in the first
  // place (see `rejected` on ConnectorResult instead).
  matched_cleaning_terms: string[];
  accepted_reason: string;
};

// A candidate a connector found (it mentioned at least one strong
// cleaning-related phrase somewhere) but did not ultimately accept - kept
// only for the run summary (candidates found/accepted/rejected, with
// reasons), never persisted to the database and never shown in the normal
// CRM list. A record that never mentions any cleaning-related phrase at
// all (the overwhelming majority of any tender feed - road paving,
// vehicle supply, etc.) isn't a "candidate" in the first place and isn't
// counted here at all, so this count stays meaningful rather than being
// dominated by completely unrelated procurement noise.
export type RejectedCandidate = {
  opportunity_title: string;
  source_name: string;
  source_url?: string;
  reason: string;
};

// One connector's outcome for a single run. `error` is set (and
// `candidates` left empty) when the connector failed for any reason - the
// orchestrator logs it and moves on to the next connector rather than
// aborting the whole run, per the "a broken source does not stop the
// entire search" requirement. `rejectedCount` is the true total; `rejected`
// is a capped sample of them (with reasons) for display.
export type ConnectorResult = {
  source_name: string;
  candidates: OpportunityCandidate[];
  rejectedCount: number;
  rejected: RejectedCandidate[];
  error?: string;
};

export type Connector = {
  sourceName: string;
  run: () => Promise<ConnectorResult>;
};

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function isOpportunityOverdue(
  opportunity: Pick<ActiveCleaningOpportunityRow, "next_follow_up_at" | "archived_at">
): boolean {
  if (!opportunity.next_follow_up_at || opportunity.archived_at) return false;
  return startOfDay(new Date(opportunity.next_follow_up_at)) < startOfDay(new Date());
}

export function isOpportunityDueToday(
  opportunity: Pick<ActiveCleaningOpportunityRow, "next_follow_up_at" | "archived_at">
): boolean {
  if (!opportunity.next_follow_up_at || opportunity.archived_at) return false;
  return startOfDay(new Date(opportunity.next_follow_up_at)) === startOfDay(new Date());
}
