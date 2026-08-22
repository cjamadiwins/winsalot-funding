"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp, Trophy } from "lucide-react";
import {
  LEADGEN_RESULTS_DATE_FILTERS,
  LEADGEN_RESULTS_DATE_FILTER_LABEL,
  buildLeadgenAgentResults,
  computeLeadgenOverallConversion,
  formatConversionRate,
  isoInRange,
  leadgenResultsDateRange,
  type LeadgenAgentResultsRow,
  type LeadgenResultsDateFilter,
} from "@/lib/leadgen-agent-results";
import KpiCard from "@/components/crm-ui/KpiCard";
import type { LeadgenLeadRow } from "@/lib/leadgen-types";

type LeadSummary = Pick<LeadgenLeadRow, "id" | "business_name">;

type MetricKey = "assignedLeads" | "interestedLeads" | "appointmentsBooked" | "followUpsDue" | "overdueFollowUps";

// Bar chart colors - deliberately its own palette from the KPI cards
// above (which use blue/indigo/green/amber/red tones), matching what
// this chart has always used for its legend/bars so a returning admin
// sees the same colors they always have here.
const METRICS: { key: MetricKey; label: string; barColor: string; dotClass: string }[] = [
  { key: "assignedLeads", label: "Assigned Leads", barColor: "#2f6fed", dotClass: "bg-[#2f6fed]" },
  { key: "interestedLeads", label: "Interested Leads", barColor: "#f5a623", dotClass: "bg-[#f5a623]" },
  { key: "appointmentsBooked", label: "Appointments Booked", barColor: "#22c55e", dotClass: "bg-[#22c55e]" },
  { key: "followUpsDue", label: "Follow-ups Due", barColor: "#f97316", dotClass: "bg-[#f97316]" },
  { key: "overdueFollowUps", label: "Overdue Follow-ups", barColor: "#ef4444", dotClass: "bg-[#ef4444]" },
];

const CHART_HEIGHT = 180;

function buildLeadsHref(agentId: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ agent: agentId, ...extra });
  return `/leadgen/admin/leads?${params.toString()}`;
}

// Metric-specific destination filters. Follow-ups Due/Overdue carry the
// active date range through as due_from/due_to so the Leads page shows
// exactly the same slice the bar's number represents - "today" reuses
// the existing followup=due_today param (identical to the dashboard's
// pre-existing Follow-ups Due Today card) rather than a redundant range.
function hrefForMetric(agentId: string, metric: MetricKey, filter: LeadgenResultsDateFilter): string {
  if (metric === "assignedLeads") return buildLeadsHref(agentId);
  if (metric === "interestedLeads") return buildLeadsHref(agentId, { status: "Interested" });
  if (metric === "appointmentsBooked") return buildLeadsHref(agentId, { status: "Appointment booked" });

  const range = leadgenResultsDateRange(filter);
  if (metric === "followUpsDue") {
    if (filter === "today") return buildLeadsHref(agentId, { followup: "due_today" });
    return buildLeadsHref(agentId, { followup: "due", ...(range ? { due_from: range.start, due_to: range.end } : {}) });
  }
  // overdueFollowUps
  return buildLeadsHref(agentId, { followup: "overdue", ...(range ? { due_from: range.start, due_to: range.end } : {}) });
}

// Rounds a chart max up to a clean axis ceiling (next multiple of 5, or
// 10 above 50) so the gridline labels read as round numbers instead of
// something like "0 / 13 / 27 / 40".
function niceAxisMax(value: number): number {
  if (value <= 0) return 5;
  const step = value <= 50 ? 5 : 10;
  return Math.ceil(value / step) * step;
}

export default function ResultsByAgentChart({
  agents,
  leads,
  serverNowIso,
}: {
  agents: { id: string; full_name: string }[];
  leads: Pick<LeadgenLeadRow, "id" | "business_name" | "assigned_agent_id" | "status" | "created_at" | "next_follow_up_at">[];
  serverNowIso: string;
}) {
  const [filter, setFilter] = useState<LeadgenResultsDateFilter>("all");
  // "overall" for the summary card, an agent id for that agent's row, or
  // null when nothing is expanded - only one drilldown open at a time.
  const [expanded, setExpanded] = useState<string | null>(null);
  const now = useMemo(() => new Date(serverNowIso), [serverNowIso]);

  const rows: LeadgenAgentResultsRow[] = useMemo(
    () => buildLeadgenAgentResults(agents, leads, filter, now),
    [agents, leads, filter, now]
  );

  const overall = useMemo(() => computeLeadgenOverallConversion(leads, filter, now), [leads, filter, now]);

  // The exact leads behind a rate (Appointment booked, created within the
  // active date range) - same in-range rule buildLeadgenAgentResults uses
  // internally, so this list can never disagree with the rate/count shown
  // above it. agentId omitted = every agent (the overall card).
  const range = useMemo(() => leadgenResultsDateRange(filter, now), [filter, now]);
  function bookedLeadsInRange(agentId?: string): LeadSummary[] {
    return leads
      .filter((lead) => lead.status === "Appointment booked")
      .filter((lead) => isoInRange(lead.created_at, range))
      .filter((lead) => !agentId || lead.assigned_agent_id === agentId)
      .map((lead) => ({ id: lead.id, business_name: lead.business_name }));
  }

  const maxValue = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      for (const metric of METRICS) max = Math.max(max, row[metric.key]);
    }
    return max;
  }, [rows]);
  const axisMax = niceAxisMax(maxValue);

  // "Top Performer" = most appointments booked in the active period
  // (ties broken by lead-to-appointment rate) - the same headline number
  // the overall Lead-to-Appointment Rate card is built from. Omitted
  // entirely when nobody has booked anything yet, rather than crowning
  // an agent with 0 bookings.
  const topPerformer = useMemo(() => {
    return rows.reduce<LeadgenAgentResultsRow | null>((best, row) => {
      if (row.appointmentsBooked <= 0) return best;
      if (!best) return row;
      if (row.appointmentsBooked > best.appointmentsBooked) return row;
      if (row.appointmentsBooked === best.appointmentsBooked && row.leadToAppointmentRate > best.leadToAppointmentRate) return row;
      return best;
    }, null);
  }, [rows]);

  if (agents.length === 0) {
    return <p className="mt-3 text-[13.5px] text-slate-500">No agents yet.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
          {LEADGEN_RESULTS_DATE_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                filter === option ? "bg-[var(--crm-accent,#3e7ef7)] text-white" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {LEADGEN_RESULTS_DATE_FILTER_LABEL[option]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {METRICS.map((metric) => (
            <span key={metric.key} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-sm ${metric.dotClass}`} aria-hidden="true" />
              {metric.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 max-w-xs">
        <KpiCard
          label="Lead-to-Appointment Rate"
          value={formatConversionRate(overall.rate)}
          icon={<TrendingUp />}
          tone="cyan"
          active={expanded === "overall"}
          onClick={() => setExpanded((current) => (current === "overall" ? null : "overall"))}
        />
      </div>
      {expanded === "overall" && (
        <ConversionDrilldown
          title={`Appointments booked — ${LEADGEN_RESULTS_DATE_FILTER_LABEL[filter]}`}
          count={overall.appointmentsBooked}
          totalLeads={overall.totalLeads}
          leadHref={(id) => `/leadgen/admin/leads/${id}`}
          leads={bookedLeadsInRange()}
        />
      )}

      {/* Grouped bar chart - one cluster of 5 bars per agent, sharing a
          single y-axis scale so relative performance is comparable at a
          glance instead of each agent needing its own bar-length read. */}
      <div className="mt-6 flex">
        <div
          className="flex shrink-0 flex-col justify-between pb-6 pr-2.5 text-right"
          style={{ height: CHART_HEIGHT }}
        >
          {[4, 3, 2, 1, 0].map((step) => (
            <span key={step} className="text-[10px] font-semibold text-slate-400">
              {Math.round((axisMax * step) / 4)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ height: CHART_HEIGHT, minWidth: rows.length * 96 }}>
            <div className="absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: CHART_HEIGHT }} aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="border-t border-slate-100" />
              ))}
            </div>
            <div className="relative flex h-full items-end justify-around gap-2 px-2">
              {rows.map((row) => (
                <div key={row.agentId} className="flex items-end gap-[3px]">
                  {METRICS.map((metric) => {
                    const value = row[metric.key];
                    const heightPx = axisMax > 0 ? Math.max((value / axisMax) * CHART_HEIGHT, value > 0 ? 3 : 0) : 0;
                    return (
                      <Link
                        key={metric.key}
                        href={hrefForMetric(row.agentId, metric.key, filter)}
                        title={`${row.agentName} — ${metric.label}: ${value}`}
                        className="group flex w-2 min-h-1 items-end"
                      >
                        <span
                          className="w-2 rounded-t-[3px] transition group-hover:brightness-110"
                          style={{ height: heightPx, backgroundColor: metric.barColor }}
                        />
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-start justify-around gap-2 px-2" style={{ minWidth: rows.length * 96 }}>
            {rows.map((row) => (
              <div key={row.agentId} className="flex w-24 flex-col items-center gap-1 text-center">
                <Link href={buildLeadsHref(row.agentId)} className="truncate text-[12px] font-semibold text-slate-900 hover:text-sky-600">
                  {row.agentName}
                </Link>
                <button
                  type="button"
                  onClick={() => setExpanded((current) => (current === row.agentId ? null : row.agentId))}
                  title={`${row.agentName} — Lead-to-Appointment Rate: ${formatConversionRate(row.leadToAppointmentRate)}`}
                  className={`cursor-pointer rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition ${
                    expanded === row.agentId ? "bg-cyan-600 text-white" : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
                  }`}
                >
                  {formatConversionRate(row.leadToAppointmentRate)}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {rows.map(
        (row) =>
          expanded === row.agentId && (
            <ConversionDrilldown
              key={row.agentId}
              title={`${row.agentName} — Appointments booked (${LEADGEN_RESULTS_DATE_FILTER_LABEL[filter]})`}
              count={row.appointmentsBooked}
              totalLeads={row.assignedLeads}
              leadHref={(id) => `/leadgen/admin/leads/${id}`}
              leads={bookedLeadsInRange(row.agentId)}
            />
          )
      )}

      {topPerformer && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f5a623] shadow-sm">
            <Trophy className="h-4 w-4 text-white" strokeWidth={2.2} />
          </span>
          <p className="text-[12.5px] text-blue-900">
            <Link href={buildLeadsHref(topPerformer.agentId)} className="font-bold text-blue-900 hover:underline">
              Top Performer: {topPerformer.agentName}
            </Link>{" "}
            · {topPerformer.assignedLeads} Assigned · {topPerformer.appointmentsBooked} Appointments Booked ·{" "}
            {formatConversionRate(topPerformer.leadToAppointmentRate)} Lead-to-Appointment Rate
          </p>
        </div>
      )}
    </div>
  );
}

// The exact leads a Lead-to-Appointment Rate card/badge is counting -
// shown inline (not a separate page) so clicking the rate always opens
// something, even for a date range/agent combination the Leads page has
// no query-param filter for.
function ConversionDrilldown({
  title,
  count,
  totalLeads,
  leads,
  leadHref,
}: {
  title: string;
  count: number;
  totalLeads: number;
  leads: LeadSummary[];
  leadHref: (id: string) => string;
}) {
  return (
    <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50/50 p-3.5">
      <div className="flex items-center justify-between text-[12px] font-semibold text-cyan-800">
        <span>{title}</span>
        <span className="tabular-nums">
          {count} / {totalLeads}
        </span>
      </div>
      {leads.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-slate-500">No appointments booked in this period.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link href={leadHref(lead.id)} className="text-[12.5px] font-medium text-sky-700 hover:text-sky-900 hover:underline">
                {lead.business_name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
