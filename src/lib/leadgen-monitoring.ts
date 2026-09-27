// Lead Generation CRM: Operations Monitoring - pure, DB-agnostic status
// derivation for the 6 monitoring areas. Deliberately its own file, not
// shared with the Growth CRM's crm-monitoring.ts, matching this
// codebase's established convention of keeping the two CRMs' business
// logic fully independent even where the numbers/thresholds happen to
// match (see crm-performance.ts / leadgen-performance.ts for the same
// pattern). Nothing here writes to the database or changes any monitored
// record - see leadgen-monitoring-data.ts for the Supabase reads.

export type MonitoringStatus = "Healthy" | "Needs Attention" | "Action Required";

export const MONITORING_STATUS_STYLES: Record<MonitoringStatus, string> = {
  Healthy: "bg-emerald-100 text-emerald-800",
  "Needs Attention": "bg-amber-100 text-amber-800",
  "Action Required": "bg-rose-100 text-rose-700",
};

const STATUS_SEVERITY: Record<MonitoringStatus, number> = { Healthy: 0, "Needs Attention": 1, "Action Required": 2 };

export function worstMonitoringStatus(statuses: MonitoringStatus[]): MonitoringStatus {
  return statuses.reduce<MonitoringStatus>((worst, s) => (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst] ? s : worst), "Healthy");
}

// ---------------------------------------------------------------------
// Business-day (Mon-Fri, America/Toronto) elapsed-time helper - see
// crm-monitoring.ts's identical function for the full rationale
// (duplicated rather than shared, per this codebase's convention).
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
// 1. Email / SMS Failure Monitoring - same thresholds as the brief
// specifies (1 isolated failure is informational only; 3+ = Warning; 6+ =
// Action Required).
// ---------------------------------------------------------------------
export const COMMUNICATION_WARNING_THRESHOLD = 3;
export const COMMUNICATION_ACTION_THRESHOLD = 6;

export type CommunicationChannel = "email" | "sms";

export type CommunicationFailureRecord = {
  id: string;
  channel: CommunicationChannel;
  recipient: string;
  status: string;
  detail: string | null;
  relatedLabel: string | null;
  relatedHref: string | null;
  occurredAt: string;
  retrySupported: boolean;
};

export function deriveCommunicationMonitoringStatus(failureCount: number): MonitoringStatus {
  if (failureCount >= COMMUNICATION_ACTION_THRESHOLD) return "Action Required";
  if (failureCount >= COMMUNICATION_WARNING_THRESHOLD) return "Needs Attention";
  return "Healthy";
}

// ---------------------------------------------------------------------
// 2. Stale Lead Monitoring - "2 business days: Needs Attention; 3
// business days: Action Required," reusing last_contacted_at (the same
// column the shared sales-coach.ts's isStaleContact already reads).
// ---------------------------------------------------------------------
export type StaleLeadRecord = {
  leadId: string;
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

export function computeLastMeaningfulActivity(createdAt: string, candidates: (string | null)[]): string {
  const valid = candidates.filter((v): v is string => Boolean(v));
  return [createdAt, ...valid].reduce((latest, v) => (new Date(v).getTime() > new Date(latest).getTime() ? v : latest), createdAt);
}

// ---------------------------------------------------------------------
// 3. Appointment Risk Monitoring
// ---------------------------------------------------------------------
export type AppointmentRiskFlag = {
  code: string;
  label: string;
  severity: "warning" | "action";
};

export type AppointmentRiskRecord = {
  appointmentId: string;
  businessName: string;
  appointmentDate: string;
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

// ---------------------------------------------------------------------
// 4. Call KPI Warning - reuses the CRM's own existing 80/day, 400/week
// target verbatim (LEADGEN_DAILY_CALL_TARGET/LEADGEN_WEEKLY_CALL_TARGET,
// src/lib/leadgen-agent-kpi.ts) rather than re-deriving it here.
// ---------------------------------------------------------------------
export const CALL_KPI_CHECKPOINT_HOUR = 14;

export function isPastCallKpiCheckpoint(now: Date = new Date(), timeZone: string = MONITORING_TIMEZONE): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(now)) % 24;
  return hour >= CALL_KPI_CHECKPOINT_HOUR;
}

export type CallKpiPaceStatus = "Too Early To Tell" | "On Track" | "Behind Pace";

// The daily call target is already tracked as a 0-100 capped percentage
// (dailyCallProgressPct, computeLeadgenAgentActivityKpis) - "Behind Pace"
// once past the checkpoint and meaningfully under half of today's target,
// matching the brief's own worked example (39/80 = Behind Pace, 67/80 =
// On Track).
export const CALL_KPI_BEHIND_PACE_PCT = 50;

export function deriveCallKpiPace(dailyCallProgressPct: number, isPastCheckpoint: boolean): CallKpiPaceStatus {
  if (!isPastCheckpoint) return "Too Early To Tell";
  return dailyCallProgressPct < CALL_KPI_BEHIND_PACE_PCT ? "Behind Pace" : "On Track";
}

export function callKpiPaceMonitoringStatus(pace: CallKpiPaceStatus): MonitoringStatus {
  return pace === "Behind Pace" ? "Needs Attention" : "Healthy";
}

export type CallKpiAgentRecord = {
  agentId: string;
  agentName: string;
  callsToday: number;
  dailyTarget: number;
  pace: CallKpiPaceStatus;
  status: MonitoringStatus;
};

// ---------------------------------------------------------------------
// 5. Data Quality Monitoring
// ---------------------------------------------------------------------
export type DataQualityIssue = {
  leadId: string;
  businessName: string;
  reasons: string[];
  href: string;
};

export const DATA_QUALITY_ACTION_THRESHOLD = 10;

export function deriveDataQualityStatus(issueCount: number): MonitoringStatus {
  if (issueCount === 0) return "Healthy";
  if (issueCount >= DATA_QUALITY_ACTION_THRESHOLD) return "Action Required";
  return "Needs Attention";
}

// ---------------------------------------------------------------------
// 6. Client Campaign Activity Monitoring - only campaigns with
// status='active' (leadgen_campaigns), never paused/completed.
// ---------------------------------------------------------------------
export type CampaignActivityRecord = {
  campaignId: string;
  campaignName: string;
  clientId: string;
  clientName: string;
  assignedAgentNames: string[];
  lastActivityAt: string | null;
  callsToday: number;
  emailsToday: number;
  leadsGenerated: number;
  appointmentsBooked: number;
  businessDaysSinceActivity: number;
  status: MonitoringStatus;
};

export function deriveCampaignActivityStatus(businessDaysSinceActivity: number): MonitoringStatus {
  if (businessDaysSinceActivity >= 2) return "Action Required";
  if (businessDaysSinceActivity >= 1) return "Needs Attention";
  return "Healthy";
}

// ---------------------------------------------------------------------
// Dashboard summary rollup
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
