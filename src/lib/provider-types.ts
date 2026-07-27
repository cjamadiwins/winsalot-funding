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
  cleaning_provider_id: string | null;
  score: number | null;
  score_label: string | null;
  score_breakdown: ProviderScoreBreakdown | null;
  score_missing_categories: string[];
  score_is_new_provider: boolean;
  score_calculated_at: string | null;
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

export type ProviderDocumentRow = {
  id: string;
  created_at: string;
  provider_lead_id: string;
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
  provider_lead_id: string;
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
  provider_lead_id: string;
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

export type ProviderScoreAdjustmentRow = {
  id: string;
  created_at: string;
  provider_lead_id: string;
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
  provider_lead_id: string;
  agent_id: string | null;
  activity_type: "call" | "email" | "text" | "voicemail" | "note" | "outcome";
  call_outcome: ProviderCallOutcome | null;
  notes: string | null;
  occurred_at: string;
  next_follow_up_at: string | null;
};

export type ProviderFollowUpRow = {
  id: string;
  created_at: string;
  provider_lead_id: string;
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
    "id" | "business_name" | "contact_person" | "phone" | "email" | "status" | "assigned_agent_id"
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
