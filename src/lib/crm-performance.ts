// Agent Performance Report (Cleaning CRM): pure, client-safe stats over a
// batch of per-lead quote records. Deliberately its own file, not an
// extension of crm-types.ts, mirroring how the Lead Gen CRM's equivalent
// report (lib/leadgen-performance.ts) keeps its own date-bucketing logic
// self-contained rather than bloating the shared types module.
//
// Unlike the Lead Gen report (one weekly target on one event type), this
// one tracks two goals against every two-week period:
//   - Quotes Sent: quote_requests.customer_quote_sent_at - the moment an
//     admin actually sends the customer-facing quote (Send Quote to
//     Customer), not when a quote is merely requested from a provider.
//   - Quotes Received: the earliest provider_quote_submissions row for
//     that quote request - the moment a provider submits a completed
//     price, not when a request is created or assigned.
// Both are credited to crm_leads.assigned_agent_id - the agent who owns
// the customer relationship - never to the provider (providers aren't CRM
// agents and have no login here), so "received" always reflects who was
// handling that lead, not who happened to submit the price.

export const CRM_BIWEEKLY_QUOTES_SENT_TARGET = 4;
export const CRM_BIWEEKLY_QUOTES_RECEIVED_TARGET = 1;

// How many past periods (in addition to the current one) computeCrmAgentPerformance
// returns as history - about 4 months, generous enough for an admin to spot a
// trend without the list growing unbounded as leads accumulate for years.
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

export type CrmPerformanceQuoteRecord = {
  leadId: string;
  assignedAgentId: string | null;
  businessName: string;
  quoteSentAt: string | null;
  quoteReceivedAt: string | null;
};

export type CrmBiweeklyPeriodPerformance = {
  periodStart: string; // YYYY-MM-DD, Monday
  periodEnd: string; // YYYY-MM-DD, second Sunday (13 days after periodStart)
  quotesSent: number;
  quotesReceived: number;
  sentPercentage: number; // capped at 100 for display
  receivedPercentage: number; // capped at 100 for display
  overallPercentage: number; // capped at 100, average of the two capped percentages
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

function addDays(dateKey: string, days: number): string {
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
function biweeklyPeriodStartOf(dateKey: string): string {
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

export type CrmPerformanceTier = "green" | "yellow" | "red";

// 70-100% green, 40-69% yellow, 0-39% red - drives the percentage badges,
// progress bars, and performance status together so they never disagree
// for the same metric.
export function crmPerformanceTier(percentage: number): CrmPerformanceTier {
  if (percentage >= 70) return "green";
  if (percentage >= 40) return "yellow";
  return "red";
}

function computePeriod(
  records: CrmPerformanceQuoteRecord[],
  agentId: string,
  periodStart: string,
  periodEnd: string
): CrmBiweeklyPeriodPerformance {
  let quotesSent = 0;
  let quotesReceived = 0;

  for (const record of records) {
    if (record.assignedAgentId !== agentId) continue;
    if (record.quoteSentAt) {
      const key = crmDateKey(record.quoteSentAt);
      if (key >= periodStart && key <= periodEnd) quotesSent++;
    }
    if (record.quoteReceivedAt) {
      const key = crmDateKey(record.quoteReceivedAt);
      if (key >= periodStart && key <= periodEnd) quotesReceived++;
    }
  }

  const sentPercentage = Math.min(100, Math.round((quotesSent / CRM_BIWEEKLY_QUOTES_SENT_TARGET) * 100));
  const receivedPercentage = Math.min(100, Math.round((quotesReceived / CRM_BIWEEKLY_QUOTES_RECEIVED_TARGET) * 100));

  return {
    periodStart,
    periodEnd,
    quotesSent,
    quotesReceived,
    sentPercentage,
    receivedPercentage,
    overallPercentage: Math.round((sentPercentage + receivedPercentage) / 2),
  };
}

// Computes one agent's current biweekly snapshot plus history from a shared
// batch of per-lead quote records (the caller fetches once and calls this
// per agent, rather than one query per agent). `now` is only ever
// overridden by tests - production callers always use the default (real
// "now").
export function computeCrmAgentPerformance(
  records: CrmPerformanceQuoteRecord[],
  agentId: string,
  now: Date = new Date()
): CrmAgentPerformance {
  const currentPeriodStart = biweeklyPeriodStartOf(crmDateKey(now));

  const periods: CrmBiweeklyPeriodPerformance[] = [];
  for (let i = 0; i <= CRM_PERFORMANCE_HISTORY_PERIODS; i++) {
    const periodStart = addDays(currentPeriodStart, -14 * i);
    const periodEnd = addDays(periodStart, 13);
    periods.push(computePeriod(records, agentId, periodStart, periodEnd));
  }

  const [current, ...history] = periods;

  return { agentId, current, history };
}
