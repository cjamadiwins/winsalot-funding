// Winsalot Growth CRM: pure, client-safe calculations for the
// Prospect-to-Client Rate KPI card (admin "Results by Agent" on
// /admin/crm/opportunities, agent's own card on /agent/dashboard). Mirrors
// the Lead Generation CRM's equivalent module (lib/leadgen-agent-results.ts)
// - same Today/This Week/This Month/All Time filter set and Monday-start
// week - duplicated rather than shared, matching this codebase's existing
// convention of keeping the two CRMs' logic fully independent (see
// crm-types.ts's CRM_TIMEZONE comment).
//
// Both Total Prospects and Clients Won are gated by the same cohort:
// opportunities *created* within the active date range, and of those, how
// many currently have stage = 'Client Won' (regardless of exactly when
// within/after that range they were won). This is the same "created in
// this period, does it currently show the later outcome" rule the Lead
// Gen CRM's own Results by Agent chart already uses for its Appointments
// Booked metric - it keeps the rate a same-cohort ratio that can never
// exceed 100%.

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
// exact opportunities behind a rate for the current filter/agent) can
// reuse the identical in-range rule this file's own counts already use.
export function isoInRange(iso: string | null, range: CrmResultsDateRange): boolean {
  if (!range) return true;
  if (!iso) return false;
  const key = crmDateKey(new Date(iso));
  return key >= range.start && key <= range.end;
}

// Prospect-to-Client Rate = Clients Won / Total Prospects * 100 for the
// same cohort (opportunities created within the active date range) - 0
// with no opportunities in that cohort, never NaN/Infinity.
export function prospectToClientRate(clientsWon: number, totalProspects: number): number {
  if (totalProspects <= 0) return 0;
  return (clientsWon / totalProspects) * 100;
}

// "20.0%" - one decimal place, per brief.
export function formatConversionRate(rate: number): string {
  return `${rate.toFixed(1)}%`;
}

export type CrmOpportunityConversionRecord = {
  opportunityId: string;
  businessName: string;
  assignedAgentId: string | null;
  createdAt: string;
  stage: string;
};

export type CrmConversionRow = {
  agentId: string;
  agentName: string;
  totalProspects: number;
  clientsWon: number;
  rate: number;
};

export function buildCrmAgentConversionResults(
  agents: { id: string; full_name: string; email?: string }[],
  records: CrmOpportunityConversionRecord[],
  filter: CrmResultsDateFilter,
  now: Date = new Date()
): CrmConversionRow[] {
  const range = crmResultsDateRange(filter, now);

  const byAgent = new Map<string, CrmConversionRow>();
  for (const agent of agents) {
    byAgent.set(agent.id, {
      agentId: agent.id,
      agentName: agent.full_name || agent.email || "Agent",
      totalProspects: 0,
      clientsWon: 0,
      rate: 0,
    });
  }

  for (const record of records) {
    if (!record.assignedAgentId) continue;
    const row = byAgent.get(record.assignedAgentId);
    // Former/inactive agent no longer in the active roster - excluded the
    // same way the opportunities table's own agent dropdown already
    // excludes them.
    if (!row) continue;
    if (!isoInRange(record.createdAt, range)) continue;

    row.totalProspects++;
    if (record.stage === "Client Won") row.clientsWon++;
  }

  for (const row of byAgent.values()) row.rate = prospectToClientRate(row.clientsWon, row.totalProspects);

  return Array.from(byAgent.values());
}

export type CrmOverallConversion = {
  totalProspects: number;
  clientsWon: number;
  rate: number;
};

export function computeCrmOverallConversion(
  records: CrmOpportunityConversionRecord[],
  filter: CrmResultsDateFilter,
  now: Date = new Date()
): CrmOverallConversion {
  const range = crmResultsDateRange(filter, now);
  let totalProspects = 0;
  let clientsWon = 0;

  for (const record of records) {
    if (!isoInRange(record.createdAt, range)) continue;
    totalProspects++;
    if (record.stage === "Client Won") clientsWon++;
  }

  return { totalProspects, clientsWon, rate: prospectToClientRate(clientsWon, totalProspects) };
}
