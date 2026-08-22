// Lead Generation CRM admin dashboard: "vs last 7 days" trend arrows and
// sparklines for the 5 summary KPI cards. There's no stored history of
// past lead statuses, so a true point-in-time snapshot ("Interested
// Leads as of 7 days ago") can't be reconstructed - instead this
// compares 7-day rolling volume to the 7 days before that, gated by the
// same field (and, for status-based counts, the same current-status
// filter) buildLeadgenAgentResults already uses for the identically
// named Results by Agent / Agent Performance metrics. That keeps a KPI
// card's trend from ever implying a different definition of
// "Interested" or "Due" than the chart directly below it uses.

import { isoInRange, type LeadgenResultsDateRange } from "./leadgen-agent-results";
import { isLeadgenNextFollowUpOverdue, type LeadgenLeadRow } from "./leadgen-types";
import { addDays, leadgenDateKey } from "./leadgen-performance";

export type LeadgenDashboardTrend = {
  pct: number;
  direction: "up" | "down" | "flat";
  series: number[]; // 7 entries, oldest -> newest daily volume
};

function trendFrom(current: number, previous: number): { pct: number; direction: "up" | "down" | "flat" } {
  if (previous <= 0) return { pct: 0, direction: current > 0 ? "up" : "flat" };
  const rawPct = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(rawPct), direction: rawPct > 0 ? "up" : rawPct < 0 ? "down" : "flat" };
}

type MetricKey = "totalLeads" | "interestedLeads" | "appointmentsBooked" | "followUpsDue" | "overdueFollowUps";

export type LeadgenDashboardTrends = Record<MetricKey, LeadgenDashboardTrend>;

export function computeLeadgenDashboardTrends(
  leads: Pick<LeadgenLeadRow, "status" | "created_at" | "next_follow_up_at">[],
  now: Date = new Date()
): LeadgenDashboardTrends {
  const todayKey = leadgenDateKey(now);
  const last7Days = Array.from({ length: 7 }, (_, i) => addDays(todayKey, i - 6)); // oldest -> newest
  const last7Range: LeadgenResultsDateRange = { start: last7Days[0], end: todayKey };
  const prev7Range: LeadgenResultsDateRange = { start: addDays(todayKey, -13), end: addDays(todayKey, -7) };
  const dayIndex = new Map(last7Days.map((key, i) => [key, i] as const));

  const totals: Record<MetricKey, { last: number; prev: number; series: number[] }> = {
    totalLeads: { last: 0, prev: 0, series: new Array(7).fill(0) },
    interestedLeads: { last: 0, prev: 0, series: new Array(7).fill(0) },
    appointmentsBooked: { last: 0, prev: 0, series: new Array(7).fill(0) },
    followUpsDue: { last: 0, prev: 0, series: new Array(7).fill(0) },
    overdueFollowUps: { last: 0, prev: 0, series: new Array(7).fill(0) },
  };

  function tally(key: MetricKey, iso: string) {
    const bucket = totals[key];
    if (isoInRange(iso, last7Range)) bucket.last++;
    if (isoInRange(iso, prev7Range)) bucket.prev++;
    const idx = dayIndex.get(leadgenDateKey(new Date(iso)));
    if (idx !== undefined) bucket.series[idx]++;
  }

  for (const lead of leads) {
    tally("totalLeads", lead.created_at);
    if (lead.status === "Interested") tally("interestedLeads", lead.created_at);
    if (lead.status === "Appointment booked") tally("appointmentsBooked", lead.created_at);

    if (lead.next_follow_up_at) {
      if (isLeadgenNextFollowUpOverdue(lead.next_follow_up_at)) {
        tally("overdueFollowUps", lead.next_follow_up_at);
      } else {
        tally("followUpsDue", lead.next_follow_up_at);
      }
    }
  }

  const result = {} as LeadgenDashboardTrends;
  for (const key of Object.keys(totals) as MetricKey[]) {
    const t = totals[key];
    result[key] = { ...trendFrom(t.last, t.prev), series: t.series };
  }
  return result;
}
