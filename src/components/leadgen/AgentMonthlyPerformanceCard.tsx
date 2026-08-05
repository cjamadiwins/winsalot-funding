"use client";

import { useMemo, useState } from "react";
import {
  buildLeadgenWeeklyRecords,
  computeLeadgenMonthlyPerformance,
  leadgenMonthsInRange,
  leadgenWeekStartsInMonth,
  type LeadgenWeeklyHistoryRow,
} from "@/lib/leadgen-performance-history";
import {
  LEADGEN_PERFORMANCE_TIER_LABEL,
  leadgenPerformanceTier,
  type LeadgenPerformanceAppointment,
  type LeadgenPerformanceTier,
} from "@/lib/leadgen-performance";

// Same color system as the weekly Agent Performance Report
// (AgentPerformanceCard.tsx) - green/yellow/red on the percentage badge
// and progress bar always agree.
const TIER_STYLES: Record<LeadgenPerformanceTier, { bar: string; badge: string; text: string }> = {
  green: { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800", text: "text-emerald-700" },
  yellow: { bar: "bg-amber-500", badge: "bg-amber-100 text-amber-800", text: "text-amber-700" },
  red: { bar: "bg-rose-500", badge: "bg-rose-100 text-rose-800", text: "text-rose-700" },
};

const selectClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13.5px] text-slate-900";

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
// appointments or history rows (the caller, /leadgen/agent/performance/monthly,
// scopes both queries to this agent alone), so there is nothing here
// another agent's data could leak through even in the rendered page's
// source. Mirrors MonthlyPerformanceSection.tsx (the admin's
// every-agent view) but deliberately has no agent selector - the whole
// point of this component is that it is always exactly one agent's own
// view.
export default function AgentMonthlyPerformanceCard({
  agentId,
  agentName,
  appointments,
  historyRows,
  currentWeekStart,
  currentYear,
  currentMonth,
}: {
  agentId: string;
  agentName: string;
  appointments: LeadgenPerformanceAppointment[];
  historyRows: LeadgenWeeklyHistoryRow[];
  currentWeekStart: string;
  currentYear: number;
  currentMonth: number;
}) {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(monthKey(currentYear, currentMonth));

  const earliestMonth = useMemo(() => {
    let earliest = monthKey(currentYear, currentMonth);
    for (const row of historyRows) {
      const key = row.week_start.slice(0, 7);
      if (key < earliest) earliest = key;
    }
    for (const appt of appointments) {
      const key = appt.created_at.slice(0, 7);
      if (key < earliest) earliest = key;
    }
    const [earliestYear, earliestMonthNum] = earliest.split("-").map(Number);
    const fullRange = leadgenMonthsInRange(earliestYear, earliestMonthNum, currentYear, currentMonth);
    const capped = fullRange.length > MAX_HISTORY_MONTHS ? fullRange[fullRange.length - MAX_HISTORY_MONTHS] : fullRange[0];
    return capped ?? { year: currentYear, month: currentMonth };
  }, [historyRows, appointments, currentYear, currentMonth]);

  const monthOptions = useMemo(
    () => leadgenMonthsInRange(earliestMonth.year, earliestMonth.month, currentYear, currentMonth).reverse(),
    [earliestMonth, currentYear, currentMonth]
  );

  const [selectedYear, selectedMonthNum] = selectedMonthKey.split("-").map(Number);

  const monthly = useMemo(() => {
    const weekStarts = leadgenWeekStartsInMonth(selectedYear, selectedMonthNum);
    const weeklyBreakdown = buildLeadgenWeeklyRecords(weekStarts, historyRows, appointments, agentId, currentWeekStart);
    return computeLeadgenMonthlyPerformance(selectedYear, selectedMonthNum, weeklyBreakdown);
  }, [selectedYear, selectedMonthNum, historyRows, appointments, agentId, currentWeekStart]);

  const historyRowsForTable = useMemo(
    () =>
      monthOptions.map(({ year, month }) => {
        const weekStarts = leadgenWeekStartsInMonth(year, month);
        const weeklyBreakdown = buildLeadgenWeeklyRecords(weekStarts, historyRows, appointments, agentId, currentWeekStart);
        return computeLeadgenMonthlyPerformance(year, month, weeklyBreakdown);
      }),
    [monthOptions, historyRows, appointments, agentId, currentWeekStart]
  );

  const tier = leadgenPerformanceTier(monthly.percentage);
  const tierStyle = TIER_STYLES[tier];
  const barWidth = Math.min(100, monthly.percentage);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
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

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Appointments Booked" value={String(monthly.totalBooked)} />
        <Stat label="Monthly Goal" value={String(monthly.monthlyGoal)} />
        <Stat label="Performance" value={`${monthly.percentage}%`} badgeClassName={tierStyle.badge} />
        <Stat label="Remaining to Goal" value={String(monthly.remainingToGoal)} />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Monthly Progress</span>
          <span className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold normal-case tracking-normal ${tierStyle.badge}`}>
              {LEADGEN_PERFORMANCE_TIER_LABEL[tier]}
            </span>
            <span className={tierStyle.text}>{monthly.percentage}%</span>
          </span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${tierStyle.bar} transition-all`} style={{ width: `${barWidth}%` }} />
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Monthly History</div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[420px] text-left text-[12.5px]">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                <th className="p-2.5">Month</th>
                <th className="p-2.5">Booked</th>
                <th className="p-2.5">Goal</th>
                <th className="p-2.5">Performance</th>
              </tr>
            </thead>
            <tbody>
              {historyRowsForTable.map((row) => {
                const rowTier = leadgenPerformanceTier(row.percentage);
                const key = monthKey(row.year, row.month);
                const isSelected = key === selectedMonthKey;
                return (
                  <tr
                    key={key}
                    onClick={() => setSelectedMonthKey(key)}
                    className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                  >
                    <td className="p-2.5 font-medium text-slate-900">{row.monthLabel}</td>
                    <td className="p-2.5 text-slate-600">{row.totalBooked}</td>
                    <td className="p-2.5 text-slate-600">{row.monthlyGoal}</td>
                    <td className="p-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${TIER_STYLES[rowTier].badge}`}>
                        {row.percentage}%
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
