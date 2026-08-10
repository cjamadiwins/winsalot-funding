// Lead Generation CRM: pure calculations for the admin dashboard's
// "Results by Agent" chart (see /leadgen/admin/(dashboard)/page.tsx and
// ResultsByAgentChart.tsx). Every metric is grouped by
// leadgen_leads.assigned_agent_id and uses the exact same status values
// and isLeadgenNextFollowUpOverdue rule the admin Leads page's own
// filters already use (leadgen-types.ts) - so this chart's numbers can
// never drift from what clicking through to the Leads page actually
// shows, and no new data or duplicate records are introduced.
//
// Volume metrics (Assigned/Interested/Appointments Booked) are gated by
// each lead's created_at - "how many leads of this kind came in during
// this period." Follow-up metrics (Due/Overdue) are gated by the
// follow-up's own next_follow_up_at instead - a follow-up due this week
// can belong to a lead created months ago, so created_at would be the
// wrong gate for those two.

import { isLeadgenNextFollowUpOverdue, type LeadgenLeadRow } from "./leadgen-types";
import { addDays, leadgenDateKey, leadgenMondayOf } from "./leadgen-performance";

export const LEADGEN_RESULTS_DATE_FILTERS = ["today", "week", "month", "all"] as const;
export type LeadgenResultsDateFilter = (typeof LEADGEN_RESULTS_DATE_FILTERS)[number];

export const LEADGEN_RESULTS_DATE_FILTER_LABEL: Record<LeadgenResultsDateFilter, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

// null = All Time (no date restriction at all - matches the original
// table's behavior exactly, so the default view changes nothing).
export type LeadgenResultsDateRange = { start: string; end: string } | null;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
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

export function leadgenResultsDateRange(
  filter: LeadgenResultsDateFilter,
  now: Date = new Date()
): LeadgenResultsDateRange {
  const todayKey = leadgenDateKey(now);
  if (filter === "today") return { start: todayKey, end: todayKey };
  if (filter === "week") {
    const start = leadgenMondayOf(todayKey);
    return { start, end: addDays(start, 6) };
  }
  if (filter === "month") return { start: monthStartOf(todayKey), end: monthEndOf(todayKey) };
  return null;
}

// Exported so any UI that needs to build its own drilldown list (e.g. the
// exact leads behind a rate for the current filter/agent) can reuse the
// identical in-range rule this file's own counts already use, instead of
// re-implementing it and risking drift.
export function isoInRange(iso: string | null, range: LeadgenResultsDateRange): boolean {
  if (!range) return true;
  if (!iso) return false;
  const key = leadgenDateKey(new Date(iso));
  return key >= range.start && key <= range.end;
}

// Lead-to-Appointment Rate = Appointments Booked / Total Leads * 100 for
// the same cohort (leads created within the active date range) - 0 with
// no leads in that cohort, never NaN/Infinity.
export function leadToAppointmentRate(appointmentsBooked: number, totalLeads: number): number {
  if (totalLeads <= 0) return 0;
  return (appointmentsBooked / totalLeads) * 100;
}

// "13.3%" - one decimal place, per brief.
export function formatConversionRate(rate: number): string {
  return `${rate.toFixed(1)}%`;
}

export type LeadgenAgentResultsRow = {
  agentId: string;
  agentName: string;
  assignedLeads: number;
  interestedLeads: number;
  appointmentsBooked: number;
  followUpsDue: number;
  overdueFollowUps: number;
  leadToAppointmentRate: number;
};

export function buildLeadgenAgentResults(
  agents: { id: string; full_name: string }[],
  leads: Pick<LeadgenLeadRow, "assigned_agent_id" | "status" | "created_at" | "next_follow_up_at">[],
  filter: LeadgenResultsDateFilter,
  now: Date = new Date()
): LeadgenAgentResultsRow[] {
  const range = leadgenResultsDateRange(filter, now);

  const byAgent = new Map<string, LeadgenAgentResultsRow>();
  for (const agent of agents) {
    byAgent.set(agent.id, {
      agentId: agent.id,
      agentName: agent.full_name,
      assignedLeads: 0,
      interestedLeads: 0,
      appointmentsBooked: 0,
      followUpsDue: 0,
      overdueFollowUps: 0,
      leadToAppointmentRate: 0,
    });
  }

  for (const lead of leads) {
    if (!lead.assigned_agent_id) continue;
    const row = byAgent.get(lead.assigned_agent_id);
    // Former/inactive agent no longer in the active roster - excluded
    // the same way the Leads page's own agent filter already excludes
    // them from its dropdown.
    if (!row) continue;

    if (isoInRange(lead.created_at, range)) {
      row.assignedLeads++;
      if (lead.status === "Interested") row.interestedLeads++;
      if (lead.status === "Appointment booked") row.appointmentsBooked++;
    }

    if (lead.next_follow_up_at) {
      const overdue = isLeadgenNextFollowUpOverdue(lead.next_follow_up_at);
      if (isoInRange(lead.next_follow_up_at, range)) {
        if (overdue) row.overdueFollowUps++;
        else row.followUpsDue++;
      }
    }
  }

  for (const row of byAgent.values()) {
    row.leadToAppointmentRate = leadToAppointmentRate(row.appointmentsBooked, row.assignedLeads);
  }

  return Array.from(byAgent.values());
}

export type LeadgenOverallConversion = {
  totalLeads: number;
  appointmentsBooked: number;
  rate: number;
};

// Same "leads created in this date range, and of those how many are
// currently Appointment booked" cohort rule as buildLeadgenAgentResults
// above, just summed across every lead (assigned or not) instead of
// grouped by agent - this is what backs the admin dashboard's overall
// Lead-to-Appointment Rate KPI card.
export function computeLeadgenOverallConversion(
  leads: Pick<LeadgenLeadRow, "status" | "created_at">[],
  filter: LeadgenResultsDateFilter,
  now: Date = new Date()
): LeadgenOverallConversion {
  const range = leadgenResultsDateRange(filter, now);
  let totalLeads = 0;
  let appointmentsBooked = 0;

  for (const lead of leads) {
    if (!isoInRange(lead.created_at, range)) continue;
    totalLeads++;
    if (lead.status === "Appointment booked") appointmentsBooked++;
  }

  return { totalLeads, appointmentsBooked, rate: leadToAppointmentRate(appointmentsBooked, totalLeads) };
}
