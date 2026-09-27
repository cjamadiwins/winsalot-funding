// Winsalot Growth CRM: Operations Monitoring - pure, DB-agnostic status
// derivation for the 6 monitoring areas (Email/SMS Failures, Stale Leads,
// Appointment Risk, Call KPI, Data Quality, Client Campaign Activity).
// Deliberately its own file, not an extension of crm-types.ts, mirroring
// how sales-coach.ts/growth-sales-coach.ts split "pure scoring logic" from
// "where the raw rows come from" - see crm-monitoring-data.ts for the
// Supabase reads that build the inputs these functions consume.
//
// Every threshold below is a monitoring/alerting judgment call, not a
// change to any existing CRM record or workflow - this module only reads
// existing timestamps/statuses and classifies them. Nothing here writes
// to the database, changes a stage/status, or overwrites historical data.

export type MonitoringStatus = "Healthy" | "Needs Attention" | "Action Required";

export const MONITORING_STATUS_STYLES: Record<MonitoringStatus, string> = {
  Healthy: "bg-emerald-100 text-emerald-800",
  "Needs Attention": "bg-amber-100 text-amber-800",
  "Action Required": "bg-rose-100 text-rose-700",
};

// Worse-first ordering, used to roll up a list of per-record statuses into
// one category-level status (e.g. "this category is Action Required if
// any record in it is").
const STATUS_SEVERITY: Record<MonitoringStatus, number> = { Healthy: 0, "Needs Attention": 1, "Action Required": 2 };

export function worstMonitoringStatus(statuses: MonitoringStatus[]): MonitoringStatus {
  return statuses.reduce<MonitoringStatus>((worst, s) => (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst] ? s : worst), "Healthy");
}

// ---------------------------------------------------------------------
// Business-day (Mon-Fri, America/Toronto) elapsed-time helper - shared
// by Stale Lead, Appointment Risk (follow-up), and Client Campaign
// Activity below, all of which are specified in "business days" rather
// than raw hours. Capped (default 5) since every caller here only cares
// up to a small threshold, not the exact count for a lead untouched for
// months - this keeps the day-by-day loop bounded and cheap regardless
// of how old `fromIso` is.
// ---------------------------------------------------------------------
const MONITORING_TIMEZONE = "America/Toronto";

function monitoringDateKey(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: MONITORING_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addOneDayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function isWeekdayKey(dateKey: string): boolean {
  const [y, m, d] = dateKey.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day !== 0 && day !== 6;
}

// Number of business days strictly between `fromIso` and `now` (0 if
// `fromIso` is today or in the future), capped at `cap` for efficiency -
// every call site here only needs to know "is this at or past N business
// days," never the exact count for a record untouched for months.
export function businessDaysSince(fromIso: string, now: Date = new Date(), cap: number = 5): number {
  const fromKey = monitoringDateKey(new Date(fromIso));
  const nowKey = monitoringDateKey(now);
  if (fromKey >= nowKey) return 0;
  let count = 0;
  let cursor = fromKey;
  while (cursor < nowKey && count < cap) {
    cursor = addOneDayKey(cursor);
    if (isWeekdayKey(cursor)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------
// 1. Email / SMS Failure Monitoring
//
// "1 isolated failure = informational only; 3+ related failures within a
// short period = Warning; continued/repeated failures = Action Required."
// A single/double failure is still returned in the detail list (so Admin
// can see it), it just never pushes the category status above Healthy -
// exactly the "informational only" requirement.
// ---------------------------------------------------------------------
export const COMMUNICATION_WARNING_THRESHOLD = 3;
export const COMMUNICATION_ACTION_THRESHOLD = 6;

export type CommunicationChannel = "email" | "sms";

export type CommunicationFailureRecord = {
  id: string;
  channel: CommunicationChannel;
  recipient: string;
  status: string; // "bounced" | "failed" | "complained" | Twilio's own failed/undelivered
  detail: string | null; // bounce/failure reason, where available
  relatedLabel: string | null; // business/client name, where available
  relatedHref: string | null;
  occurredAt: string;
  // Whether the CRM's existing UI already offers a resend/retry action for
  // this specific record (e.g. "Resend Appointment Notification") - this
  // module never adds a new retry mechanism, only reports what already
  // exists.
  retrySupported: boolean;
};

export function deriveCommunicationMonitoringStatus(failureCount: number): MonitoringStatus {
  if (failureCount >= COMMUNICATION_ACTION_THRESHOLD) return "Action Required";
  if (failureCount >= COMMUNICATION_WARNING_THRESHOLD) return "Needs Attention";
  return "Healthy";
}

// ---------------------------------------------------------------------
// 2. Stale Lead Monitoring
//
// "After 2 business days with no meaningful activity: Needs Attention.
// After 3 business days: Overdue / Action Required." Computed fresh every
// read (never stored), so a stale flag clears itself the instant new
// activity is recorded - nothing to explicitly "clear."
// ---------------------------------------------------------------------
export type StaleOpportunityRecord = {
  opportunityId: string;
  businessName: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  lastMeaningfulActivityAt: string;
  businessDaysSinceActivity: number;
  status: MonitoringStatus;
};

export function deriveStaleLeadStatus(businessDaysSinceActivity: number): MonitoringStatus {
  if (businessDaysSinceActivity >= 3) return "Action Required";
  if (businessDaysSinceActivity >= 2) return "Needs Attention";
  return "Healthy";
}

// The latest of every timestamp that counts as "meaningful activity" per
// the brief (call log, callback/follow-up completed, email sent, note
// added, appointment booked, lead status updated - whichever of these a
// given CRM can actually query timestamps for) - null candidates (no such
// activity yet) are simply ignored, and `createdAt` is always included as
// a floor so a brand-new lead is never treated as stale from the moment
// it's added. A plain list rather than fixed named fields so each CRM's
// data layer can pass exactly the signals its own schema supports.
export function computeLastMeaningfulActivity(createdAt: string, candidates: (string | null)[]): string {
  const valid = candidates.filter((v): v is string => Boolean(v));
  return [createdAt, ...valid].reduce((latest, v) => (new Date(v).getTime() > new Date(latest).getTime() ? v : latest), createdAt);
}

// ---------------------------------------------------------------------
// 3. Appointment Risk Monitoring
//
// Flags are built by the data layer (crm-monitoring-data.ts), which has
// access to the existing reminder-status helpers
// (fetchWinsalotReminderStatusMap/fetchWinsalotSmsReminderStatusMap) -
// this module only rolls a flag list up into one status, so the
// severity rule lives in exactly one place.
// ---------------------------------------------------------------------
export type AppointmentRiskFlag = {
  code: string;
  label: string;
  severity: "warning" | "action";
};

export type AppointmentRiskRecord = {
  appointmentId: string;
  businessName: string;
  appointmentStartAt: string;
  status: string;
  assignedAgentId: string | null;
  flags: AppointmentRiskFlag[];
  monitoringStatus: MonitoringStatus;
};

export function deriveAppointmentRiskStatus(flags: AppointmentRiskFlag[]): MonitoringStatus {
  if (flags.some((f) => f.severity === "action")) return "Action Required";
  if (flags.length > 0) return "Needs Attention";
  return "Healthy";
}

// A completed consultation with no follow-up email sent yet - "Needs
// Attention" once the completion itself is 2+ business days old ("give
// it a day or two before flagging"), "Action Required" once it's been a
// full work week (5+ business days) with still nothing recorded.
export function deriveFollowUpMissingFlag(completedAt: string, now: Date = new Date()): AppointmentRiskFlag | null {
  const days = businessDaysSince(completedAt, now, 5);
  if (days >= 5) return { code: "completed_no_follow_up_5d", label: "Completed 5+ business days ago with no follow-up email sent", severity: "action" };
  if (days >= 2) return { code: "completed_no_follow_up_2d", label: "Completed 2+ business days ago with no follow-up email sent", severity: "warning" };
  return null;
}

// ---------------------------------------------------------------------
// 4. Call KPI Warning
//
// Growth CRM's own existing call-volume standard (CRM_DAILY_CALL_TARGET /
// CRM_WEEKLY_CALL_TARGET, src/lib/crm-performance.ts - already referenced
// by the Dialpad Performance dashboard) is the only existing daily/weekly
// call target this CRM defines, so this reuses it rather than inventing a
// new one. The only per-agent call-count source is the weekly-imported
// Dialpad CSV report (dialpad_user_stats), not a live daily counter, so
// "pace" here is judged against that report's own period rather than a
// literal midnight-to-now count - see crm-monitoring-data.ts.
// ---------------------------------------------------------------------

// "Do not constantly interrupt agents throughout the day" - only ever
// evaluate pace after this hour (America/Toronto), a reasonable
// later-in-the-shift checkpoint.
export const CALL_KPI_CHECKPOINT_HOUR = 14;

export function isPastCallKpiCheckpoint(now: Date = new Date(), timeZone: string = MONITORING_TIMEZONE): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(now)) % 24;
  return hour >= CALL_KPI_CHECKPOINT_HOUR;
}

// Pro-rates the weekly target across however many of the report period's
// business days have elapsed so far (inclusive of the current one), so an
// agent isn't flagged "behind" on a Monday morning just because they
// haven't hit 1/5 of the week yet.
export function expectedCallsByNow(weeklyTarget: number, totalBusinessDaysInPeriod: number, businessDaysElapsedInclusive: number): number {
  if (totalBusinessDaysInPeriod <= 0) return 0;
  const perDay = weeklyTarget / totalBusinessDaysInPeriod;
  return Math.round(perDay * Math.min(Math.max(businessDaysElapsedInclusive, 0), totalBusinessDaysInPeriod));
}

// An agent is only "Behind Pace" once they're meaningfully under the
// pro-rated expectation - a small, normal fluctuation day-to-day
// shouldn't itself read as a warning.
export const CALL_KPI_ON_TRACK_RATIO = 0.7;

export type CallKpiPaceStatus = "Too Early To Tell" | "On Track" | "Behind Pace";

export function deriveCallKpiPace(callsSoFar: number, expectedByNow: number, isPastCheckpoint: boolean): CallKpiPaceStatus {
  if (!isPastCheckpoint) return "Too Early To Tell";
  if (expectedByNow <= 0) return "On Track";
  return callsSoFar / expectedByNow < CALL_KPI_ON_TRACK_RATIO ? "Behind Pace" : "On Track";
}

export function callKpiPaceMonitoringStatus(pace: CallKpiPaceStatus): MonitoringStatus {
  return pace === "Behind Pace" ? "Needs Attention" : "Healthy";
}

export type CallKpiAgentRecord = {
  agentId: string;
  agentName: string;
  callsInPeriod: number;
  weeklyTarget: number;
  periodStart: string;
  periodEnd: string;
  pace: CallKpiPaceStatus;
  status: MonitoringStatus;
};

// ---------------------------------------------------------------------
// 5. Data Quality Monitoring
// ---------------------------------------------------------------------
export type DataQualityRecordType = "opportunity" | "client";

export type DataQualityIssue = {
  recordType: DataQualityRecordType;
  recordId: string;
  businessName: string;
  reasons: string[];
  href: string;
};

// A small number of flagged records is routine data-entry noise (Needs
// Attention, worth an admin's occasional review); a large batch (e.g.
// right after a bad import) signals something systemic worth acting on
// now.
export const DATA_QUALITY_ACTION_THRESHOLD = 10;

export function deriveDataQualityStatus(issueCount: number): MonitoringStatus {
  if (issueCount === 0) return "Healthy";
  if (issueCount >= DATA_QUALITY_ACTION_THRESHOLD) return "Action Required";
  return "Needs Attention";
}

// ---------------------------------------------------------------------
// 6. Client Campaign Activity Monitoring
//
// "Unusually little or no activity during a business day: Needs
// Attention. Inactivity continues into an additional business day:
// Action Required." Only ever evaluated for clients whose status is
// literally 'Active' - Paused/Completed/Archived/Prospect/Pilot clients
// are never flagged (see crm-monitoring-data.ts's own filter).
// ---------------------------------------------------------------------
export type ClientCampaignActivityRecord = {
  clientId: string;
  companyName: string;
  assignedAgentNames: string[];
  lastActivityAt: string | null;
  businessDaysSinceActivity: number;
  status: MonitoringStatus;
};

export function deriveClientCampaignStatus(businessDaysSinceActivity: number): MonitoringStatus {
  if (businessDaysSinceActivity >= 2) return "Action Required";
  if (businessDaysSinceActivity >= 1) return "Needs Attention";
  return "Healthy";
}

// ---------------------------------------------------------------------
// Dashboard summary rollup - the single compact "Operations Monitoring"
// card's data. Each category contributes its own action/warning/healthy
// item counts; the card's top-line totals are simply their sum, so the
// card's numbers can never disagree with what the detail page's tabs show
// for the same categories.
// ---------------------------------------------------------------------
export type MonitoringCategoryKey = "email_sms" | "stale_leads" | "appointments" | "agent_kpi" | "data_quality" | "client_campaigns";

export type MonitoringCategorySummary = {
  key: MonitoringCategoryKey;
  label: string;
  status: MonitoringStatus;
  headline: string;
  actionRequiredCount: number;
  warningCount: number;
  healthyCount: number;
};

export type OperationsMonitoringSummary = {
  categories: MonitoringCategorySummary[];
  totalActionRequired: number;
  totalWarnings: number;
  totalHealthy: number;
};

export function summarizeOperationsMonitoring(categories: MonitoringCategorySummary[]): OperationsMonitoringSummary {
  return {
    categories,
    totalActionRequired: categories.reduce((sum, c) => sum + c.actionRequiredCount, 0),
    totalWarnings: categories.reduce((sum, c) => sum + c.warningCount, 0),
    totalHealthy: categories.reduce((sum, c) => sum + c.healthyCount, 0),
  };
}
