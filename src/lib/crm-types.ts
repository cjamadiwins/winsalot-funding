import type { KpiTone } from "@/components/crm-ui/KpiCard";

export type CrmRole = "admin" | "agent";

export type CrmUserRow = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  role: CrmRole;
  active: boolean;
  // "HH:MM:SS" or null - null means no schedule is configured yet for
  // this agent, so late-arrival/early-departure is never flagged for
  // them (see src/lib/attendance-pay.ts). Admin-set from the Attendance
  // page, migration 0075.
  scheduled_start_time: string | null;
};

export type AgentAttendanceRow = {
  id: string;
  agent_id: string;
  clock_in: string;
  clock_out: string | null;
  total_minutes: number | null;
  created_at: string;
  clocked_out_by_admin_id: string | null;
  clocked_out_by_admin_name: string | null;
  break1_start: string | null;
  break1_end: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  break2_start: string | null;
  break2_end: string | null;
};

// ---------------------------------------------------------------------
// Winsalot Growth CRM: sales opportunities for the two services Winsalot
// Corp sells - Lead Generation and Business Financing (or both at once).
// Replaces the old commercial-cleaning-quote-linked "lead" pipeline
// (crm_leads) - see supabase/migrations/0080-0085 for the schema and the
// one-time data migration that carried every existing crm_leads row over
// as a 'lead_generation' opportunity.

export const OPPORTUNITY_TYPES = ["lead_generation", "business_financing", "both_services"] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  lead_generation: "Lead Generation",
  business_financing: "Business Financing",
  both_services: "Both Services",
};

export const OPPORTUNITY_STAGES = [
  "New Prospect",
  "Contacted",
  "Interested",
  "Consultation Booked",
  "Proposal or Application Sent",
  "Client Won",
  "Follow-Up Required",
  "Not Interested",
] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

// The only two stages that mean "this opportunity is done" for
// overdue-flagging and admin reporting purposes - an opportunity only
// stops being eligible for an Overdue flag once it's been deliberately
// closed Won or Lost, with a reason recorded (see
// crm_opportunities_closed_reason_required, migration 0081).
export const CLOSED_STAGES: OpportunityStage[] = ["Client Won", "Not Interested"];

// Stages an agent may set themselves via the plain stage dropdown.
// "Client Won"/"Not Interested" are deliberately *not* in this list even
// though an agent is allowed to set them (migration 0081's trigger
// permits it) - closing an opportunity always requires a reason, so it
// only ever happens through closeOpportunityAction (the dedicated Close
// Opportunity panel), never through this freeform dropdown.
export const AGENT_SETTABLE_STAGES: OpportunityStage[] = [
  "New Prospect",
  "Contacted",
  "Interested",
  "Consultation Booked",
  "Proposal or Application Sent",
  "Follow-Up Required",
];

export const OPPORTUNITY_STAGE_STYLES: Record<OpportunityStage, string> = {
  "New Prospect": "bg-indigo-100 text-indigo-800",
  Contacted: "bg-slate-100 text-slate-700",
  Interested: "bg-sky-100 text-sky-800",
  "Consultation Booked": "bg-purple-100 text-purple-800",
  "Proposal or Application Sent": "bg-amber-100 text-amber-800",
  "Client Won": "bg-emerald-100 text-emerald-800",
  "Follow-Up Required": "bg-orange-100 text-orange-800",
  "Not Interested": "bg-rose-100 text-rose-800",
};

// Shared tone palette for the agent dashboard's "My Opportunities" KPI
// cards - a single source of truth so the cards, and anything else that
// wants to reference the same concept, can never diverge in colour.
export const CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES: Record<
  "total" | "newProspect" | "interested" | "consultations" | "financing" | "leadGen" | "followUp" | "won",
  KpiTone
> = {
  total: "blue",
  newProspect: "indigo",
  interested: "cyan",
  consultations: "purple",
  financing: "amber",
  leadGen: "teal",
  followUp: "orange",
  won: "green",
};

export const CLOSE_OUTCOMES = ["won", "lost"] as const;
export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number];

export function stageForCloseOutcome(outcome: CloseOutcome): OpportunityStage {
  return outcome === "won" ? "Client Won" : "Not Interested";
}

// Every status a Resend delivery event can put an email in. Deliberately
// distinct from one another - "delivered" never implies "opened" and
// never sets it; each only changes when its own matching webhook event
// arrives (see src/app/api/webhooks/resend/route.ts).
export const EMAIL_EVENT_STATUSES = [
  "sent",
  "delivered",
  "delayed",
  "bounced",
  "complained",
  "opened",
  "clicked",
  "failed",
] as const;

export type EmailEventStatus = (typeof EMAIL_EVENT_STATUSES)[number];

export const EMAIL_STATUS_LABELS: Record<EmailEventStatus, string> = {
  sent: "Sent",
  delivered: "Delivered",
  delayed: "Delayed",
  bounced: "Bounced",
  complained: "Complaint",
  opened: "Opened",
  clicked: "Link clicked",
  failed: "Failed",
};

export const EMAIL_STATUS_STYLES: Record<EmailEventStatus, string> = {
  sent: "bg-slate-100 text-slate-700",
  delivered: "bg-sky-100 text-sky-800",
  delayed: "bg-amber-100 text-amber-800",
  bounced: "bg-rose-100 text-rose-800",
  complained: "bg-rose-100 text-rose-800",
  opened: "bg-emerald-100 text-emerald-800",
  clicked: "bg-purple-100 text-purple-800",
  failed: "bg-rose-100 text-rose-800",
};

export const EMAIL_TYPES = ["follow_up", "consultation_invite"] as const;

export type EmailType = (typeof EMAIL_TYPES)[number];

export const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  follow_up: "Follow-up",
  consultation_invite: "Consultation Invitation",
};

export type CrmOpportunityRow = {
  id: string;
  created_at: string;
  opportunity_type: OpportunityType;
  stage: OpportunityStage;

  // Shared core fields.
  business_name: string;
  contact_name: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  province_state: string | null;
  assigned_agent_id: string | null;
  created_by: string | null;
  notes: string | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  closed_reason: string | null;
  closed_at: string | null;
  closed_by: string | null;

  // Lead Generation fields.
  industry: string | null;
  target_customers: string | null;
  current_marketing_method: string | null;
  appointments_wanted: number | null;
  estimated_monthly_budget: number | null;
  consultation_date: string | null;

  // Business Financing fields.
  business_structure: "corporation" | "sole_proprietorship" | null;
  time_in_business: string | null;
  average_monthly_revenue: number | null;
  financing_amount_requested: number | null;
  bank_statements_available: boolean | null;
  application_status: string | null;

  // Stage-reached timestamps, set once by the server action the first
  // time an opportunity enters that stage (see crm-performance.ts).
  proposal_sent_at: string | null;
  application_submitted_at: string | null;

  last_email_status: EmailEventStatus | null;
  last_email_status_at: string | null;
  last_email_type: EmailType | null;
  last_email_to: string | null;
};

// A single tracked send (crm_lead_emails) - the Resend email id plus a
// timestamp per delivery event. Not read directly by any UI today (every
// event is also mirrored onto crm_activities, and the "latest status" is
// mirrored onto crm_opportunities), but kept as a typed row shape for the
// webhook handler and any future per-email drill-down.
export type CrmLeadEmailRow = {
  id: string;
  created_at: string;
  lead_id: string | null;
  opportunity_id: string | null;
  agent_id: string | null;
  activity_id: string | null;
  resend_email_id: string;
  email_type: EmailType;
  to_email: string;
  subject: string;
  status: EmailEventStatus;
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

// Display-safe subset of CrmLeadEmailRow for an opportunity's most
// recently sent tracked email, fetched via the service-role client only
// after RLS has already confirmed the caller can see that opportunity -
// crm_lead_emails has no RLS policies of its own (see migration 0022).
export type LatestCrmLeadEmail = Pick<
  CrmLeadEmailRow,
  | "email_type"
  | "to_email"
  | "subject"
  | "status"
  | "status_at"
  | "sent_at"
  | "delivered_at"
  | "delayed_at"
  | "bounced_at"
  | "complained_at"
  | "opened_at"
  | "clicked_at"
  | "failed_at"
>;

export type NewCrmOpportunityInput = {
  opportunity_type: OpportunityType;
  business_name: string;
  contact_name?: string;
  phone: string;
  email?: string;
  city?: string;
  province_state?: string;
  notes?: string;

  industry?: string;
  target_customers?: string;
  current_marketing_method?: string;
  appointments_wanted?: number;
  estimated_monthly_budget?: number;
  consultation_date?: string;

  business_structure?: "corporation" | "sole_proprietorship";
  time_in_business?: string;
  average_monthly_revenue?: number;
  financing_amount_requested?: number;
  bank_statements_available?: boolean;
  application_status?: string;
};

export const ACTIVITY_TYPES = [
  "call",
  "email",
  "text",
  "voicemail",
  "note",
  "outcome",
  "consultation_booked",
  "consultation_rescheduled",
  "consultation_cancelled",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call: "Phone call",
  email: "Email",
  text: "Text message",
  voicemail: "Voicemail",
  note: "Internal note",
  outcome: "Follow-up outcome",
  consultation_booked: "Consultation booked",
  consultation_rescheduled: "Consultation rescheduled",
  consultation_cancelled: "Consultation cancelled",
};

// Stages a newly-booked consultation must never downgrade - "Change the
// prospect's stage to Consultation Booked. Do not overwrite a more
// advanced stage such as Client Won." An opportunity already at
// Consultation Booked or further along the pipeline (or already closed)
// keeps its current stage; every earlier stage (including Follow-Up
// Required) advances.
const STAGES_NOT_ADVANCED_BY_CONSULTATION_BOOKING: OpportunityStage[] = [
  "Consultation Booked",
  "Proposal or Application Sent",
  "Client Won",
  "Not Interested",
];

export function shouldAdvanceStageForConsultationBooking(currentStage: OpportunityStage): boolean {
  return !STAGES_NOT_ADVANCED_BY_CONSULTATION_BOOKING.includes(currentStage);
}

export type CrmActivityRow = {
  id: string;
  created_at: string;
  lead_id: string | null;
  opportunity_id: string | null;
  agent_id: string | null;
  activity_type: ActivityType;
  notes: string | null;
  occurred_at: string;
  next_follow_up_at: string | null;
};

// The Winsalot Growth CRM's operating timezone for Due Today/Overdue
// day-boundary comparisons. This matters because the app runs on Vercel
// serverless functions, whose Node process is UTC regardless of where
// staff actually are - comparing calendar dates via Date's local-time
// getters (getFullYear/getMonth/getDate) would silently use UTC's day
// boundary instead of Toronto's, misclassifying anything scheduled in
// the evening Toronto time (already "tomorrow" in UTC) as due the wrong
// day. Overdue itself doesn't need this - "is this instant in the past"
// is timezone-agnostic - only the "is this the same calendar day" check
// does. (Same fix as the Lead Generation CRM's leadgenDateKey in
// leadgen-types.ts - duplicated rather than shared, matching this
// codebase's existing convention of keeping the two CRMs' logic fully
// independent.)
const CRM_TIMEZONE = "America/Toronto";

// "YYYY-MM-DD" for `date` as it falls in CRM_TIMEZONE, so two dates can
// be compared for "same calendar day" correctly regardless of what
// timezone the server process itself is running in.
function crmDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Overdue is judged against the exact scheduled date *and time* - a
// follow-up scheduled for 2pm is overdue the moment 2pm passes, not at
// midnight. An opportunity stops being eligible the moment it's Client
// Won or Not Interested (see CLOSED_STAGES above), regardless of any
// other stage.
export function isOverdue(opportunity: Pick<CrmOpportunityRow, "next_follow_up_at" | "stage">): boolean {
  if (!opportunity.next_follow_up_at) return false;
  if (CLOSED_STAGES.includes(opportunity.stage)) return false;
  return new Date(opportunity.next_follow_up_at).getTime() < Date.now();
}

// "Due today" means scheduled for today (in America/Toronto) but not yet
// overdue - once the scheduled time passes it moves into isOverdue()
// instead, so the two are mutually exclusive rather than both being true
// for the rest of the day.
export function isDueToday(opportunity: Pick<CrmOpportunityRow, "next_follow_up_at" | "stage">): boolean {
  if (!opportunity.next_follow_up_at) return false;
  if (CLOSED_STAGES.includes(opportunity.stage)) return false;
  if (isOverdue(opportunity)) return false;
  return crmDateKey(new Date(opportunity.next_follow_up_at)) === crmDateKey(new Date());
}

// "3 days overdue" / "5 hours overdue" / "12 minutes overdue" - used
// anywhere an overdue opportunity or follow-up is shown so agents/admins
// see how late it is at a glance, not just that it's late.
export function overdueDurationLabel(scheduledIso: string): string {
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

// Follow-Up Calendar: dedicated scheduled callbacks (crm_followups),
// distinct from the crm_activities timeline. crm_opportunities.next_follow_up_at
// is kept in sync with these automatically by a database trigger (see
// migration 0082) - it's the earliest pending callback for that
// opportunity, not something application code writes directly anymore.
export type FollowUpStatus = "pending" | "completed";

export type CrmFollowUpRow = {
  id: string;
  created_at: string;
  lead_id: string | null;
  opportunity_id: string | null;
  scheduled_by: string | null;
  scheduled_at: string;
  note: string | null;
  status: FollowUpStatus;
  completed_at: string | null;
  completed_by: string | null;
};

// Joined shape used wherever a follow-up is displayed outside the context
// of its own opportunity page (the calendar, the admin follow-ups view)
// and needs to show which opportunity/business it's for without a second
// round trip.
export type CrmFollowUpWithOpportunity = CrmFollowUpRow & {
  crm_opportunities: Pick<
    CrmOpportunityRow,
    "id" | "business_name" | "phone" | "city" | "assigned_agent_id" | "opportunity_type"
  > | null;
};

// Same exact-timestamp rule as isOverdue() above, applied to an individual
// scheduled callback rather than the opportunity as a whole.
export function isFollowUpOverdue(followUp: Pick<CrmFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  return new Date(followUp.scheduled_at).getTime() < Date.now();
}

export function isFollowUpDueToday(followUp: Pick<CrmFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  if (isFollowUpOverdue(followUp)) return false;
  return crmDateKey(new Date(followUp.scheduled_at)) === crmDateKey(new Date());
}

export function isFollowUpUpcoming(followUp: Pick<CrmFollowUpRow, "scheduled_at" | "status">): boolean {
  if (followUp.status !== "pending") return false;
  if (isFollowUpOverdue(followUp)) return false;
  return crmDateKey(new Date(followUp.scheduled_at)) > crmDateKey(new Date());
}

// Sales Training & Call Scripts: read-only reference content for agents.
// Kept as its own top-level section rather than part of the
// opportunity-management screen so it doesn't compete for space there.
export type CrmTrainingMaterialRow = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  content: string;
  sort_order: number;
  created_by: string | null;
  link_url: string | null;
  link_label: string | null;
  // Optional grouping label (migration 0026) - null renders under a
  // default "General Training" heading.
  category: string | null;
};

export const DEFAULT_TRAINING_CATEGORY = "General Training";

export function groupTrainingMaterialsByCategory(
  materials: CrmTrainingMaterialRow[]
): { category: string; materials: CrmTrainingMaterialRow[] }[] {
  const groups = new Map<string, CrmTrainingMaterialRow[]>();
  for (const material of materials) {
    const key = material.category || DEFAULT_TRAINING_CATEGORY;
    const list = groups.get(key) ?? [];
    list.push(material);
    groups.set(key, list);
  }
  // Default/uncategorized group first (existing scripts), then every
  // other category in the order first encountered.
  const orderedKeys = [
    DEFAULT_TRAINING_CATEGORY,
    ...Array.from(groups.keys()).filter((k) => k !== DEFAULT_TRAINING_CATEGORY),
  ];
  return orderedKeys.filter((key) => groups.has(key)).map((category) => ({ category, materials: groups.get(category)! }));
}

// Attendance: agent Clock In / Clock Out sessions (crm_attendance,
// migration 0043). total_hours is null while an agent is still clocked
// in (clock_out_at not yet set) and is computed by the database once
// they clock out, so every reader sees the same figure.
export type CrmAttendanceRow = {
  id: string;
  created_at: string;
  agent_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  total_hours: number | null;
};

// "7h 15m" / "45m" / "-" (still clocked in, or no hours yet).
export function attendanceHoursLabel(hours: number | null): string {
  if (hours === null) return "-";
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (wholeHours === 0) return `${minutes}m`;
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}m`;
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

// Leave Requests (crm_leave_requests, migration 0069). Pure notice-period/
// deduction math lives in src/lib/leave-requests.ts, shared with the Lead
// Generation CRM's identically-shaped leadgen_leave_requests - this row
// type is per-CRM only because the table (and its agent_id FK target,
// crm_users) is.
import type { LeaveAttendanceStatus, LeaveStatus, LeaveType } from "./leave-requests";

export type CrmLeaveRequestRow = {
  id: string;
  agent_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  notice_days: number;
  is_short_notice: boolean;
  submitted_at: string;
  decision_note: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  attendance_status: LeaveAttendanceStatus;
  attendance_marked_at: string | null;
  attendance_marked_by: string | null;
  attendance_marked_by_name: string | null;
  deduction_amount: number | null;
  deduction_reason: string | null;
  deduction_confirmed: boolean;
  deduction_confirmed_by: string | null;
  deduction_confirmed_by_name: string | null;
  deduction_confirmed_at: string | null;
  payroll_applied_id: string | null;
  payroll_applied_at: string | null;
  // Soft-delete only (migration 0076) - a real DELETE would cascade-
  // delete this row's own audit trail, including the very "deleted"
  // entry recording who deleted it and when. The app filters every list
  // query to exclude deleted_at is not null rows instead.
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
  created_at: string;
  updated_at: string;
};

// Joined shape for the admin Leave Requests page (one row per request,
// with the agent's name/email attached so the table doesn't need a
// second round trip per row).
export type CrmLeaveRequestWithAgent = CrmLeaveRequestRow & {
  crm_users: Pick<CrmUserRow, "id" | "full_name" | "email"> | null;
};

export type CrmLeaveRequestAuditLogRow = {
  id: string;
  created_at: string;
  leave_request_id: string;
  agent_id: string | null;
  agent_name: string;
  action:
    | "submitted"
    | "approved"
    | "declined"
    | "attendance_marked_paid_leave"
    | "attendance_marked_unpaid_absence"
    | "deduction_confirmed"
    | "payroll_applied"
    | "edited"
    | "deleted";
  performed_by: string | null;
  performed_by_name: string;
  note: string | null;
  details: Record<string, unknown> | null;
};
