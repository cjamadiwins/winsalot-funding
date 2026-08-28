"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp, Trophy } from "lucide-react";
import {
  CRM_RESULTS_DATE_FILTERS,
  CRM_RESULTS_DATE_FILTER_LABEL,
  buildCrmAgentConversionResults,
  computeCrmOverallConversion,
  crmResultsDateRange,
  formatConversionRate,
  isoInRange,
  type CrmConversionRow,
  type CrmOpportunityConversionRecord,
  type CrmResultsDateFilter,
} from "@/lib/crm-conversion";
import KpiCard from "@/components/crm-ui/KpiCard";

type MetricKey = "assignedProspects" | "interested" | "consultationsBooked" | "proposalOrApplicationSent" | "clientsWon";

const METRICS: { key: MetricKey; label: string; barColor: string; dotClass: string }[] = [
  { key: "assignedProspects", label: "Assigned Prospects", barColor: "#2f6fed", dotClass: "bg-[#2f6fed]" },
  { key: "interested", label: "Interested", barColor: "#f5a623", dotClass: "bg-[#f5a623]" },
  { key: "consultationsBooked", label: "Consultations Booked", barColor: "#8b5cf6", dotClass: "bg-[#8b5cf6]" },
  { key: "proposalOrApplicationSent", label: "Proposal/Application Sent", barColor: "#f97316", dotClass: "bg-[#f97316]" },
  { key: "clientsWon", label: "Clients Won", barColor: "#22c55e", dotClass: "bg-[#22c55e]" },
];

const CHART_HEIGHT = 180;

type ChartRow = CrmConversionRow & Record<MetricKey, number>;

function niceAxisMax(value: number): number {
  if (value <= 0) return 5;
  const step = value <= 50 ? 5 : 10;
  return Math.ceil(value / step) * step;
}

function stageForMetric(metric: MetricKey): string | null {
  if (metric === "interested") return "Interested";
  if (metric === "consultationsBooked") return "Consultation Booked";
  if (metric === "proposalOrApplicationSent") return "Proposal or Application Sent";
  if (metric === "clientsWon") return "Client Won";
  return null;
}

export default function ResultsByAgentConversion({
  agents,
  records,
  serverNowIso,
  opportunityHrefBase,
}: {
  agents: { id: string; full_name: string; email?: string }[];
  records: CrmOpportunityConversionRecord[];
  serverNowIso: string;
  opportunityHrefBase: string;
}) {
  const [filter, setFilter] = useState<CrmResultsDateFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const now = useMemo(() => new Date(serverNowIso), [serverNowIso]);
  const isSingleAgent = agents.length === 1;
  const range = useMemo(() => crmResultsDateRange(filter, now), [filter, now]);

  const overall = useMemo(() => computeCrmOverallConversion(records, filter, now), [records, filter, now]);
  const conversionRows = useMemo(
    () => buildCrmAgentConversionResults(agents, records, filter, now),
    [agents, records, filter, now]
  );

  const rows: ChartRow[] = useMemo(() => {
    return conversionRows.map((row) => {
      const agentRecords = records.filter(
        (record) => record.assignedAgentId === row.agentId && isoInRange(record.createdAt, range)
      );
      return {
        ...row,
        assignedProspects: agentRecords.length,
        interested: agentRecords.filter((record) => record.stage === "Interested").length,
        consultationsBooked: agentRecords.filter((record) => record.stage === "Consultation Booked").length,
        proposalOrApplicationSent: agentRecords.filter((record) => record.stage === "Proposal or Application Sent").length,
        clientsWon: agentRecords.filter((record) => record.stage === "Client Won").length,
      };
    });
  }, [conversionRows, records, range]);

  function clientsWonInRange(agentId?: string) {
    return records
      .filter((record) => record.stage === "Client Won")
      .filter((record) => isoInRange(record.createdAt, range))
      .filter((record) => !agentId || record.assignedAgentId === agentId);
  }

  function metricHref(agentId: string, metric: MetricKey): string {
    const params = new URLSearchParams({ agent: agentId });
    const stage = stageForMetric(metric);
    if (stage) params.set("stage", stage);
    return `${opportunityHrefBase}?${params.toString()}`;
  }

  const maxValue = useMemo(
    () => rows.reduce((max, row) => Math.max(max, ...METRICS.map((metric) => row[metric.key])), 0),
    [rows]
  );
  const axisMax = niceAxisMax(maxValue);

  const topPerformer = useMemo(() => {
    return rows.reduce<ChartRow | null>((best, row) => {
      if (row.clientsWon <= 0) return best;
      if (!best || row.clientsWon > best.clientsWon) return row;
      if (row.clientsWon === best.clientsWon && row.rate > best.rate) return row;
      return best;
    }, null);
  }, [rows]);

  if (agents.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-cyan-700">
          {isSingleAgent ? "Your Growth Results" : "Results by Agent"}
        </h2>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
          {CRM_RESULTS_DATE_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                filter === option ? "bg-[var(--crm-accent,#3e7ef7)] text-white" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {CRM_RESULTS_DATE_FILTER_LABEL[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {METRICS.map((metric) => (
          <span key={metric.key} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-slate-600">
            <span className={`h-2.5 w-2.5 rounded-sm ${metric.dotClass}`} aria-hidden="true" />
            {metric.label}
          </span>
        ))}
      </div>

      <div className="mt-4 max-w-xs">
        <KpiCard
          label="Prospect-to-Client Rate"
          value={formatConversionRate(overall.rate)}
          icon={<TrendingUp />}
          tone="cyan"
          active={expanded === "overall"}
          onClick={() => setExpanded((current) => (current === "overall" ? null : "overall"))}
        />
      </div>

      {expanded === "overall" && (
        <ConversionDrilldown
          title={`Clients won — ${CRM_RESULTS_DATE_FILTER_LABEL[filter]}`}
          count={overall.clientsWon}
          totalProspects={overall.totalProspects}
          opportunityHrefBase={opportunityHrefBase}
          records={clientsWonInRange()}
        />
      )}

      <div className="mt-6 flex">
        <div className="flex shrink-0 flex-col justify-between pb-6 pr-2.5 text-right" style={{ height: CHART_HEIGHT }}>
          {[4, 3, 2, 1, 0].map((step) => (
            <span key={step} className="text-[10px] font-semibold text-slate-400">
              {Math.round((axisMax * step) / 4)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ height: CHART_HEIGHT, minWidth: rows.length * 110 }}>
            <div className="absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: CHART_HEIGHT }} aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="border-t border-slate-100" />)}
            </div>
            <div className="relative flex h-full items-end justify-around gap-2 px-2">
              {rows.map((row) => (
                <div key={row.agentId} className="flex items-end gap-[3px]">
                  {METRICS.map((metric) => {
                    const value = row[metric.key];
                    const heightPx = Math.max((value / axisMax) * CHART_HEIGHT, value > 0 ? 3 : 0);
                    return (
                      <Link
                        key={metric.key}
                        href={metricHref(row.agentId, metric.key)}
                        title={`${row.agentName} — ${metric.label}: ${value}`}
                        className="group flex min-h-1 w-2 items-end"
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
          <div className="mt-2 flex items-start justify-around gap-2 px-2" style={{ minWidth: rows.length * 110 }}>
            {rows.map((row) => (
              <div key={row.agentId} className="flex w-28 flex-col items-center gap-1 text-center">
                <Link href={metricHref(row.agentId, "assignedProspects")} className="w-full truncate text-[12px] font-semibold text-slate-900 hover:text-sky-600">
                  {row.agentName}
                </Link>
                <button
                  type="button"
                  onClick={() => setExpanded((current) => (current === row.agentId ? null : row.agentId))}
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition ${
                    expanded === row.agentId ? "bg-cyan-600 text-white" : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
                  }`}
                >
                  {formatConversionRate(row.rate)}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {rows.map((row) => expanded === row.agentId && (
        <ConversionDrilldown
          key={row.agentId}
          title={`${row.agentName} — Clients won (${CRM_RESULTS_DATE_FILTER_LABEL[filter]})`}
          count={row.clientsWon}
          totalProspects={row.assignedProspects}
          opportunityHrefBase={opportunityHrefBase}
          records={clientsWonInRange(row.agentId)}
        />
      ))}

      {topPerformer && !isSingleAgent && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f5a623] shadow-sm">
            <Trophy className="h-4 w-4 text-white" strokeWidth={2.2} />
          </span>
          <p className="text-[12.5px] text-blue-900">
            <Link href={metricHref(topPerformer.agentId, "assignedProspects")} className="font-bold hover:underline">
              Top Performer: {topPerformer.agentName}
            </Link>{" "}
            · {topPerformer.assignedProspects} Assigned · {topPerformer.consultationsBooked} Consultations · {topPerformer.clientsWon} Clients Won · {formatConversionRate(topPerformer.rate)} Conversion
          </p>
        </div>
      )}
    </section>
  );
}

function ConversionDrilldown({
  title,
  count,
  totalProspects,
  records,
  opportunityHrefBase,
}: {
  title: string;
  count: number;
  totalProspects: number;
  records: CrmOpportunityConversionRecord[];
  opportunityHrefBase: string;
}) {
  return (
    <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50/50 p-3.5">
      <div className="flex items-center justify-between text-[12px] font-semibold text-cyan-800">
        <span>{title}</span>
        <span className="tabular-nums">{count} / {totalProspects}</span>
      </div>
      {records.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-slate-500">No clients won in this period.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {records.map((record) => (
            <li key={record.opportunityId}>
              <Link href={`${opportunityHrefBase}/${record.opportunityId}`} className="text-[12.5px] font-medium text-sky-700 hover:text-sky-900 hover:underline">
                {record.businessName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
