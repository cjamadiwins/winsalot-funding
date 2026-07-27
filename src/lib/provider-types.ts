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

export const PROVIDER_SERVICES_OFFERED = [
  "Commercial Cleaning",
  "Residential Cleaning",
  "Commercial and Residential Cleaning",
  "Office Cleaning",
  "Medical and Dental Cleaning",
  "Daycare Cleaning",
  "Gym and Fitness Centre Cleaning",
  "Industrial Cleaning",
  "Warehouse Cleaning",
  "Post-Construction Cleaning",
  "Carpet Cleaning",
  "Window Cleaning",
  "Move-In and Move-Out Cleaning",
  "Other",
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
};

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
  last_email_type: "provider_intake" | null;
  last_email_to: string | null;
  closed_at: string | null;
  closed_by: string | null;
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
  email_type: "provider_intake";
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
