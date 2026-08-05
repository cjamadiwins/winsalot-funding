"use client";

import { useMemo, useState } from "react";
import {
  buildCrmPeriodRecords,
  computeCrmMonthlyPerformance,
  crmMonthsInRange,
  crmPeriodStartsInMonth,
  type CrmBiweeklyHistoryRow,
  type CrmPeriodRecord,
} from "@/lib/crm-performance-history";
import { crmBiweeklyRangeLabel, crmPerformanceTier, type CrmPerformanceQuoteRecord, type CrmPerformanceTier } from "@/lib/crm-performance";

const TIER_STYLES: Record<CrmPerformanceTier, { badge: string; text: string }> = {
  green: { badge: "bg-emerald-100 text-emerald-800", text: "text-emerald-700" },
  yellow: { badge: "bg-amber-100 text-amber-800", text: "text-amber-700" },
  red: { badge: "bg-rose-100 text-rose-800", text: "text-rose-700" },
};

const TIER_STATUS_LABEL: Record<CrmPerformanceTier, string> = {
  green: "On Track",
  yellow: "Needs Improvement",
  red: "Behind Target",
};

// A period that's still in progress or hasn't started yet has no
// green/yellow/red result to show - it gets a neutral label instead
// (brief: future periods "must show 'Not Started'" and the current one
// "must show 'In Progress'").
const PERIOD_LABEL: Record<"current" | "future", string> = {
  current: "In Progress",
  future: "Not Started",
};
const PERIOD_BADGE_CLASS = "bg-slate-100 text-slate-500";

const selectClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13.5px] text-slate-900";

// Table/history spans a lot of months for an old dataset - cap how far
// back the month picker/table reach so both stay a manageable size.
const MAX_HISTORY_MONTHS = 24;

type Agent = { id: string; name: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

function monthLabelShort(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function CrmMonthlyPerformanceSection({
  agents,
  records,
  historyRows,
  currentPeriodStart,
  currentYear,
  currentMonth,
}: {
  agents: Agent[];
  records: CrmPerformanceQuoteRecord[];
  historyRows: CrmBiweeklyHistoryRow[];
  currentPeriodStart: string;
  currentYear: number;
  currentMonth: number;
}) {
  const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? "");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(monthKey(currentYear, currentMonth));

  const agent = agents.find((candidate) => candidate.id === agentId) ?? null;

  // Earliest month with any record (frozen biweekly history or a live
  // quote) for this agent, capped so the picker/table can't grow
  // unbounded for a very old dataset.
  const earliestMonth = useMemo(() => {
    if (!agent) return { year: currentYear, month: currentMonth };
    let earliest = monthKey(currentYear, currentMonth);
    for (const row of historyRows) {
      if (row.agent_id !== agent.id) continue;
      const key = row.period_start.slice(0, 7);
      if (key < earliest) earliest = key;
    }
    for (const record of records) {
      if (record.assignedAgentId !== agent.id) continue;
      for (const timestamp of [record.quoteSentAt, record.quoteReceivedAt]) {
        if (!timestamp) continue;
        const key = timestamp.slice(0, 7);
        if (key < earliest) earliest = key;
      }
    }
    const [earliestYear, earliestMonthNum] = earliest.split("-").map(Number);
    const fullRange = crmMonthsInRange(earliestYear, earliestMonthNum, currentYear, currentMonth);
    const capped = fullRange.length > MAX_HISTORY_MONTHS ? fullRange[fullRange.length - MAX_HISTORY_MONTHS] : fullRange[0];
    return capped ?? { year: currentYear, month: currentMonth };
  }, [agent, historyRows, records, currentYear, currentMonth]);

  const monthOptions = useMemo(
    () => crmMonthsInRange(earliestMonth.year, earliestMonth.month, currentYear, currentMonth).reverse(),
    [earliestMonth, currentYear, currentMonth]
  );

  const [selectedYear, selectedMonthNum] = selectedMonthKey.split("-").map(Number);

  const periodBreakdown: CrmPeriodRecord[] = useMemo(() => {
    if (!agent) return [];
    const periodStarts = crmPeriodStartsInMonth(selectedYear, selectedMonthNum);
    return buildCrmPeriodRecords(periodStarts, historyRows, records, agent.id, currentPeriodStart);
  }, [agent, selectedYear, selectedMonthNum, historyRows, records, currentPeriodStart]);

  const monthly = useMemo(
    () => computeCrmMonthlyPerformance(selectedYear, selectedMonthNum, periodBreakdown),
    [selectedYear, selectedMonthNum, periodBreakdown]
  );

  const historyTableRows = useMemo(() => {
    if (!agent) return [];
    return monthOptions.map(({ year, month }) => {
      const periodStarts = crmPeriodStartsInMonth(year, month);
      const periods = buildCrmPeriodRecords(periodStarts, historyRows, records, agent.id, currentPeriodStart);
      return computeCrmMonthlyPerformance(year, month, periods);
    });
  }, [agent, monthOptions, historyRows, records, currentPeriodStart]);

  if (agents.length === 0) {
    return null;
  }

  const monthlyTierStyle = TIER_STYLES[monthly.monthlyTier];

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Monthly Performance</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Permanently saved biweekly results rolled up by month. Quotes Sent and Quotes Received are tracked separately, each against 4
            and 1 per period. Goals only count periods that have started - a period that hasn&apos;t begun yet doesn&apos;t count against
            them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={selectClass} value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            {agents.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          <select className={selectClass} value={selectedMonthKey} onChange={(event) => setSelectedMonthKey(event.target.value)}>
            {monthOptions.map(({ year, month }) => (
              <option key={monthKey(year, month)} value={monthKey(year, month)}>
                {monthLabelShort(year, month)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Selected Month" value={monthly.monthLabel} />
        <Stat label="Completed Periods" value={String(monthly.completedPeriodsCount)} />
        <Stat label="Best Biweekly Period" value={monthly.bestPeriod ? crmBiweeklyRangeLabel(monthly.bestPeriod.periodStart, monthly.bestPeriod.periodEnd) : "—"} />
        <Stat
          label="Monthly Status"
          value={`${TIER_STATUS_LABEL[monthly.monthlyTier]} — ${monthly.monthlyOverallPercentage}%`}
          badgeClassName={monthlyTierStyle.badge}
        />
        <Stat label="Total Quotes Sent" value={String(monthly.totalSent)} />
        <Stat label="Monthly Quotes-Sent Goal" value={String(monthly.sentGoal)} />
        <Stat label="Quotes-Sent Performance" value={`${monthly.sentPercentage}%`} badgeClassName={TIER_STYLES[crmPerformanceTier(monthly.sentPercentage)].badge} />
        <Stat label="Average Sent / Period" value={String(monthly.averageSentPerPeriod)} />
        <Stat label="Total Quotes Received" value={String(monthly.totalReceived)} />
        <Stat label="Monthly Quotes-Received Goal" value={String(monthly.receivedGoal)} />
        <Stat
          label="Quotes-Received Performance"
          value={`${monthly.receivedPercentage}%`}
          badgeClassName={TIER_STYLES[crmPerformanceTier(monthly.receivedPercentage)].badge}
        />
      </div>

      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Biweekly Period Breakdown</div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                <th className="p-2.5">Period</th>
                <th className="p-2.5">Quotes Sent</th>
                <th className="p-2.5">Quotes Received</th>
                <th className="p-2.5">Overall</th>
                <th className="p-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {monthly.periodBreakdown.length === 0 ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={5}>
                    No reporting periods start in this month.
                  </td>
                </tr>
              ) : (
                monthly.periodBreakdown.map((period) => {
                  const isFuture = period.status === "future";
                  const statusBadgeClass = period.status === "completed" ? TIER_STYLES[period.tier].badge : PERIOD_BADGE_CLASS;
                  const statusLabel = period.status === "completed" ? TIER_STATUS_LABEL[period.tier] : PERIOD_LABEL[period.status];
                  return (
                    <tr key={period.periodStart} className="border-b border-slate-100">
                      <td className="p-2.5 font-medium text-slate-900">{crmBiweeklyRangeLabel(period.periodStart, period.periodEnd)}</td>
                      <td className="p-2.5 text-slate-600">{isFuture ? "—" : `${period.quotesSent}/${period.quotesSentTarget}`}</td>
                      <td className="p-2.5 text-slate-600">{isFuture ? "—" : `${period.quotesReceived}/${period.quotesReceivedTarget}`}</td>
                      <td className="p-2.5 text-slate-600">{isFuture ? "—" : `${period.overallPercentage}%`}</td>
                      <td className="p-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${statusBadgeClass}`}>{statusLabel}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Monthly History</div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                <th className="p-2.5">Month</th>
                <th className="p-2.5">Quotes Sent</th>
                <th className="p-2.5">Quotes Received</th>
                <th className="p-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {historyTableRows.map((row) => {
                const style = TIER_STYLES[row.monthlyTier];
                const key = monthKey(row.year, row.month);
                const isSelected = key === selectedMonthKey;
                return (
                  <tr
                    key={key}
                    onClick={() => setSelectedMonthKey(key)}
                    className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                  >
                    <td className="p-2.5 font-medium text-slate-900">{row.monthLabel}</td>
                    <td className="p-2.5 text-slate-600">
                      {row.totalSent}/{row.sentGoal} ({row.sentPercentage}%)
                    </td>
                    <td className="p-2.5 text-slate-600">
                      {row.totalReceived}/{row.receivedGoal} ({row.receivedPercentage}%)
                    </td>
                    <td className="p-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${style.badge}`}>
                        {TIER_STATUS_LABEL[row.monthlyTier]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, badgeClassName }: { label: string; value: string; badgeClassName?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      {badgeClassName ? (
        <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[15px] font-bold ${badgeClassName}`}>{value}</div>
      ) : (
        <div className="mt-1 text-[17px] font-bold text-slate-900">{value}</div>
      )}
    </div>
  );
}
