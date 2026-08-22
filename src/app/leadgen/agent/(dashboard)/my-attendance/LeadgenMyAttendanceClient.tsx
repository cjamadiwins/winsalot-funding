"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeadgenAgentAttendanceRow } from "@/lib/leadgen-types";
import {
  LEADGEN_ATTENDANCE_TIMEZONE,
  attendanceDateKey,
  buildDailyView,
  buildMonthlyView,
  buildWeeklyView,
  formatDurationMinutes,
  weekRangeLabel,
  weekStartOf,
  type AttendanceStatus,
} from "@/lib/leadgen-attendance-report";
import { addDays } from "@/lib/leadgen-performance";
import KpiCard from "@/components/crm-ui/KpiCard";
import { CalendarDays, CalendarRange, Clock, ListChecks } from "lucide-react";
import {
  attendanceRecordStatus,
  ATTENDANCE_RECORD_STATUS_LABELS,
  computeShiftPayBreakdown,
  type AttendanceRecordStatus,
} from "@/lib/attendance-pay";

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
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: LEADGEN_ATTENDANCE_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
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
// live timer (LeadgenAttendanceCard.tsx), rendered again here since a
// session's live duration must "show ... separately" from completed
// hours per the brief, on this page too.
function formatElapsedClock(ms: number): string {
  const totalSeconds = Math.floor(Math.max(ms, 0) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const RECORD_STATUS_STYLES: Record<AttendanceRecordStatus, string> = {
  clocked_in: "bg-emerald-100 text-emerald-800",
  on_break: "bg-sky-100 text-sky-800",
  present: "bg-slate-100 text-slate-700",
  late: "bg-amber-100 text-amber-800",
  early_departure: "bg-amber-100 text-amber-800",
  incomplete: "bg-rose-100 text-rose-700",
};

function RecordStatusBadge({ status }: { status: AttendanceRecordStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${RECORD_STATUS_STYLES[status]}`}>
      {ATTENDANCE_RECORD_STATUS_LABELS[status]}
    </span>
  );
}

export default function LeadgenMyAttendanceClient({
  rows,
  serverNowIso,
  scheduledStartTime,
}: {
  rows: LeadgenAgentAttendanceRow[];
  serverNowIso: string;
  scheduledStartTime: string | null;
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

      <div className="mt-6 inline-flex rounded-full border border-slate-200 bg-[var(--crm-surface)] p-1">
        {(["daily", "weekly", "monthly"] as View[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
              view === option ? "bg-sky-600 text-white" : "text-slate-500 hover:text-slate-900"
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
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ← Previous Day
            </button>
            <input
              type="date"
              value={selectedDate}
              max={todayKey}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={selectedDate >= todayKey}
              onClick={() => setSelectedDate((d) => addDays(d, 1))}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next Day →
            </button>
          </div>

          <h2 className="mt-4 text-lg font-bold text-slate-900">{formatDateLabel(selectedDate)}</h2>

          {liveElapsedLabel && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-700">Currently Clocked In</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">{liveElapsedLabel}</p>
            </div>
          )}

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Clock In</th>
                  <th className="px-4 py-3">Clock Out</th>
                  <th className="px-4 py-3">Lunch</th>
                  <th className="px-4 py-3">Breaks</th>
                  <th className="px-4 py-3">Paid Hours</th>
                  <th className="px-4 py-3">Late / Early</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {dailyView.sessions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No attendance records for this date.
                    </td>
                  </tr>
                )}
                {dailyView.sessions.map((session) => {
                  const rawRow = rows.find((r) => r.id === session.id);
                  const breakdown = rawRow ? computeShiftPayBreakdown(rawRow, scheduledStartTime, serverNowIso) : null;
                  const recordStatus = rawRow && breakdown
                    ? attendanceRecordStatus(rawRow, breakdown, attendanceDateKey(rawRow.clock_in) === todayKey)
                    : null;
                  return (
                    <tr key={session.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-slate-600">{formatTime(session.clockIn)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatTime(session.clockOut)}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {breakdown ? formatDurationMinutes(breakdown.lunchMinutes) : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {breakdown
                          ? `${formatDurationMinutes(breakdown.break1Minutes)} + ${formatDurationMinutes(breakdown.break2Minutes)}`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {session.status === "Incomplete" || !breakdown || !session.clockOut
                          ? "-"
                          : formatDurationMinutes(breakdown.paidWorkingMinutes)}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {breakdown && (breakdown.lateMinutes > 0 || breakdown.earlyDepartureMinutes > 0)
                          ? [
                              breakdown.lateMinutes > 0 ? `${breakdown.lateMinutes}m late` : null,
                              breakdown.earlyDepartureMinutes > 0 ? `${breakdown.earlyDepartureMinutes}m early` : null,
                            ]
                              .filter(Boolean)
                              .join(", ")
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {recordStatus ? <RecordStatusBadge status={recordStatus} /> : <StatusBadge status={session.status} />}
                        {session.status === "Admin Clock-Out" && (
                          <div className="mt-1 text-xs text-slate-400">Clocked out by admin</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {dailyView.sessions.length > 0 && (
            <p className="mt-3 text-sm text-slate-500">
              Total for this date: <span className="font-semibold text-slate-900">{formatDurationMinutes(dailyView.completedMinutes)}</span>
            </p>
          )}
        </div>
      )}

      {view === "weekly" && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Week of {weekRangeLabel(weeklyView.weekStart, weeklyView.weekEnd)}</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedWeekStart((d) => addDays(d, -7))}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ← Previous Week
              </button>
              <button
                type="button"
                disabled={isCurrentOrFutureWeek}
                onClick={() => setSelectedWeekStart((d) => addDays(d, 7))}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next Week →
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Clock In</th>
                  <th className="px-4 py-3">Clock Out</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {weeklyView.days.map((day) => (
                  <tr key={day.dateKey} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{formatShortDateLabel(day.dateKey)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatTime(day.clockIn)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatTime(day.clockOut)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDurationMinutes(day.minutes)}</td>
                    <td className="px-4 py-3">{day.status ? <StatusBadge status={day.status} /> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Hours</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{formatDurationMinutes(weeklyView.totalMinutes)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Days Worked</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{weeklyView.daysWorked}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Average / Working Day</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{formatDurationMinutes(weeklyView.averageMinutesPerWorkingDay)}</div>
            </div>
          </div>
        </div>
      )}

      {view === "monthly" && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">{monthlyView.monthLabel}</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedMonth(({ year, month }) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }))
                }
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ← Previous Month
              </button>
              <button
                type="button"
                disabled={isCurrentOrFutureMonth}
                onClick={() =>
                  setSelectedMonth(({ year, month }) => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }))
                }
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next Month →
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Clock In</th>
                  <th className="px-4 py-3">Clock Out</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {monthlyView.days.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No attendance records for this month.
                    </td>
                  </tr>
                )}
                {monthlyView.days.map((day) => (
                  <tr key={day.dateKey} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{formatShortDateLabel(day.dateKey)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatTime(day.clockIn)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatTime(day.clockOut)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDurationMinutes(day.minutes)}</td>
                    <td className="px-4 py-3">{day.status ? <StatusBadge status={day.status} /> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Hours</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{formatDurationMinutes(monthlyView.totalMinutes)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Days Worked</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{monthlyView.daysWorked}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Average / Working Day</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{formatDurationMinutes(monthlyView.averageMinutesPerWorkingDay)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Incomplete Records</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{monthlyView.incompleteCount}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
