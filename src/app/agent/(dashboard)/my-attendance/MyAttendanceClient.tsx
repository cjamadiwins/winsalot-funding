"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentAttendanceRow } from "@/lib/crm-types";
import {
  attendanceDateKey,
  buildDailyView,
  buildMonthlyView,
  buildWeeklyView,
  formatDurationMinutes,
  weekRangeLabel,
  weekStartOf,
  type AttendanceStatus,
} from "@/lib/crm-attendance-report";
import { addDays } from "@/lib/crm-performance";
import KpiCard from "@/components/crm-ui/KpiCard";
import { CalendarDays, CalendarRange, Clock, ListChecks } from "lucide-react";

type View = "daily" | "weekly" | "monthly";

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  "Clocked In": "bg-emerald-100 text-emerald-800",
  "Clocked Out": "bg-slate-100 text-slate-700",
  Incomplete: "bg-amber-100 text-amber-800",
  "Admin Clock-Out": "bg-indigo-100 text-indigo-800",
};

function StatusBadge({ status }: { status: AttendanceStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatShortDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// HH:MM:SS elapsed - same shape as the dashboard Attendance card's own
// live timer (AttendanceCard.tsx), rendered again here since a session's
// live duration must "show ... separately" from completed hours per the
// brief, on this page too.
function formatElapsedClock(ms: number): string {
  const totalSeconds = Math.floor(Math.max(ms, 0) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function MyAttendanceClient({
  rows,
  serverNowIso,
}: {
  rows: AgentAttendanceRow[];
  serverNowIso: string;
}) {
  const todayKey = useMemo(() => attendanceDateKey(serverNowIso), [serverNowIso]);

  const [view, setView] = useState<View>("daily");
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => weekStartOf(todayKey));
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const [year, month] = todayKey.split("-").map(Number);
    return { year, month };
  });

  const openRow = useMemo(() => rows.find((r) => !r.clock_out) ?? null, [rows]);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!openRow) return;
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [openRow]);

  const todaySummary = useMemo(() => buildDailyView(rows, todayKey, todayKey), [rows, todayKey]);
  const thisWeekSummary = useMemo(() => buildWeeklyView(rows, weekStartOf(todayKey), todayKey), [rows, todayKey]);
  const thisMonthSummary = useMemo(() => {
    const [year, month] = todayKey.split("-").map(Number);
    return buildMonthlyView(rows, year, month, todayKey);
  }, [rows, todayKey]);

  const dailyView = useMemo(() => buildDailyView(rows, selectedDate, todayKey), [rows, selectedDate, todayKey]);
  const weeklyView = useMemo(
    () => buildWeeklyView(rows, selectedWeekStart, todayKey),
    [rows, selectedWeekStart, todayKey]
  );
  const monthlyView = useMemo(
    () => buildMonthlyView(rows, selectedMonth.year, selectedMonth.month, todayKey),
    [rows, selectedMonth, todayKey]
  );

  const currentWeekStart = weekStartOf(todayKey);
  const isCurrentOrFutureWeek = selectedWeekStart >= currentWeekStart;

  const [currentYear, currentMonth] = todayKey.split("-").map(Number);
  const isCurrentOrFutureMonth =
    selectedMonth.year > currentYear || (selectedMonth.year === currentYear && selectedMonth.month >= currentMonth);

  const liveElapsedLabel =
    openRow && attendanceDateKey(openRow.clock_in) === selectedDate
      ? formatElapsedClock(tick - new Date(openRow.clock_in).getTime())
      : null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Today's Hours" value={formatDurationMinutes(todaySummary.completedMinutes)} icon={<Clock />} tone="blue" />
        <KpiCard label="This Week's Hours" value={formatDurationMinutes(thisWeekSummary.totalMinutes)} icon={<CalendarDays />} tone="green" />
        <KpiCard label="This Month's Hours" value={formatDurationMinutes(thisMonthSummary.totalMinutes)} icon={<CalendarRange />} tone="purple" />
        <KpiCard label="Days Worked This Month" value={String(thisMonthSummary.daysWorked)} icon={<ListChecks />} tone="amber" />
      </div>

      <div className="mt-6 inline-flex rounded-full border border-[var(--color-border)] bg-[var(--crm-surface)] p-1">
        {(["daily", "weekly", "monthly"] as View[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
              view === option
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-ink-strong)]"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {view === "daily" && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedDate((d) => addDays(d, -1))}
              className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-strong)] hover:bg-[var(--crm-surface-2)]"
            >
              ← Previous Day
            </button>
            <input
              type="date"
              value={selectedDate}
              max={todayKey}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] px-3.5 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={selectedDate >= todayKey}
              onClick={() => setSelectedDate((d) => addDays(d, 1))}
              className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-strong)] hover:bg-[var(--crm-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next Day →
            </button>
          </div>

          <h2 className="mt-4 font-heading text-lg font-bold text-[var(--color-ink-strong)]">{formatDateLabel(selectedDate)}</h2>

          {liveElapsedLabel && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-700">Currently Clocked In</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">{liveElapsedLabel}</p>
            </div>
          )}

          <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
            <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="px-4 py-3">Clock In</th>
                  <th className="px-4 py-3">Clock Out</th>
                  <th className="px-4 py-3">Break</th>
                  <th className="px-4 py-3">Total Hours</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {dailyView.sessions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                      No attendance records for this date.
                    </td>
                  </tr>
                )}
                {dailyView.sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="px-4 py-3">{formatTime(session.clockIn)}</td>
                    <td className="px-4 py-3">{formatTime(session.clockOut)}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">Not tracked</td>
                    <td className="px-4 py-3">
                      {session.status === "Incomplete"
                        ? "Incomplete"
                        : session.totalMinutes != null && session.clockOut
                          ? formatDurationMinutes(session.totalMinutes)
                          : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={session.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dailyView.sessions.length > 0 && (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              Total for this date: <span className="font-semibold text-[var(--color-ink-strong)]">{formatDurationMinutes(dailyView.completedMinutes)}</span>
            </p>
          )}
        </div>
      )}

      {view === "weekly" && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-bold text-[var(--color-ink-strong)]">
              Week of {weekRangeLabel(weeklyView.weekStart, weeklyView.weekEnd)}
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedWeekStart((d) => addDays(d, -7))}
                className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-strong)] hover:bg-[var(--crm-surface-2)]"
              >
                ← Previous Week
              </button>
              <button
                type="button"
                disabled={isCurrentOrFutureWeek}
                onClick={() => setSelectedWeekStart((d) => addDays(d, 7))}
                className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-strong)] hover:bg-[var(--crm-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next Week →
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
            <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Clock In</th>
                  <th className="px-4 py-3">Clock Out</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {weeklyView.days.map((day) => (
                  <tr key={day.dateKey}>
                    <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">{formatShortDateLabel(day.dateKey)}</td>
                    <td className="px-4 py-3">{formatTime(day.clockIn)}</td>
                    <td className="px-4 py-3">{formatTime(day.clockOut)}</td>
                    <td className="px-4 py-3">{formatDurationMinutes(day.minutes)}</td>
                    <td className="px-4 py-3">{day.status ? <StatusBadge status={day.status} /> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Total Hours</div>
              <div className="mt-1 text-xl font-bold text-[var(--color-ink-strong)]">{formatDurationMinutes(weeklyView.totalMinutes)}</div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Days Worked</div>
              <div className="mt-1 text-xl font-bold text-[var(--color-ink-strong)]">{weeklyView.daysWorked}</div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Average / Working Day</div>
              <div className="mt-1 text-xl font-bold text-[var(--color-ink-strong)]">{formatDurationMinutes(weeklyView.averageMinutesPerWorkingDay)}</div>
            </div>
          </div>
        </div>
      )}

      {view === "monthly" && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-bold text-[var(--color-ink-strong)]">{monthlyView.monthLabel}</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedMonth(({ year, month }) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }))
                }
                className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-strong)] hover:bg-[var(--crm-surface-2)]"
              >
                ← Previous Month
              </button>
              <button
                type="button"
                disabled={isCurrentOrFutureMonth}
                onClick={() =>
                  setSelectedMonth(({ year, month }) => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }))
                }
                className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-strong)] hover:bg-[var(--crm-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next Month →
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
            <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Clock In</th>
                  <th className="px-4 py-3">Clock Out</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {monthlyView.days.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                      No attendance records for this month.
                    </td>
                  </tr>
                )}
                {monthlyView.days.map((day) => (
                  <tr key={day.dateKey}>
                    <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">{formatShortDateLabel(day.dateKey)}</td>
                    <td className="px-4 py-3">{formatTime(day.clockIn)}</td>
                    <td className="px-4 py-3">{formatTime(day.clockOut)}</td>
                    <td className="px-4 py-3">{formatDurationMinutes(day.minutes)}</td>
                    <td className="px-4 py-3">{day.status ? <StatusBadge status={day.status} /> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Total Hours</div>
              <div className="mt-1 text-xl font-bold text-[var(--color-ink-strong)]">{formatDurationMinutes(monthlyView.totalMinutes)}</div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Days Worked</div>
              <div className="mt-1 text-xl font-bold text-[var(--color-ink-strong)]">{monthlyView.daysWorked}</div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Average / Working Day</div>
              <div className="mt-1 text-xl font-bold text-[var(--color-ink-strong)]">{formatDurationMinutes(monthlyView.averageMinutesPerWorkingDay)}</div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Incomplete Records</div>
              <div className="mt-1 text-xl font-bold text-[var(--color-ink-strong)]">{monthlyView.incompleteCount}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
