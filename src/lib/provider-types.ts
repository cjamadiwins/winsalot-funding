// Provider Acquisition: recruiting and onboarding cleaning providers
// (companies Winsalot could dispatch work to) - a completely separate CRM
// section from crm-types.ts (customer quote-request leads) and from
// opportunities/types.ts (public cleaning-intent signals). See
// supabase/migrations/0026_provider_acquisition.sql for the schema this
// mirrors.

export const CANADIAN_PROVINCES_AND_TERRITORIES = [
  "Alberta",
  "British Columbia",
  "Manitoba",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Northwest Territories",
  "Nova Scotia",
  "Nunavut",
  "Ontario",
  "Prince Edward Island",
  "Quebec",
  "Saskatchewan",
  "Yukon",
] as const;

export type CanadianProvinceOrTerritory = (typeof CANADIAN_PROVINCES_AND_TERRITORIES)[number];

// Provider Profile's canonical Service Information list (brief section
// "SERVICE INFORMATION"), followed by every legacy value that predates
// this list so existing provider_leads.services_offered rows keep
// rendering as badges and keep round-tripping through the edit checkboxes
// without silently losing a selection - services_offered is an
// unconstrained text[] (see migration 0026), so widening this list is
// purely additive at the database level.
export const PROVIDER_SERVICES_OFFERED = [
  "Commercial Cleaning",
  "Residential Cleaning",
  "Office Cleaning",
  "Medical Clinics",
  "Dental Offices",
  "Daycares",
  "Schools",
  "Banks",
  "Warehouses",
  "Manufacturing Facilities",
  "Retail Stores",
  "Restaurants",
  "Hotels",
  "Gyms",
  "Religious Facilities",
  "Carpet Cleaning",
  "Window Cleaning",
  "Floor Care",
  "Post Construction",
  "Move In / Move Out",
  "Other",
  // Legacy-only values (pre-Provider Profile) - kept for backward
  // compatibility, not shown as the primary/first options.
  "Commercial and Residential Cleaning",
  "Medical and Dental Cleaning",
  "Daycare Cleaning",
  "Gym and Fitness Centre Cleaning",
  "Industrial Cleaning",
  "Warehouse Cleaning",
  "Post-Construction Cleaning",
  "Move-In and Move-Out Cleaning",
] as const;

export type ProviderServiceOffered = (typeof PROVIDER_SERVICES_OFFERED)[number];

export const PROVIDER_STATUSES = [
  "New",
  "Contact Attempted",
  "Contacted",
  "Interested",
  "Intake Form Sent",
  "Follow-up Required",
  "Intake Form Completed",
  "Under Review",
  "Approved Provider",
  "Not Interested",
  "Invalid Contact",
  "Closed",
  // Provider Profile lifecycle statuses, added alongside the Provider
  // Acquisition statuses above rather than replacing any of them.
  "Active",
  "Inactive",
  "Suspended",
  "Declined",
] as const;

export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export const PROVIDER_STATUS_STYLES: Record<ProviderStatus, string> = {
  New: "bg-slate-100 text-slate-700",
  "Contact Attempted": "bg-slate-100 text-slate-700",
  Contacted: "bg-sky-100 text-sky-800",
  Interested: "bg-amber-100 text-amber-800",
  "Intake Form Sent": "bg-purple-100 text-purple-800",
  "Follow-up Required": "bg-orange-100 text-orange-800",
  "Intake Form Completed": "bg-indigo-100 text-indigo-800",
  "Under Review": "bg-amber-100 text-amber-800",
  "Approved Provider": "bg-emerald-100 text-emerald-800",
  "Not Interested": "bg-rose-100 text-rose-800",
  "Invalid Contact": "bg-rose-100 text-rose-800",
  Closed: "bg-slate-200 text-slate-600",
  Active: "bg-emerald-100 text-emerald-800",
  Inactive: "bg-slate-200 text-slate-600",
  Suspended: "bg-orange-100 text-orange-800",
  Declined: "bg-rose-100 text-rose-800",
};

// Statuses only an administrator may set (brief's "AGENT PROVIDER
// MANAGEMENT" section: agents can mark Contacted/Intake Form
// Sent/Completed/Follow-up Required/Active/Inactive and request review,
// but cannot themselves approve, suspend, or permanently decline a
// provider).
export const ADMIN_ONLY_STATUSES: ProviderStatus[] = ["Approved Provider", "Suspended", "Declined"];

export const PROVIDER_CALL_OUTCOMES = [
  "No Answer",
  "Voicemail Left",
  "Receptionist",
  "Decision-Maker Reached",
  "Interested",
  "Asked for Email",
  "Intake Form Sent During Call",
  "Follow-up Requested",
  "Not Interested",
  "Wrong Number",
  "Business Closed",
  "Other",
] as const;

export type ProviderCallOutcome = (typeof PROVIDER_CALL_OUTCOMES)[number];

// Call outcomes that require a Next Follow-up Date before the call note
// can be saved (section 8 of the brief).
export const CALL_OUTCOMES_REQUIRING_FOLLOW_UP: ProviderCallOutcome[] = ["Follow-up Requested"];

export type ProviderLeadRow = {
  id: string;
  created_at: string;
  updated_at: string;
  business_name: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  city: string;
  province: CanadianProvinceOrTerritory;
  website: string | null;
  services_offered: string[];
  years_in_business: string | null;
  assigned_agent_id: string | null;
  created_by: string | null;
  lead_source: string | null;
  status: ProviderStatus;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  last_email_status:
    | "sent"
    | "delivered"
    | "delayed"
    | "bounced"
    | "complained"
    | "opened"
    | "clicked"
    | "failed"
    | null;
  last_email_status_at: string | null;
  last_email_type: "provider_intake" | "provider_message" | null;
  last_email_to: string | null;
  closed_at: string | null;
  closed_by: string | null;
  intake_completed_at: string | null;
  intake_submission: Record<string, unknown> | null;
  // Provider Profile fields (migration 0028).
  logo_path: string | null;
  job_title: string | null;
  street_address: string | null;
  postal_code: string | null;
  number_of_employees: string | null;
  business_description: string | null;
  cities_served: string[];
  wsib_wcb_applicable: boolean;
  // Permanent link to the operational Provider Profile (cleaning_providers),
  // set automatically by the "Approve and Add to Providers" action - never
  // a manual admin-picked link, and never cleared once set. The Provider
  // Scorecard lives only on cleaning_providers (see CleaningProviderRow
  // below), not here - an unapproved lead has no scorecard.
  cleaning_provider_id: string | null;
};

// ---------------------------------------------------------------------
// The operational Provider Profile - built on the pre-existing
// cleaning_providers table (migration 0004, extended by 0028) that the
// quote-assignment system already references. This is the *permanent*
// provider identity: once a Provider Acquisition lead is approved, this
// is the profile used everywhere (Providers directory, quote assignment,
// quote history, agent-facing management) - see docs/provider-profile.md.
// ---------------------------------------------------------------------
export const CLEANING_PROVIDER_STATUSES = ["active", "inactive", "suspended"] as const;
export type CleaningProviderStatus = (typeof CLEANING_PROVIDER_STATUSES)[number];

export const CLEANING_PROVIDER_STATUS_STYLES: Record<CleaningProviderStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-slate-200 text-slate-600",
  suspended: "bg-orange-100 text-orange-800",
};

export type CleaningProviderRow = {
  id: string;
  created_at: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  service_locations: string | null;
  pricing_notes: string | null;
  internal_notes: string | null;
  status: CleaningProviderStatus;
  assigned_agent_id: string | null;
  created_by: string | null;
  logo_path: string | null;
  job_title: string | null;
  website: string | null;
  street_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  cities_served: string[];
  services_offered: string[];
  years_in_business: string | null;
  number_of_employees: string | null;
  business_description: string | null;
  wsib_wcb_applicable: boolean;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  last_email_status:
    | "sent"
    | "delivered"
    | "delayed"
    | "bounced"
    | "complained"
    | "opened"
    | "clicked"
    | "failed"
    | null;
  last_email_status_at: string | null;
  last_email_type: "provider_message" | null;
  last_email_to: string | null;
  score: number | null;
  score_label: string | null;
  score_breakdown: ProviderScoreBreakdown | null;
  score_missing_categories: string[];
  score_is_new_provider: boolean;
  score_calculated_at: string | null;
  // Manual Provider Scorecard (migration 0030) - administrator-set 1-5
  // ratings, operational counters, and free-text notes, merged into the
  // same Provider Scorecard card as the automatic score above rather than
  // a second scorecard. Every existing provider gets these as null/0
  // automatically (purely additive columns) until an administrator fills
  // them in.
  quote_response_speed_rating: number | null;
  pricing_competitiveness_rating: number | null;
  service_quality_rating: number | null;
  reliability_rating: number | null;
  communication_rating: number | null;
  customer_satisfaction_rating: number | null;
  jobs_assigned_count: number;
  quotes_submitted_count: number;
  quotes_approved_count: number;
  jobs_completed_count: number;
  cancellation_no_show_count: number;
  scorecard_notes: string | null;
  manual_score: number | null;
  manual_score_label: ManualScorecardStatus | null;
  manual_score_updated_at: string | null;
  manual_score_updated_by: string | null;
};

// ---------------------------------------------------------------------
// Provider Profile: Files
// ---------------------------------------------------------------------
export const PROVIDER_DOCUMENT_TYPES = [
  "business_licence",
  "insurance_certificate",
  "wsib_wcb",
  "certification",
  "other",
] as const;

export type ProviderDocumentType = (typeof PROVIDER_DOCUMENT_TYPES)[number];

export const PROVIDER_DOCUMENT_TYPE_LABELS: Record<ProviderDocumentType, string> = {
  business_licence: "Business Licence",
  insurance_certificate: "Insurance Certificate",
  wsib_wcb: "WSIB / WCB",
  certification: "Certification",
  other: "Other Document",
};

// Dual-keyed: a document uploaded during the recruiting phase keeps its
// provider_lead_id, and is also linked to cleaning_provider_id the moment
// that lead is approved (backfilled by the approval action), so it
// continues to show up on the operational profile without being
// duplicated. A document uploaded directly against an operational
// provider only has cleaning_provider_id set.
export type ProviderDocumentRow = {
  id: string;
  created_at: string;
  provider_lead_id: string | null;
  cleaning_provider_id: string | null;
  uploaded_by: string | null;
  doc_type: ProviderDocumentType;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  expires_at: string | null;
  removed_at: string | null;
  removed_by: string | null;
};

// ---------------------------------------------------------------------
// Provider Profile: Internal Notes
// ---------------------------------------------------------------------
export type ProviderNoteRow = {
  id: string;
  created_at: string;
  provider_lead_id: string | null;
  cleaning_provider_id: string | null;
  user_id: string | null;
  author_name: string;
  note: string;
};

// ---------------------------------------------------------------------
// Provider Profile: Provider Intake Form version history
// ---------------------------------------------------------------------
export type ProviderIntakeVersionRow = {
  id: string;
  created_at: string;
  provider_lead_id: string;
  submission: Record<string, unknown>;
  completed_at: string;
  completed_by_label: string | null;
};

// ---------------------------------------------------------------------
// Provider Profile: outbound SMS log ("Send SMS" quick action)
// ---------------------------------------------------------------------
export type ProviderSmsMessageRow = {
  id: string;
  created_at: string;
  provider_lead_id: string | null;
  cleaning_provider_id: string | null;
  agent_id: string | null;
  to_phone: string;
  body: string;
  activity_id: string | null;
};

// ---------------------------------------------------------------------
// Provider Scorecard
// ---------------------------------------------------------------------
export const PROVIDER_SCORE_CATEGORIES = [
  "Profile Completeness",
  "Documentation",
  "Responsiveness",
  "Quote Performance",
  "Reliability and Activity",
] as const;

export type ProviderScoreCategory = (typeof PROVIDER_SCORE_CATEGORIES)[number];

export type ProviderScoreCategoryBreakdown = {
  category: ProviderScoreCategory;
  applicable: boolean;
  pointsEarned: number;
  pointsAvailable: number;
  details: string[];
  recommendations: string[];
};

export type ProviderScoreBreakdown = {
  categories: ProviderScoreCategoryBreakdown[];
  rawEarned: number;
  rawAvailable: number;
};

// Scorecards live only on the operational profile - a manual adjustment
// always targets cleaning_provider_id, never a not-yet-approved lead.
export type ProviderScoreAdjustmentRow = {
  id: string;
  created_at: string;
  cleaning_provider_id: string;
  admin_id: string | null;
  amount: number;
  reason: string;
};

export type ProviderScoreRatingLabel = "Excellent" | "Strong" | "Developing" | "Needs Attention" | "High Risk";

export function providerScoreRatingLabel(score: number): ProviderScoreRatingLabel {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Strong";
  if (score >= 60) return "Developing";
  if (score >= 40) return "Needs Attention";
  return "High Risk";
}

// Combines the automatically-calculated score with every logged manual
// administrator adjustment for display purposes only - the stored
// provider_leads.score/breakdown always stays the pure calculated value
// (brief: "Show manual adjustments separately from the automatically
// calculated score"). Kept in this client-safe module (rather than
// lib/provider-score.ts, which is "server-only") since the Scorecard card
// renders it directly in a Client Component.
export function providerAdjustedScore(baseScore: number, adjustments: { amount: number }[]): number {
  const total = adjustments.reduce((sum, a) => sum + a.amount, baseScore);
  return Math.max(0, Math.min(100, total));
}

export const PROVIDER_SCORE_RATING_STYLES: Record<ProviderScoreRatingLabel, string> = {
  Excellent: "bg-emerald-100 text-emerald-800",
  Strong: "bg-sky-100 text-sky-800",
  Developing: "bg-amber-100 text-amber-800",
  "Needs Attention": "bg-orange-100 text-orange-800",
  "High Risk": "bg-rose-100 text-rose-800",
};

// ---------------------------------------------------------------------
// Provider Scorecard: administrator-editable manual ratings, merged into
// the same Provider Scorecard card as the automatic score above (rather
// than a second scorecard). Six 1-5 quality ratings feed the Overall
// Provider Score below; five operational counters and a free-text notes
// field are administrative record-keeping shown alongside it.
// ---------------------------------------------------------------------
export const MANUAL_SCORECARD_RATING_CATEGORIES = [
  "quote_response_speed",
  "pricing_competitiveness",
  "service_quality",
  "reliability",
  "communication",
  "customer_satisfaction",
] as const;

export type ManualScorecardRatingCategory = (typeof MANUAL_SCORECARD_RATING_CATEGORIES)[number];

export const MANUAL_SCORECARD_RATING_LABELS: Record<ManualScorecardRatingCategory, string> = {
  quote_response_speed: "Quote Response Speed",
  pricing_competitiveness: "Pricing Competitiveness",
  service_quality: "Service Quality",
  reliability: "Reliability",
  communication: "Communication",
  customer_satisfaction: "Customer Satisfaction",
};

export type ManualScorecardRatings = Record<ManualScorecardRatingCategory, number | null>;

export const MANUAL_SCORECARD_COUNTER_FIELDS = [
  "jobs_assigned_count",
  "quotes_submitted_count",
  "quotes_approved_count",
  "jobs_completed_count",
  "cancellation_no_show_count",
] as const;

export type ManualScorecardCounterField = (typeof MANUAL_SCORECARD_COUNTER_FIELDS)[number];

export const MANUAL_SCORECARD_COUNTER_LABELS: Record<ManualScorecardCounterField, string> = {
  jobs_assigned_count: "Jobs Assigned",
  quotes_submitted_count: "Quotes Submitted",
  quotes_approved_count: "Quotes Approved",
  jobs_completed_count: "Jobs Completed",
  cancellation_no_show_count: "Cancellation / No-Show Count",
};

export const MANUAL_SCORECARD_STATUSES = ["Excellent", "Good", "Needs Improvement", "High Risk"] as const;
export type ManualScorecardStatus = (typeof MANUAL_SCORECARD_STATUSES)[number];

export const MANUAL_SCORECARD_STATUS_STYLES: Record<ManualScorecardStatus, string> = {
  Excellent: "bg-emerald-100 text-emerald-800",
  Good: "bg-sky-100 text-sky-800",
  "Needs Improvement": "bg-amber-100 text-amber-800",
  "High Risk": "bg-rose-100 text-rose-800",
};

export function manualScorecardStatusLabel(score: number): ManualScorecardStatus {
  if (score >= 85) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 40) return "Needs Improvement";
  return "High Risk";
}

// Overall Provider Score (out of 100) - the average of whichever 1-5
// quality ratings have been set so far, scaled to a 100-point scale, so
// a partially-rated provider still gets a meaningful score instead of
// being penalized for unrated categories. Returns null only when no
// category has been rated yet at all.
export function computeManualScorecardScore(ratings: ManualScorecardRatings): number | null {
  const provided = MANUAL_SCORECARD_RATING_CATEGORIES.map((cat) => ratings[cat]).filter(
    (v): v is number => v !== null && v !== undefined
  );
  if (provided.length === 0) return null;
  const average = provided.reduce((sum, v) => sum + v, 0) / provided.length;
  return Math.round((average / 5) * 100);
}

// Activity-type labels for the Provider Profile timeline only - a
// superset of crm-types.ts's ACTIVITY_TYPE_LABELS that also covers the
// system-only types added by migration 0028 (status changes, agent
// reassignment, quote invitations/decisions, score recalculations).
// Deliberately kept separate from ACTIVITY_TYPE_LABELS so the crm_leads/
// opportunities timeline (and their "Log Activity" dropdown) are
// completely unaffected.
export const PROVIDER_ACTIVITY_TYPE_LABELS: Record<string, string> = {
  call: "Phone call",
  email: "Email",
  text: "Text message",
  voicemail: "Voicemail",
  note: "Internal note",
  outcome: "Follow-up outcome",
  status_change: "Status change",
  assignment_change: "Assigned agent change",
  quote_invited: "Quote invitation sent",
  quote_submitted: "Quote submitted",
  quote_accepted: "Quote accepted",
  quote_declined: "Quote declined",
  score_change: "Scorecard recalculated",
};

export type NewProviderLeadInput = {
  business_name: string;
  contact_person?: string;
  phone: string;
  email?: string;
  city: string;
  province: CanadianProvinceOrTerritory;
  website?: string;
  services_offered: string[];
  years_in_business?: string;
  lead_source?: string;
  notes?: string;
};

// crm_activities row scoped to a provider lead (provider_lead_id set,
// lead_id and opportunity_id both null - see migration 0026). Deliberately
// a separate type from CrmActivityRow/OpportunityActivityRow rather than
// widening either of those, matching the pattern already used for
// opportunities.
export type ProviderActivityRow = {
  id: string;
  created_at: string;
  provider_lead_id: string | null;
  cleaning_provider_id: string | null;
  agent_id: string | null;
  activity_type: string;
  call_outcome: ProviderCallOutcome | null;
  notes: string | null;
  occurred_at: string;
  next_follow_up_at: string | null;
};

export type ProviderFollowUpRow = {
  id: string;
  created_at: string;
  provider_lead_id: string | null;
  cleaning_provider_id: string | null;
  scheduled_by: string | null;
  scheduled_at: string;
  note: string | null;
  status: "pending" | "completed";
  completed_at: string | null;
  completed_by: string | null;
};

export type ProviderFollowUpWithLead = ProviderFollowUpRow & {
  provider_leads: Pick<
    ProviderLeadRow,
    | "id"
    | "business_name"
    | "contact_person"
    | "phone"
    | "email"
    | "status"
    | "assigned_agent_id"
    | "intake_completed_at"
    | "cleaning_provider_id"
  > | null;
};

export type LatestProviderLeadEmail = {
  email_type: "provider_intake" | "provider_message";
  to_email: string;
  subject: string;
  status: "sent" | "delivered" | "delayed" | "bounced" | "complained" | "opened" | "clicked" | "failed";
  status_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  delayed_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
};

// Every tracked email for a provider (Email History section), not just
// the most recent one - same underlying crm_lead_emails row shape as
// LatestProviderLeadEmail, plus an id to key list rows and act on
// individually (e.g. "Resend").
export type ProviderEmailHistoryRow = LatestProviderLeadEmail & { id: string; created_at: string };

// Free-text "Cities Served" entry, split on commas/newlines and
// deduplicated - same pattern as services_offered (unconstrained text[]).
export function parseCitiesServed(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const city = part.trim();
    if (!city) continue;
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(city);
  }
  return result;
}

// Possible-duplicate match surfaced before a new provider lead is created
// (section 12 of the brief) - business name, phone, or email matched an
// existing, non-closed record.
export type ProviderDuplicateMatch = Pick<
  ProviderLeadRow,
  "id" | "business_name" | "contact_person" | "phone" | "email" | "city" | "status"
>;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Same exact-timestamp overdue rule as crm-types.ts's isOverdue() - a
// follow-up scheduled for 2pm is overdue the moment 2pm passes. A closed
// provider lead is never shown as overdue.
export function isProviderOverdue(
  provider: Pick<ProviderLeadRow, "next_follow_up_at" | "status">
): boolean {
  if (!provider.next_follow_up_at) return false;
  if (provider.status === "Closed") return false;
  return new Date(provider.next_follow_up_at).getTime() < Date.now();
}

export function isProviderDueToday(
  provider: Pick<ProviderLeadRow, "next_follow_up_at" | "status">
): boolean {
  if (!provider.next_follow_up_at) return false;
  if (provider.status === "Closed") return false;
  if (isProviderOverdue(provider)) return false;
  return startOfDay(new Date(provider.next_follow_up_at)) === startOfDay(new Date());
}

export function overdueProviderDurationLabel(scheduledIso: string): string {
  const elapsedMs = Date.now() - new Date(scheduledIso).getTime();
  if (elapsedMs <= 0) return "";

  const minutes = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days === 1 ? "" : "s"} overdue`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} overdue`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"} overdue`;
  return "Just now overdue";
}

export function isProviderFollowUpOverdue(
  followUp: Pick<ProviderFollowUpRow, "scheduled_at" | "status">
): boolean {
  if (followUp.status !== "pending") return false;
  return new Date(followUp.scheduled_at).getTime() < Date.now();
}

export function isProviderFollowUpDueToday(
  followUp: Pick<ProviderFollowUpRow, "scheduled_at" | "status">
): boolean {
  if (followUp.status !== "pending") return false;
  if (isProviderFollowUpOverdue(followUp)) return false;
  return startOfDay(new Date(followUp.scheduled_at)) === startOfDay(new Date());
}

export function isProviderFollowUpUpcoming(
  followUp: Pick<ProviderFollowUpRow, "scheduled_at" | "status">
): boolean {
  if (followUp.status !== "pending") return false;
  if (isProviderFollowUpOverdue(followUp)) return false;
  return startOfDay(new Date(followUp.scheduled_at)) > startOfDay(new Date());
}

// ---------------------------------------------------------------------
// CRM / Provider Acquisition: a simplified 6-stage view over the 16
// granular PROVIDER_STATUSES above, for dashboard cards and color-coded
// badges only. Purely a display grouping computed from existing fields -
// never written to the database, and every existing status value,
// status-specific action (send intake email, "Approve and Add to
// Providers", etc.), and the full status dropdown are all unchanged.
// This keeps "map existing statuses carefully instead of deleting data"
// literal: nothing about the underlying 16-status pipeline is removed or
// renamed, this just adds a coarser lens on top of it.
// ---------------------------------------------------------------------
export const PROVIDER_ACQUISITION_STAGES = [
  "New Interested Lead",
  "Quote Form Sent",
  "Quote Form Incomplete",
  "Qualified Provider",
  "Closed – Won",
  "Closed – Lost",
] as const;

export type ProviderAcquisitionStage = (typeof PROVIDER_ACQUISITION_STAGES)[number];

export const PROVIDER_ACQUISITION_STAGE_STYLES: Record<ProviderAcquisitionStage, string> = {
  "New Interested Lead": "bg-blue-100 text-blue-800",
  "Quote Form Sent": "bg-purple-100 text-purple-800",
  "Quote Form Incomplete": "bg-orange-100 text-orange-800",
  "Qualified Provider": "bg-green-100 text-green-800",
  "Closed – Won": "bg-emerald-200 text-emerald-900",
  "Closed – Lost": "bg-slate-200 text-slate-700",
};

// Mapping rationale (a judgment call - there's no exact 1:1 source for
// this in the 16-status pipeline, so this groups by what each status
// actually means for acquisition-funnel reporting purposes):
//  - "Closed – Won": the lead was actually approved/promoted - either it
//    already has a permanent cleaning_provider_id (the definitive signal
//    an admin ran "Approve and Add to Providers"), or its status is one
//    of the post-approval lifecycle statuses (Approved Provider, Active,
//    Inactive, Suspended - Provider Profile migration 0028). All of
//    these mean the acquisition itself succeeded at some point, even if
//    the provider's current operational status has since changed.
//  - "Closed – Lost": the funnel ended without success (Not Interested,
//    Invalid Contact, Declined, or the generic legacy Closed status).
//  - "Qualified Provider": brief - "Do not count a company that only
//    requested the quote form as a qualified provider. Count it as a
//    Qualified Provider only after the required form or provider
//    information has been completed." intake_completed_at is the actual
//    completion timestamp (set once, when the form is submitted),
//    checked ahead of the status string so this can never mis-flag a
//    lead that's merely been sent the form - Intake Form Completed and
//    Under Review are included as a fallback for the same reason.
//  - "Quote Form Sent": Intake Form Sent - the form link has gone out
//    but nothing has come back yet.
//  - "Quote Form Incomplete": Follow-up Required - the closest existing
//    status for "we're waiting on something from them and need to
//    chase it," typically reached after a form was sent but not
//    completed. The 16-status pipeline has no separate "form opened but
//    abandoned" signal to source this from more precisely.
//  - Everything else (New, Contact Attempted, Contacted, Interested)
//    falls back to "New Interested Lead" - still early outreach, no form
//    sent yet.
export function providerAcquisitionStage(
  provider: Pick<ProviderLeadRow, "status" | "intake_completed_at" | "cleaning_provider_id">
): ProviderAcquisitionStage {
  if (
    provider.cleaning_provider_id ||
    (["Approved Provider", "Active", "Inactive", "Suspended"] as ProviderStatus[]).includes(provider.status)
  ) {
    return "Closed – Won";
  }
  if ((["Not Interested", "Invalid Contact", "Declined", "Closed"] as ProviderStatus[]).includes(provider.status)) {
    return "Closed – Lost";
  }
  if (provider.intake_completed_at || provider.status === "Intake Form Completed" || provider.status === "Under Review") {
    return "Qualified Provider";
  }
  if (provider.status === "Intake Form Sent") return "Quote Form Sent";
  if (provider.status === "Follow-up Required") return "Quote Form Incomplete";
  return "New Interested Lead";
}
