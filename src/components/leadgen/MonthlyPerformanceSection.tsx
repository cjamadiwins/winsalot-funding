"use client";

import { useMemo, useState } from "react";
import {
  buildLeadgenWeeklyRecords,
  computeLeadgenMonthlyPerformance,
  leadgenMonthsInRange,
  leadgenWeekStartsInMonth,
  type LeadgenWeeklyHistoryRow,
  type LeadgenWeeklyRecord,
} from "@/lib/leadgen-performance-history";
import {
  LEADGEN_PERFORMANCE_TIER_LABEL,
  leadgenPerformanceTier,
  leadgenWeekRangeLabel,
  type LeadgenPerformanceAppointment,
  type LeadgenPerformanceTier,
} from "@/lib/leadgen-performance";

const TIER_STYLES: Record<LeadgenPerformanceTier, { badge: string; text: string }> = {
  green: { badge: "bg-emerald-100 text-emerald-800", text: "text-emerald-700" },
  yellow: { badge: "bg-amber-100 text-amber-800", text: "text-amber-700" },
  red: { badge: "bg-rose-100 text-rose-800", text: "text-rose-700" },
};

// A week that's still in progress or hasn't started yet has no
// green/yellow/red result to show - it gets a neutral label instead
// (brief: future weeks "must not display 0% or 'Behind Target'").
const PERIOD_LABEL: Record<"current" | "future", string> = {
  current: "In Progress",
  future: "Not Started",
};
const PERIOD_BADGE_CLASS = "bg-slate-100 text-slate-500";

const selectClass = "rounded-lg border border-slate-300 bg-[var(--crm-surface)] px-3 py-2 text-[13.5px] text-slate-900";

// Table of history spans a lot of months for an old dataset - cap how
// far back the month picker/table reach so both stay a manageable size.
// This CRM's data is only weeks old as of writing this, so the cap has
// no practical effect today.
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

export default function MonthlyPerformanceSection({
  agents,
  appointments,
  historyRows,
  currentWeekStart,
  currentYear,
  currentMonth,
}: {
  agents: Agent[];
  appointments: LeadgenPerformanceAppointment[];
  historyRows: LeadgenWeeklyHistoryRow[];
  currentWeekStart: string;
  currentYear: number;
  currentMonth: number;
}) {
  const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? "");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(monthKey(currentYear, currentMonth));

  const agent = agents.find((candidate) => candidate.id === agentId) ?? null;

  // Earliest month with any record (frozen weekly history or a live
  // appointment) for this agent, capped so the picker/table can't grow
  // unbounded for a very old dataset.
  const earliestMonth = useMemo(() => {
    if (!agent) return { year: currentYear, month: currentMonth };
    let earliest = monthKey(currentYear, currentMonth);
    for (const row of historyRows) {
      if (row.agent_id !== agent.id) continue;
      const key = row.week_start.slice(0, 7);
      if (key < earliest) earliest = key;
    }
    for (const appt of appointments) {
      if (appt.booking_agent_id !== agent.id) continue;
      const key = appt.created_at.slice(0, 10).slice(0, 7);
      if (key < earliest) earliest = key;
    }
    const [earliestYear, earliestMonthNum] = earliest.split("-").map(Number);
    const fullRange = leadgenMonthsInRange(earliestYear, earliestMonthNum, currentYear, currentMonth);
    const capped = fullRange.length > MAX_HISTORY_MONTHS ? fullRange[fullRange.length - MAX_HISTORY_MONTHS] : fullRange[0];
    return capped ?? { year: currentYear, month: currentMonth };
  }, [agent, historyRows, appointments, currentYear, currentMonth]);

  const monthOptions = useMemo(
    () => leadgenMonthsInRange(earliestMonth.year, earliestMonth.month, currentYear, currentMonth).reverse(),
    [earliestMonth, currentYear, currentMonth]
  );

  const [selectedYear, selectedMonthNum] = selectedMonthKey.split("-").map(Number);

  const weeklyBreakdown: LeadgenWeeklyRecord[] = useMemo(() => {
    if (!agent) return [];
    const weekStarts = leadgenWeekStartsInMonth(selectedYear, selectedMonthNum);
    return buildLeadgenWeeklyRecords(weekStarts, historyRows, appointments, agent.id, currentWeekStart);
  }, [agent, selectedYear, selectedMonthNum, historyRows, appointments, currentWeekStart]);

  const monthly = useMemo(
    () => computeLeadgenMonthlyPerformance(selectedYear, selectedMonthNum, weeklyBreakdown),
    [selectedYear, selectedMonthNum, weeklyBreakdown]
  );

  const historyTableRows = useMemo(() => {
    if (!agent) return [];
    return monthOptions.map(({ year, month }) => {
      const weekStarts = leadgenWeekStartsInMonth(year, month);
      const records = buildLeadgenWeeklyRecords(weekStarts, historyRows, appointments, agent.id, currentWeekStart);
      return computeLeadgenMonthlyPerformance(year, month, records);
    });
  }, [agent, monthOptions, historyRows, appointments, currentWeekStart]);

  if (agents.length === 0) {
    return null;
  }

  const monthlyTier = leadgenPerformanceTier(monthly.percentage);
  const monthlyTierStyle = TIER_STYLES[monthlyTier];

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Monthly Performance</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Permanently saved weekly results rolled up by month. The monthly goal is 4 appointments times the number of
            Monday-Sunday weeks in the selected month that have begun - weeks that haven&apos;t started yet don&apos;t
            count against it yet.
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
        <Stat label="Appointments Booked" value={String(monthly.totalBooked)} />
        <Stat label="Monthly Goal" value={String(monthly.monthlyGoal)} />
        <Stat label="Performance" value={`${monthly.percentage}%`} badgeClassName={monthlyTierStyle.badge} />
        <Stat label="Weekly Average" value={String(monthly.weeklyAverage)} />
        <Stat
          label="Best Week"
          value={monthly.bestWeek ? `${monthly.bestWeek.bookedCount} (${leadgenWeekRangeLabel(monthly.bestWeek.weekStart, monthly.bestWeek.weekEnd)})` : "—"}
        />
        <Stat label="Weeks Included" value={String(monthly.weeksIncluded)} />
        <Stat
          label="Status"
          value={LEADGEN_PERFORMANCE_TIER_LABEL[monthlyTier]}
          badgeClassName={monthlyTierStyle.badge}
        />
      </div>

      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Weekly Breakdown</div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[520px] text-left text-[12.5px]">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                <th className="p-2.5">Week</th>
                <th className="p-2.5">Booked</th>
                <th className="p-2.5">Target</th>
                <th className="p-2.5">Performance</th>
                <th className="p-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {monthly.weeklyBreakdown.length === 0 ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={5}>
                    No reporting weeks in this month.
                  </td>
                </tr>
              ) : (
                monthly.weeklyBreakdown.map((week) => {
                  const isFuture = week.period === "future";
                  const statusBadgeClass = week.period === "completed" ? TIER_STYLES[week.tier].badge : PERIOD_BADGE_CLASS;
                  const statusLabel = week.period === "completed" ? LEADGEN_PERFORMANCE_TIER_LABEL[week.tier] : PERIOD_LABEL[week.period];
                  return (
                    <tr key={week.weekStart} className="border-b border-slate-100">
                      <td className="p-2.5 font-medium text-slate-900">{leadgenWeekRangeLabel(week.weekStart, week.weekEnd)}</td>
                      <td className="p-2.5 text-slate-600">{isFuture ? "—" : week.bookedCount}</td>
                      <td className="p-2.5 text-slate-600">{week.target}</td>
                      <td className="p-2.5 text-slate-600">{isFuture ? "—" : `${week.percentage}%`}</td>
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
          <table className="w-full min-w-[520px] text-left text-[12.5px]">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                <th className="p-2.5">Month</th>
                <th className="p-2.5">Appointments Booked</th>
                <th className="p-2.5">Monthly Goal</th>
                <th className="p-2.5">Performance Percentage</th>
                <th className="p-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {historyTableRows.map((row) => {
                const tier = leadgenPerformanceTier(row.percentage);
                const style = TIER_STYLES[tier];
                const key = monthKey(row.year, row.month);
                const isSelected = key === selectedMonthKey;
                return (
                  <tr
                    key={key}
                    onClick={() => setSelectedMonthKey(key)}
                    className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                  >
                    <td className="p-2.5 font-medium text-slate-900">{row.monthLabel}</td>
                    <td className="p-2.5 text-slate-600">{row.totalBooked}</td>
                    <td className="p-2.5 text-slate-600">{row.monthlyGoal}</td>
                    <td className="p-2.5 text-slate-600">{row.percentage}%</td>
                    <td className="p-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${style.badge}`}>
                        {LEADGEN_PERFORMANCE_TIER_LABEL[tier]}
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
