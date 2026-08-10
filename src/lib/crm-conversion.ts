// Cleaning CRM: pure, client-safe calculations for the Lead-to-Quote Rate
// KPI card (admin "Results by Agent" on /admin/crm/leads, agent's own
// card on /agent/dashboard). Mirrors the Lead Generation CRM's equivalent
// module (lib/leadgen-agent-results.ts) - same Today/This Week/This
// Month/All Time filter set and Monday-start week - duplicated rather
// than shared, matching this codebase's existing convention of keeping
// the two CRMs' logic fully independent (see crm-types.ts's CRM_TIMEZONE
// comment).
//
// Both Total Leads and Quotes Sent are gated by the same cohort: leads
// *created* within the active date range, and of those, how many
// currently have a quote sent (quoteSentAt set, regardless of exactly
// when within/after that range it was sent). This is the same "created
// in this period, does it currently show the later outcome" rule the
// Lead Gen CRM's own Results by Agent chart already uses for its
// Appointments Booked metric - it keeps the rate a same-cohort ratio
// that can never exceed 100%.
//
// quoteSentAt itself is quote_requests.customer_quote_sent_at - the same
// "when does a quote count as sent" timestamp the Agent Performance
// Report already uses (crm-performance.ts), not crm_leads.stage, which
// only reflects a lead's *current* stage and would undercount once a
// lead progresses past "Quote sent to customer" (e.g. to Customer
// accepted/declined).

import { crmDateKey } from "./crm-performance";

export const CRM_RESULTS_DATE_FILTERS = ["today", "week", "month", "all"] as const;
export type CrmResultsDateFilter = (typeof CRM_RESULTS_DATE_FILTERS)[number];

export const CRM_RESULTS_DATE_FILTER_LABEL: Record<CrmResultsDateFilter, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

// null = All Time (no date restriction at all).
export type CrmResultsDateRange = { start: string; end: string } | null;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

function mondayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(dateKey, diffToMonday);
}

function monthStartOf(dateKey: string): string {
  const [y, m] = dateKey.split("-").map(Number);
  return `${y}-${pad2(m)}-01`;
}

function monthEndOf(dateKey: string): string {
  const [y, m] = dateKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(lastDay)}`;
}

export function crmResultsDateRange(filter: CrmResultsDateFilter, now: Date = new Date()): CrmResultsDateRange {
  const todayKey = crmDateKey(now);
  if (filter === "today") return { start: todayKey, end: todayKey };
  if (filter === "week") {
    const start = mondayOf(todayKey);
    return { start, end: addDays(start, 6) };
  }
  if (filter === "month") return { start: monthStartOf(todayKey), end: monthEndOf(todayKey) };
  return null;
}

// Exported so any UI that needs to build its own drilldown list (the
// exact leads behind a rate for the current filter/agent) can reuse the
// identical in-range rule this file's own counts already use.
export function isoInRange(iso: string | null, range: CrmResultsDateRange): boolean {
  if (!range) return true;
  if (!iso) return false;
  const key = crmDateKey(new Date(iso));
  return key >= range.start && key <= range.end;
}

// Lead-to-Quote Rate = Quotes Sent / Total Leads * 100 for the same
// cohort (leads created within the active date range) - 0 with no leads
// in that cohort, never NaN/Infinity.
export function leadToQuoteRate(quotesSent: number, totalLeads: number): number {
  if (totalLeads <= 0) return 0;
  return (quotesSent / totalLeads) * 100;
}

// "20.0%" - one decimal place, per brief.
export function formatConversionRate(rate: number): string {
  return `${rate.toFixed(1)}%`;
}

export type CrmLeadToQuoteRecord = {
  leadId: string;
  businessName: string;
  assignedAgentId: string | null;
  createdAt: string;
  quoteSentAt: string | null;
};

export type CrmConversionRow = {
  agentId: string;
  agentName: string;
  totalLeads: number;
  quotesSent: number;
  rate: number;
};

export function buildCrmAgentConversionResults(
  agents: { id: string; full_name: string; email?: string }[],
  records: CrmLeadToQuoteRecord[],
  filter: CrmResultsDateFilter,
  now: Date = new Date()
): CrmConversionRow[] {
  const range = crmResultsDateRange(filter, now);

  const byAgent = new Map<string, CrmConversionRow>();
  for (const agent of agents) {
    byAgent.set(agent.id, {
      agentId: agent.id,
      agentName: agent.full_name || agent.email || "Agent",
      totalLeads: 0,
      quotesSent: 0,
      rate: 0,
    });
  }

  for (const record of records) {
    if (!record.assignedAgentId) continue;
    const row = byAgent.get(record.assignedAgentId);
    // Former/inactive agent no longer in the active roster - excluded the
    // same way the leads table's own agent dropdown already excludes them.
    if (!row) continue;
    if (!isoInRange(record.createdAt, range)) continue;

    row.totalLeads++;
    if (record.quoteSentAt) row.quotesSent++;
  }

  for (const row of byAgent.values()) row.rate = leadToQuoteRate(row.quotesSent, row.totalLeads);

  return Array.from(byAgent.values());
}

export type CrmOverallConversion = {
  totalLeads: number;
  quotesSent: number;
  rate: number;
};

export function computeCrmOverallConversion(
  records: CrmLeadToQuoteRecord[],
  filter: CrmResultsDateFilter,
  now: Date = new Date()
): CrmOverallConversion {
  const range = crmResultsDateRange(filter, now);
  let totalLeads = 0;
  let quotesSent = 0;

  for (const record of records) {
    if (!isoInRange(record.createdAt, range)) continue;
    totalLeads++;
    if (record.quoteSentAt) quotesSent++;
  }

  return { totalLeads, quotesSent, rate: leadToQuoteRate(quotesSent, totalLeads) };
}
