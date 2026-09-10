// Agent Performance Report (Winsalot Growth CRM): pure, client-safe stats
// over a batch of per-opportunity records. Deliberately its own file, not
// an extension of crm-types.ts, mirroring how the Lead Gen CRM's
// equivalent report (lib/leadgen-performance.ts) keeps its own
// date-bucketing logic self-contained rather than bloating the shared
// types module.
//
// Tracks five goals against every two-week period, all credited to
// crm_opportunities.assigned_agent_id:
//   - Consultations booked: an actual active winsalot_appointments row
//     created in the period. An opportunity's optional consultation_date
//     field is planning context only and never proves a booking occurred.
//   - Opportunities added: opportunities created in the period. Adding a
//     lead is the event, so later stage changes do not move or manufacture
//     this credit.
//   - Applications submitted: application_submitted_at falling in the
//     period, with application_submitted_by identifying the credited agent
//     (Business Financing / Both Services opportunities only).
//   - Emails delivered: the first manually sent CRM prospect email that
//     Resend confirms delivered for an opportunity. Automated appointment
//     reminders are excluded, and repeat emails cannot inflate the score.
//   - Clients won: closed_at falling in the period, stage = Client Won.
//
// application_submitted_at / application_submitted_by are set once by the
// explicit "Mark Application Submitted" action. Merely changing a pipeline
// stage never awards an application or delivered-email point.

export const CRM_BIWEEKLY_CONSULTATIONS_TARGET = 4;
export const CRM_BIWEEKLY_QUALIFIED_TARGET = 6;
export const CRM_BIWEEKLY_APPLICATIONS_TARGET = 2;
export const CRM_BIWEEKLY_PROPOSALS_TARGET = 4;
export const CRM_BIWEEKLY_WON_TARGET = 2;

// Every one of the five scorecard categories carries the same 20% weight
// (5 x 20% = 100%), so the overall score is just their capped-percentage
// average - see computeCrmPeriodPerformance's overallPercentage below.
// Exported so the UI can render each category's "weighted contribution"
// (its capped percentage x this weight) next to its raw percentage,
// exactly matching the calculation that produced the gauge's center score.
export const CRM_CATEGORY_WEIGHT = 0.2;

// How many past periods (in addition to the current one) computeCrmAgentPerformance
// returns as history - about 4 months, generous enough for an admin to spot a
// trend without the list growing unbounded as opportunities accumulate for years.
const CRM_PERFORMANCE_HISTORY_PERIODS = 8;

// Matches LEADGEN_PERFORMANCE_TIMEZONE (lib/leadgen-performance.ts) - "this
// period" should mean the same calendar dates an agent or admin sees on
// their own clock, not whatever timezone the server happens to run in.
export const CRM_PERFORMANCE_TIMEZONE = "America/Toronto";

// A known Monday to anchor two-week periods to, so "period 2" always means
// the same 14 days no matter when this function runs - without a fixed
// anchor, "biweekly" is ambiguous (there's no calendar concept of a
// two-week boundary the way Monday is for a week).
const BIWEEKLY_EPOCH_MONDAY = "2024-01-01";

export type CrmPerformanceOpportunityRecord = {
  opportunityId: string;
  assignedAgentId: string | null;
  businessName: string;
  opportunityType: "lead_generation" | "business_financing" | "both_services";
  stage: string;
  createdAt: string;
  consultationBookings: CrmPerformanceConsultationBooking[];
  deliveredEmails: CrmPerformanceDeliveredEmail[];
  applicationSubmittedAt: string | null;
  applicationSubmittedByAgentId: string | null;
  closedAt: string | null;
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

export type CrmBiweeklyPeriodPerformance = {
  periodStart: string; // YYYY-MM-DD, Monday
  periodEnd: string; // YYYY-MM-DD, second Sunday (13 days after periodStart)
  consultationsBooked: number;
  qualifiedOpportunities: number;
  applicationsSubmitted: number;
  proposalsSent: number;
  clientsWon: number;
  consultationsPercentage: number; // capped at 100 for display
  qualifiedPercentage: number;
  applicationsPercentage: number;
  proposalsPercentage: number;
  wonPercentage: number;
  overallPercentage: number; // capped at 100, average of the five capped percentages
};

export type CrmAgentPerformance = {
  agentId: string;
  current: CrmBiweeklyPeriodPerformance;
  history: CrmBiweeklyPeriodPerformance[]; // previous periods, most recent first
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

// Integer number of days from `fromKey` to `toKey` (Date.UTC so this is
// never off by one around a DST transition).
function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

// Monday of the calendar week containing dateKey.
function mondayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(dateKey, diffToMonday);
}

// The Monday that starts the two-week period containing dateKey, aligned to
// BIWEEKLY_EPOCH_MONDAY so periods never drift depending on when this runs.
// Exported so the Monthly Performance history module
// (crm-performance-history.ts) can find "which period does this month's
// 1st fall in" the same way this file already does internally.
export function biweeklyPeriodStartOf(dateKey: string): string {
  const monday = mondayOf(dateKey);
  const weeksSinceEpoch = Math.floor(daysBetween(BIWEEKLY_EPOCH_MONDAY, monday) / 7);
  return weeksSinceEpoch % 2 === 0 ? monday : addDays(monday, -7);
}

export function crmBiweeklyRangeLabel(periodStart: string, periodEnd: string): string {
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
): CrmBiweeklyPeriodPerformance {
  let consultationsBooked = 0;
  let qualifiedOpportunities = 0;
  let applicationsSubmitted = 0;
  let proposalsSent = 0;
  let clientsWon = 0;

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

    if (record.assignedAgentId === agentId && inRange(record.createdAt)) qualifiedOpportunities++;
    if (
      record.applicationSubmittedByAgentId === agentId &&
      record.applicationSubmittedAt &&
      record.opportunityType !== "lead_generation" &&
      inRange(record.applicationSubmittedAt)
    ) {
      applicationsSubmitted++;
    }

    // Only the first confirmed delivery for an opportunity represents the
    // proposal/email milestone. Later follow-ups must not score repeatedly.
    const firstDeliveredEmail = record.deliveredEmails.reduce<CrmPerformanceDeliveredEmail | null>(
      (earliest, email) => (!earliest || email.deliveredAt < earliest.deliveredAt ? email : earliest),
      null
    );
    if (firstDeliveredEmail?.agentId === agentId && inRange(firstDeliveredEmail.deliveredAt)) proposalsSent++;

    if (record.assignedAgentId === agentId && record.stage === "Client Won" && record.closedAt && inRange(record.closedAt)) {
      clientsWon++;
    }
  }

  const consultationsPercentage = pct(consultationsBooked, CRM_BIWEEKLY_CONSULTATIONS_TARGET);
  const qualifiedPercentage = pct(qualifiedOpportunities, CRM_BIWEEKLY_QUALIFIED_TARGET);
  const applicationsPercentage = pct(applicationsSubmitted, CRM_BIWEEKLY_APPLICATIONS_TARGET);
  const proposalsPercentage = pct(proposalsSent, CRM_BIWEEKLY_PROPOSALS_TARGET);
  const wonPercentage = pct(clientsWon, CRM_BIWEEKLY_WON_TARGET);

  return {
    periodStart,
    periodEnd,
    consultationsBooked,
    qualifiedOpportunities,
    applicationsSubmitted,
    proposalsSent,
    clientsWon,
    consultationsPercentage,
    qualifiedPercentage,
    applicationsPercentage,
    proposalsPercentage,
    wonPercentage,
    overallPercentage: Math.round(
      (consultationsPercentage + qualifiedPercentage + applicationsPercentage + proposalsPercentage + wonPercentage) / 5
    ),
  };
}

// Computes one agent's current biweekly snapshot plus history from a shared
// batch of per-opportunity records (the caller fetches once and calls this
// per agent, rather than one query per agent). `now` is only ever
// overridden by tests - production callers always use the default (real
// "now").
export function computeCrmAgentPerformance(
  records: CrmPerformanceOpportunityRecord[],
  agentId: string,
  now: Date = new Date()
): CrmAgentPerformance {
  const currentPeriodStart = biweeklyPeriodStartOf(crmDateKey(now));

  const periods: CrmBiweeklyPeriodPerformance[] = [];
  for (let i = 0; i <= CRM_PERFORMANCE_HISTORY_PERIODS; i++) {
    const periodStart = addDays(currentPeriodStart, -14 * i);
    const periodEnd = addDays(periodStart, 13);
    periods.push(computeCrmPeriodPerformance(records, agentId, periodStart, periodEnd));
  }

  const [current, ...history] = periods;

  return { agentId, current, history };
}
