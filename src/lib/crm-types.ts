export type CrmRole = "admin" | "agent";

export type CrmUserRow = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  role: CrmRole;
  active: boolean;
};

export const LEAD_STAGES = [
  "New interested lead",
  "Waiting for cleaning details",
  "Quote requested from provider",
  "Provider quote received",
  "Quote sent to customer",
  "Follow-up required",
  "Customer accepted",
  "Customer declined",
  "No response",
  "Closed/completed",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export const CLOSED_STAGES: LeadStage[] = [
  "Customer accepted",
  "Customer declined",
  "No response",
  "Closed/completed",
];

// Stages an agent may set themselves. The remaining stages ("Customer
// accepted", "Customer declined", "Closed/completed") are system/admin
// controlled - accept/decline sync automatically from the customer's
// response, and closing an opportunity is a dedicated admin-only action.
// Enforced in the database too (see migration 0009), not just this list.
export const AGENT_SETTABLE_STAGES: LeadStage[] = [
  "New interested lead",
  "Waiting for cleaning details",
  "Quote requested from provider",
  "Provider quote received",
  "Follow-up required",
  "No response",
];

export const SYSTEM_ONLY_STAGES: LeadStage[] = [
  "Customer accepted",
  "Customer declined",
  "Closed/completed",
];

export const LEAD_STAGE_STYLES: Record<LeadStage, string> = {
  "New interested lead": "bg-slate-100 text-slate-700",
  "Waiting for cleaning details": "bg-slate-100 text-slate-700",
  "Quote requested from provider": "bg-amber-100 text-amber-800",
  "Provider quote received": "bg-sky-100 text-sky-800",
  "Quote sent to customer": "bg-purple-100 text-purple-800",
  "Follow-up required": "bg-orange-100 text-orange-800",
  "Customer accepted": "bg-emerald-100 text-emerald-800",
  "Customer declined": "bg-rose-100 text-rose-800",
  "No response": "bg-rose-100 text-rose-800",
  "Closed/completed": "bg-indigo-100 text-indigo-800",
};

export type CrmLeadRow = {
  id: string;
  created_at: string;
  business_name: string;
  contact_name: string | null;
  phone: string;
  email: string | null;
  city: string;
  service_address: string | null;
  service_requested: string;
  property_type: string | null;
  approximate_size: string | null;
  cleaning_frequency: string | null;
  preferred_start_date: string | null;
  best_time_to_contact: string | null;
  lead_source: string | null;
  notes: string | null;
  stage: LeadStage;
  assigned_agent_id: string | null;
  created_by: string | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  quote_request_id: string | null;
};

export type NewCrmLeadInput = {
  business_name: string;
  contact_name?: string;
  phone: string;
  email?: string;
  city: string;
  service_address?: string;
  service_requested: string;
  property_type?: string;
  approximate_size?: string;
  cleaning_frequency?: string;
  preferred_start_date?: string;
  best_time_to_contact?: string;
  lead_source?: string;
  notes?: string;
};

export const ACTIVITY_TYPES = [
  "call",
  "email",
  "text",
  "voicemail",
  "note",
  "outcome",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call: "Phone call",
  email: "Email",
  text: "Text message",
  voicemail: "Voicemail",
  note: "Internal note",
  outcome: "Follow-up outcome",
};

export type CrmActivityRow = {
  id: string;
  created_at: string;
  lead_id: string;
  agent_id: string | null;
  activity_type: ActivityType;
  notes: string | null;
  occurred_at: string;
  next_follow_up_at: string | null;
};

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Compares calendar days (in the server's local time zone), not exact
// timestamps, so a 2pm follow-up checked at 4pm the same day is "due
// today", not "overdue" - it only becomes overdue the next calendar day.
export function isOverdue(lead: Pick<CrmLeadRow, "next_follow_up_at" | "stage">): boolean {
  if (!lead.next_follow_up_at) return false;
  if (CLOSED_STAGES.includes(lead.stage)) return false;
  return startOfDay(new Date(lead.next_follow_up_at)) < startOfDay(new Date());
}

export function isDueToday(lead: Pick<CrmLeadRow, "next_follow_up_at" | "stage">): boolean {
  if (!lead.next_follow_up_at) return false;
  if (CLOSED_STAGES.includes(lead.stage)) return false;
  return startOfDay(new Date(lead.next_follow_up_at)) === startOfDay(new Date());
}

// Follow-Up Calendar: dedicated scheduled callbacks (crm_followups),
// distinct from the crm_activities timeline. crm_leads.next_follow_up_at
// is kept in sync with these automatically by a database trigger (see
// migration 0011) - it's the earliest pending callback for that lead, not
// something application code writes directly anymore.
export type FollowUpStatus = "pending" | "completed";

export type CrmFollowUpRow = {
  id: string;
  created_at: string;
  lead_id: string;
  scheduled_by: string | null;
  scheduled_at: string;
  note: string | null;
  status: FollowUpStatus;
  completed_at: string | null;
  completed_by: string | null;
};

// Joined shape used wherever a follow-up is displayed outside the context
// of its own lead page (the calendar, the admin follow-ups view) and
// needs to show which lead/business it's for without a second round trip.
export type CrmFollowUpWithLead = CrmFollowUpRow & {
  crm_leads: Pick<CrmLeadRow, "id" | "business_name" | "phone" | "city" | "assigned_agent_id"> | null;
};

export function isFollowUpOverdue(followUp: Pick<CrmFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  return startOfDay(new Date(followUp.scheduled_at)) < startOfDay(new Date());
}

export function isFollowUpDueToday(followUp: Pick<CrmFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  return startOfDay(new Date(followUp.scheduled_at)) === startOfDay(new Date());
}

export function isFollowUpUpcoming(followUp: Pick<CrmFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  return startOfDay(new Date(followUp.scheduled_at)) > startOfDay(new Date());
}

// Formats an ISO timestamp for a <input type="datetime-local"> defaultValue
// (which needs "YYYY-MM-DDTHH:mm" in local time, not an ISO string).
export function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}
