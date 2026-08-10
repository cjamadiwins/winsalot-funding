"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LEADGEN_RESULTS_DATE_FILTERS,
  LEADGEN_RESULTS_DATE_FILTER_LABEL,
  buildLeadgenAgentResults,
  leadgenResultsDateRange,
  type LeadgenAgentResultsRow,
  type LeadgenResultsDateFilter,
} from "@/lib/leadgen-agent-results";
import type { LeadgenLeadRow } from "@/lib/leadgen-types";

type MetricKey = "assignedLeads" | "interestedLeads" | "appointmentsBooked" | "followUpsDue" | "overdueFollowUps";

const METRICS: { key: MetricKey; label: string; barClass: string; dotClass: string }[] = [
  { key: "assignedLeads", label: "Assigned Leads", barClass: "bg-blue-500", dotClass: "bg-blue-500" },
  { key: "interestedLeads", label: "Interested Leads", barClass: "bg-yellow-400", dotClass: "bg-yellow-400" },
  { key: "appointmentsBooked", label: "Appointments Booked", barClass: "bg-green-500", dotClass: "bg-green-500" },
  { key: "followUpsDue", label: "Follow-ups Due", barClass: "bg-orange-500", dotClass: "bg-orange-500" },
  { key: "overdueFollowUps", label: "Overdue Follow-ups", barClass: "bg-red-500", dotClass: "bg-red-500" },
];

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

export default function ResultsByAgentChart({
  agents,
  leads,
  serverNowIso,
}: {
  agents: { id: string; full_name: string }[];
  leads: Pick<LeadgenLeadRow, "assigned_agent_id" | "status" | "created_at" | "next_follow_up_at">[];
  serverNowIso: string;
}) {
  const [filter, setFilter] = useState<LeadgenResultsDateFilter>("all");
  const now = useMemo(() => new Date(serverNowIso), [serverNowIso]);

  const rows: LeadgenAgentResultsRow[] = useMemo(
    () => buildLeadgenAgentResults(agents, leads, filter, now),
    [agents, leads, filter, now]
  );

  const maxValue = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      for (const metric of METRICS) max = Math.max(max, row[metric.key]);
    }
    return max;
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
                filter === option ? "bg-sky-600 text-white" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {LEADGEN_RESULTS_DATE_FILTER_LABEL[option]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {METRICS.map((metric) => (
            <span key={metric.key} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${metric.dotClass}`} aria-hidden="true" />
              {metric.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {rows.map((row) => {
          const total =
            row.assignedLeads + row.interestedLeads + row.appointmentsBooked + row.followUpsDue + row.overdueFollowUps;

          return (
            <div key={row.agentId} className="rounded-xl border border-slate-200 p-4">
              <Link
                href={buildLeadsHref(row.agentId)}
                className="cursor-pointer text-[14px] font-semibold text-slate-900 hover:text-sky-600"
                title={`${row.agentName} — ${row.assignedLeads} assigned, ${row.interestedLeads} interested, ${row.appointmentsBooked} booked, ${row.followUpsDue} due, ${row.overdueFollowUps} overdue`}
              >
                {row.agentName}
              </Link>

              {total === 0 ? (
                <p className="mt-2 text-[12.5px] text-slate-400">No results for this period.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {METRICS.map((metric) => {
                    const value = row[metric.key];
                    const widthPct = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 3 : 0) : 0;
                    return (
                      <Link
                        key={metric.key}
                        href={hrefForMetric(row.agentId, metric.key, filter)}
                        title={`${row.agentName} — ${metric.label}: ${value}`}
                        className="group flex cursor-pointer items-center gap-2"
                      >
                        <span className="w-24 shrink-0 truncate text-[11px] font-medium text-slate-500 sm:w-36 sm:text-[12px]">
                          {metric.label}
                        </span>
                        <span className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100 transition group-hover:bg-slate-200">
                          <span
                            className={`block h-full rounded-md transition-[width] ${metric.barClass} group-hover:brightness-110`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </span>
                        <span className="w-6 shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-700">
                          {value}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
