"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import {
  CRM_RESULTS_DATE_FILTERS,
  CRM_RESULTS_DATE_FILTER_LABEL,
  buildCrmAgentConversionResults,
  computeCrmOverallConversion,
  crmResultsDateRange,
  formatConversionRate,
  isoInRange,
  type CrmConversionRow,
  type CrmLeadToQuoteRecord,
  type CrmResultsDateFilter,
} from "@/lib/crm-conversion";
import KpiCard from "@/components/crm-ui/KpiCard";

// Cleaning CRM's "Results by Agent" section for the Lead-to-Quote Rate
// KPI - Quotes Sent / Total Leads * 100, following the same Today/This
// Week/This Month/All Time filters as the Lead Generation CRM's
// equivalent chart (ResultsByAgentChart.tsx), and reused as-is for the
// agent's own single-row view on /agent/dashboard (agents.length === 1
// there hides the separate overall card and per-agent list header, since
// they'd otherwise just repeat the same one row - RLS already ensures an
// agent's `records` only ever contains their own leads).
export default function ResultsByAgentConversion({
  agents,
  records,
  serverNowIso,
  leadHrefBase,
}: {
  agents: { id: string; full_name: string; email?: string }[];
  records: CrmLeadToQuoteRecord[];
  serverNowIso: string;
  // "/admin/crm/leads" or "/agent/leads" - the base path this section's
  // drilldown links land on (each CRM role has its own lead detail route).
  leadHrefBase: string;
}) {
  const [filter, setFilter] = useState<CrmResultsDateFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const now = useMemo(() => new Date(serverNowIso), [serverNowIso]);
  const isSingleAgent = agents.length === 1;

  const overall = useMemo(() => computeCrmOverallConversion(records, filter, now), [records, filter, now]);
  const rows: CrmConversionRow[] = useMemo(
    () => buildCrmAgentConversionResults(agents, records, filter, now),
    [agents, records, filter, now]
  );
  const range = useMemo(() => crmResultsDateRange(filter, now), [filter, now]);

  function quotesSentInRange(agentId?: string) {
    return records
      .filter((record) => record.quoteSentAt)
      .filter((record) => isoInRange(record.createdAt, range))
      .filter((record) => !agentId || record.assignedAgentId === agentId);
  }

  const filterButtons = (
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
  );

  if (agents.length === 0) {
    return null;
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-cyan-700">
          {isSingleAgent ? "Your Lead-to-Quote Rate" : "Results by Agent"}
        </h2>
        {filterButtons}
      </div>

      <div className="mt-4 max-w-xs">
        <KpiCard
          label="Lead-to-Quote Rate"
          value={formatConversionRate(overall.rate)}
          icon={<TrendingUp />}
          tone="cyan"
          active={expanded === "overall"}
          onClick={() => setExpanded((current) => (current === "overall" ? null : "overall"))}
        />
      </div>

      {expanded === "overall" && (
        // Records are already scoped to just this section's agents (the
        // full roster for admin, or RLS-scoped to just themselves for an
        // agent), so no extra agent filter is needed here even in the
        // single-agent case.
        <ConversionDrilldown
          title={`Quotes sent — ${CRM_RESULTS_DATE_FILTER_LABEL[filter]}`}
          count={overall.quotesSent}
          totalLeads={overall.totalLeads}
          leadHrefBase={leadHrefBase}
          records={quotesSentInRange()}
        />
      )}

      {!isSingleAgent && (
        <div className="mt-5 space-y-3">
          {rows.map((row) => (
            <div key={row.agentId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] font-semibold text-slate-900">{row.agentName}</span>
                <button
                  type="button"
                  onClick={() => setExpanded((current) => (current === row.agentId ? null : row.agentId))}
                  title={`${row.agentName} — Lead-to-Quote Rate: ${formatConversionRate(row.rate)}`}
                  className={`cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition ${
                    expanded === row.agentId ? "bg-cyan-600 text-white" : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
                  }`}
                >
                  {formatConversionRate(row.rate)} Lead-to-Quote
                </button>
              </div>
              <p className="mt-1.5 text-[12.5px] text-slate-500">
                {row.quotesSent} quote{row.quotesSent === 1 ? "" : "s"} sent of {row.totalLeads} lead
                {row.totalLeads === 1 ? "" : "s"}
              </p>

              {expanded === row.agentId && (
                <ConversionDrilldown
                  title={`${row.agentName} — Quotes sent (${CRM_RESULTS_DATE_FILTER_LABEL[filter]})`}
                  count={row.quotesSent}
                  totalLeads={row.totalLeads}
                  leadHrefBase={leadHrefBase}
                  records={quotesSentInRange(row.agentId)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ConversionDrilldown({
  title,
  count,
  totalLeads,
  records,
  leadHrefBase,
}: {
  title: string;
  count: number;
  totalLeads: number;
  records: CrmLeadToQuoteRecord[];
  leadHrefBase: string;
}) {
  return (
    <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50/50 p-3.5">
      <div className="flex items-center justify-between text-[12px] font-semibold text-cyan-800">
        <span>{title}</span>
        <span className="tabular-nums">
          {count} / {totalLeads}
        </span>
      </div>
      {records.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-slate-500">No quotes sent in this period.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {records.map((record) => (
            <li key={record.leadId}>
              <Link
                href={`${leadHrefBase}/${record.leadId}`}
                className="text-[12.5px] font-medium text-sky-700 hover:text-sky-900 hover:underline"
              >
                {record.businessName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
