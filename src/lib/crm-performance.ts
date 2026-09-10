// Agent Performance Report (Winsalot Growth CRM): pure, client-safe stats
// over a batch of per-opportunity records. Deliberately its own file, not
// an extension of crm-types.ts, mirroring how the Lead Gen CRM's
// equivalent report (lib/leadgen-performance.ts) keeps its own
// date-bucketing logic self-contained rather than bloating the shared
// types module.
//
// Tracks three goals against every Monday-Friday work week, all credited
// to crm_opportunities.assigned_agent_id:
//   - Consultations booked: an actual active winsalot_appointments row
//     created in the period. An opportunity's optional consultation_date
//     field is planning context only and never proves a booking occurred.
//   - Opportunity leads added: opportunities created in the period. Adding
//     a lead is the event, so later stage changes do not move or
//     manufacture this credit.
//   - Emails delivered: every manually sent CRM prospect email that Resend
//     confirms delivered for an opportunity, credited to whichever agent
//     sent it. Automated appointment reminders are excluded. Draft,
//     scheduled, pending, bounced, and failed emails are never counted -
//     only a confirmed delivered_at reaches this file at all (see
//     crm-performance-data.ts).
//
// Each metric is computed independently from its own source data, so one
// activity (e.g. adding an opportunity) can never also credit another
// metric (e.g. emails delivered).
//
// The reporting week is Monday through Friday only - a fixed 5-day window
// that starts fresh every Monday. Weekend activity (Saturday/Sunday) falls
// outside every period and is never credited toward any week's targets.

export const CRM_WEEKLY_CONSULTATIONS_TARGET = 4;
export const CRM_WEEKLY_LEADS_ADDED_TARGET = 12;
export const CRM_WEEKLY_EMAILS_DELIVERED_TARGET = 12;

// Every one of the three scorecard categories carries the same 1/3 weight
// (3 x 1/3 = 100%), so the overall score is just their capped-percentage
// average - see computeCrmPeriodPerformance's overallPercentage below.
// Exported so the UI can render each category's "weighted contribution"
// (its capped percentage x this weight) next to its raw percentage,
// exactly matching the calculation that produced the gauge's center score.
export const CRM_CATEGORY_WEIGHT = 1 / 3;

// How many past weekly periods (in addition to the current one)
// computeCrmAgentPerformance returns as history - about 4 months, generous
// enough for an admin to spot a trend without the list growing unbounded
// as opportunities accumulate for years.
const CRM_PERFORMANCE_HISTORY_PERIODS = 16;

// Matches LEADGEN_PERFORMANCE_TIMEZONE (lib/leadgen-performance.ts) - "this
// period" should mean the same calendar dates an agent or admin sees on
// their own clock, not whatever timezone the server happens to run in.
export const CRM_PERFORMANCE_TIMEZONE = "America/Toronto";

export type CrmPerformanceOpportunityRecord = {
  opportunityId: string;
  assignedAgentId: string | null;
  businessName: string;
  createdAt: string;
  consultationBookings: CrmPerformanceConsultationBooking[];
  deliveredEmails: CrmPerformanceDeliveredEmail[];
};

export type CrmPerformanceConsultationBooking = {
  appointmentId: string;
  assignedAgentId: string | null;
  bookedAt: string;
};

export type CrmPerformanceDeliveredEmail = {
  emailId: string;
  agentId: string | null;
  deliveredAt: string;
};

export type CrmWeeklyPeriodPerformance = {
  periodStart: string; // YYYY-MM-DD, Monday
  periodEnd: string; // YYYY-MM-DD, Friday (4 days after periodStart)
  consultationsBooked: number;
  leadsAdded: number;
  emailsDelivered: number;
  consultationsPercentage: number; // capped at 100 for display
  leadsAddedPercentage: number;
  emailsDeliveredPercentage: number;
  overallPercentage: number; // capped at 100, average of the three capped percentages
};

export type CrmAgentPerformance = {
  agentId: string;
  current: CrmWeeklyPeriodPerformance;
  history: CrmWeeklyPeriodPerformance[]; // previous periods, most recent first
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD" calendar date a timestamp falls on in CRM_PERFORMANCE_TIMEZONE.
export function crmDateKey(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_PERFORMANCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

// Monday of the calendar week containing dateKey - the start of the
// Monday-through-Friday reporting week. A Saturday/Sunday date resolves to
// the Monday of the week already in progress (the just-finished work
// week), not the following one, so "today" on a weekend still shows that
// week's results rather than jumping ahead to a period that hasn't
// started. Every Monday this rolls forward automatically, so the weekly
// metrics reset the moment a new Monday begins - no separate reset step
// is needed, and no historical data is ever touched by the rollover.
export function crmWeekStartOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(dateKey, diffToMonday);
}

export function crmWeeklyRangeLabel(periodStart: string, periodEnd: string): string {
  const [sy, sm, sd] = periodStart.split("-").map(Number);
  const [ey, em, ed] = periodEnd.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = new Date(ey, em - 1, ed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${start} – ${end}`;
}

export type CrmPerformanceTier = "red" | "yellow" | "green" | "blue";

// Gauge bands: 0-39 red (Needs Improvement), 40-59 yellow (Fair), 60-79
// green (Good), 80-100 blue (Excellent) - drives the gauge's needle,
// centre score, colour band, status label, progress bars, and detailed
// scorecard together so none of them can ever disagree for the same
// percentage.
export function crmPerformanceTier(percentage: number): CrmPerformanceTier {
  if (percentage >= 80) return "blue";
  if (percentage >= 60) return "green";
  if (percentage >= 40) return "yellow";
  return "red";
}

export const CRM_PERFORMANCE_TIER_LABEL: Record<CrmPerformanceTier, string> = {
  red: "Needs Improvement",
  yellow: "Fair",
  green: "Good",
  blue: "Excellent",
};

function pct(count: number, target: number): number {
  return Math.min(100, Math.round((count / target) * 100));
}

// Exported so the Monthly Performance history module can compute an
// arbitrary period's totals the same way this file's own current/history
// periods are computed, without duplicating (or drifting from) this
// credited-opportunity filter.
export function computeCrmPeriodPerformance(
  records: CrmPerformanceOpportunityRecord[],
  agentId: string,
  periodStart: string,
  periodEnd: string
): CrmWeeklyPeriodPerformance {
  let consultationsBooked = 0;
  let leadsAdded = 0;
  let emailsDelivered = 0;

  const inRange = (iso: string) => {
    const key = crmDateKey(iso);
    return key >= periodStart && key <= periodEnd;
  };

  for (const record of records) {
    // Consultation credit belongs to the agent stored on the real
    // appointment at booking time. It must not move if the opportunity is
    // later reassigned, and consultation_date alone must never create it.
    for (const booking of record.consultationBookings) {
      if (booking.assignedAgentId === agentId && inRange(booking.bookedAt)) consultationsBooked++;
    }

    if (record.assignedAgentId === agentId && inRange(record.createdAt)) leadsAdded++;

    // Every confirmed delivery counts, not only the first for an
    // opportunity - a real follow-up email the agent actually sent and
    // Resend actually delivered is a genuine, separate outreach action.
    for (const email of record.deliveredEmails) {
      if (email.agentId === agentId && inRange(email.deliveredAt)) emailsDelivered++;
    }
  }

  const consultationsPercentage = pct(consultationsBooked, CRM_WEEKLY_CONSULTATIONS_TARGET);
  const leadsAddedPercentage = pct(leadsAdded, CRM_WEEKLY_LEADS_ADDED_TARGET);
  const emailsDeliveredPercentage = pct(emailsDelivered, CRM_WEEKLY_EMAILS_DELIVERED_TARGET);

  return {
    periodStart,
    periodEnd,
    consultationsBooked,
    leadsAdded,
    emailsDelivered,
    consultationsPercentage,
    leadsAddedPercentage,
    emailsDeliveredPercentage,
    overallPercentage: Math.round((consultationsPercentage + leadsAddedPercentage + emailsDeliveredPercentage) / 3),
  };
}

// Computes one agent's current weekly snapshot plus history from a shared
// batch of per-opportunity records (the caller fetches once and calls this
// per agent, rather than one query per agent). `now` is only ever
// overridden by tests - production callers always use the default (real
// "now").
export function computeCrmAgentPerformance(
  records: CrmPerformanceOpportunityRecord[],
  agentId: string,
  now: Date = new Date()
): CrmAgentPerformance {
  const currentPeriodStart = crmWeekStartOf(crmDateKey(now));

  const periods: CrmWeeklyPeriodPerformance[] = [];
  for (let i = 0; i <= CRM_PERFORMANCE_HISTORY_PERIODS; i++) {
    const periodStart = addDays(currentPeriodStart, -7 * i);
    const periodEnd = addDays(periodStart, 4);
    periods.push(computeCrmPeriodPerformance(records, agentId, periodStart, periodEnd));
  }

  const [current, ...history] = periods;

  return { agentId, current, history };
}
