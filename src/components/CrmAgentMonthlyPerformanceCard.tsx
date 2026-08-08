"use client";

import { useMemo, useState } from "react";
import {
  buildCrmPeriodRecords,
  computeCrmMonthlyPerformance,
  crmMonthsInRange,
  crmPeriodStartsInMonth,
  type CrmBiweeklyHistoryRow,
} from "@/lib/crm-performance-history";
import { crmPerformanceTier, type CrmPerformanceQuoteRecord, type CrmPerformanceTier } from "@/lib/crm-performance";

// Same color system as the existing biweekly Agent Performance Report
// (CrmPerformanceCard.tsx) - green/yellow/red on every percentage badge
// and progress bar agree.
const TIER_STYLES: Record<CrmPerformanceTier, { bar: string; badge: string; text: string }> = {
  green: { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800", text: "text-emerald-700" },
  yellow: { bar: "bg-amber-500", badge: "bg-amber-100 text-amber-800", text: "text-amber-700" },
  red: { bar: "bg-rose-500", badge: "bg-rose-100 text-rose-800", text: "text-rose-700" },
};

const TIER_STATUS_LABEL: Record<CrmPerformanceTier, string> = {
  green: "On Track",
  yellow: "Needs Improvement",
  red: "Behind Target",
};

const selectClass = "rounded-lg border border-slate-300 bg-[var(--crm-surface)] px-3 py-2 text-[13.5px] text-slate-900";

// Table/history spans a lot of months for an old dataset - cap how far
// back the month picker/history reach so both stay a manageable size.
const MAX_HISTORY_MONTHS = 24;

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

// This agent's own Monthly Performance - never given another agent's
// quote records or history rows (the caller, /agent/performance/monthly,
// scopes both to this agent alone via getCrmPerformanceRecords(agentId)
// and an explicit agent_id filter), so there is nothing here another
// agent's data could leak through even in the rendered page's source.
// Mirrors CrmMonthlyPerformanceSection.tsx (the admin's every-agent
// view) but deliberately has no agent selector - the whole point of
// this component is that it is always exactly one agent's own view.
export default function CrmAgentMonthlyPerformanceCard({
  agentId,
  agentName,
  records,
  historyRows,
  currentPeriodStart,
  currentYear,
  currentMonth,
}: {
  agentId: string;
  agentName: string;
  records: CrmPerformanceQuoteRecord[];
  historyRows: CrmBiweeklyHistoryRow[];
  currentPeriodStart: string;
  currentYear: number;
  currentMonth: number;
}) {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(monthKey(currentYear, currentMonth));

  const earliestMonth = useMemo(() => {
    let earliest = monthKey(currentYear, currentMonth);
    for (const row of historyRows) {
      const key = row.period_start.slice(0, 7);
      if (key < earliest) earliest = key;
    }
    for (const record of records) {
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
  }, [historyRows, records, currentYear, currentMonth]);

  const monthOptions = useMemo(
    () => crmMonthsInRange(earliestMonth.year, earliestMonth.month, currentYear, currentMonth).reverse(),
    [earliestMonth, currentYear, currentMonth]
  );

  const [selectedYear, selectedMonthNum] = selectedMonthKey.split("-").map(Number);

  const monthly = useMemo(() => {
    const periodStarts = crmPeriodStartsInMonth(selectedYear, selectedMonthNum);
    const periodBreakdown = buildCrmPeriodRecords(periodStarts, historyRows, records, agentId, currentPeriodStart);
    return computeCrmMonthlyPerformance(selectedYear, selectedMonthNum, periodBreakdown);
  }, [selectedYear, selectedMonthNum, historyRows, records, agentId, currentPeriodStart]);

  const historyRowsForTable = useMemo(
    () =>
      monthOptions.map(({ year, month }) => {
        const periodStarts = crmPeriodStartsInMonth(year, month);
        const periodBreakdown = buildCrmPeriodRecords(periodStarts, historyRows, records, agentId, currentPeriodStart);
        return computeCrmMonthlyPerformance(year, month, periodBreakdown);
      }),
    [monthOptions, historyRows, records, agentId, currentPeriodStart]
  );

  const sentTier = crmPerformanceTier(monthly.sentPercentage);
  const receivedTier = crmPerformanceTier(monthly.receivedPercentage);
  const overallTierStyle = TIER_STYLES[monthly.monthlyTier];

  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{agentName}</h2>
        <select className={selectClass} value={selectedMonthKey} onChange={(event) => setSelectedMonthKey(event.target.value)}>
          {monthOptions.map(({ year, month }) => (
            <option key={monthKey(year, month)} value={monthKey(year, month)}>
              {monthLabelShort(year, month)}
            </option>
          ))}
        </select>
      </div>

      <GoalSection
        title="Quotes Sent"
        total={monthly.totalSent}
        goal={monthly.sentGoal}
        remaining={monthly.remainingSent}
        percentage={monthly.sentPercentage}
        tier={sentTier}
      />
      <GoalSection
        title="Completed Quote Requests Submitted"
        total={monthly.totalReceived}
        goal={monthly.receivedGoal}
        remaining={monthly.remainingReceived}
        percentage={monthly.receivedPercentage}
        tier={receivedTier}
      />

      <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Overall Monthly Performance</span>
        <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${overallTierStyle.badge}`}>
          {TIER_STATUS_LABEL[monthly.monthlyTier]} — {monthly.monthlyOverallPercentage}%
        </span>
      </div>

      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Monthly History</div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[420px] text-left text-[12.5px]">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                <th className="p-2.5">Month</th>
                <th className="p-2.5">Quotes Sent</th>
                <th className="p-2.5">Completed Submitted</th>
                <th className="p-2.5">Overall</th>
              </tr>
            </thead>
            <tbody>
              {historyRowsForTable.map((row) => {
                const key = monthKey(row.year, row.month);
                const isSelected = key === selectedMonthKey;
                return (
                  <tr
                    key={key}
                    onClick={() => setSelectedMonthKey(key)}
                    className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                  >
                    <td className="p-2.5 font-medium text-slate-900">{row.monthLabel}</td>
                    <td className="p-2.5 text-slate-600">
                      {row.totalSent}/{row.sentGoal}
                    </td>
                    <td className="p-2.5 text-slate-600">
                      {row.totalReceived}/{row.receivedGoal}
                    </td>
                    <td className="p-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${TIER_STYLES[row.monthlyTier].badge}`}>
                        {row.monthlyOverallPercentage}%
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

function GoalSection({
  title,
  total,
  goal,
  remaining,
  percentage,
  tier,
}: {
  title: string;
  total: number;
  goal: number;
  remaining: number;
  percentage: number;
  tier: CrmPerformanceTier;
}) {
  const style = TIER_STYLES[tier];
  // The number itself is never capped (a percentage over 100% is valid
  // and must display correctly, brief: "Performance above 100%... should
  // not cause an error") - only the bar's rendered width is capped so it
  // never visually overflows its track.
  const barWidth = Math.min(100, Math.max(0, percentage));

  return (
    <div className="mt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total" value={String(total)} />
        <Stat label="Monthly Target" value={String(goal)} />
        <Stat label="Remaining to Target" value={String(remaining)} />
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Performance</span>
          <span className={style.text}>{percentage}%</span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${style.bar} transition-all`} style={{ width: `${barWidth}%` }} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-[17px] font-bold text-slate-900">{value}</div>
    </div>
  );
}
