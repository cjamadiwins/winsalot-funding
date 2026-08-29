"use client";

import { useActionState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, CalendarDays, PhoneCall, Upload } from "lucide-react";
import { formatDialpadDuration, type DialpadWorkspace } from "@/lib/dialpad-report";
import type { DialpadDashboardData } from "@/lib/dialpad-report-data";

type ImportState = { error?: string; success?: string };
type ImportAction = (state: ImportState, formData: FormData) => Promise<ImportState>;

const EMPTY_STATE: ImportState = {};
const NOOP_IMPORT_ACTION: ImportAction = async () => ({});

function previousWeek() {
  const today = new Date();
  const currentMonday = new Date(today);
  const day = (today.getDay() + 6) % 7;
  currentMonday.setDate(today.getDate() - day);
  const start = new Date(currentMonday);
  start.setDate(currentMonday.getDate() - 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const dateKey = (date: Date) => date.toISOString().slice(0, 10);
  return { start: dateKey(start), end: dateKey(end) };
}

export default function DialpadPerformanceDashboard({
  workspace,
  basePath,
  data,
  importAction,
  audience = "admin",
}: {
  workspace: DialpadWorkspace;
  basePath: string;
  data: DialpadDashboardData;
  importAction?: ImportAction;
  audience?: "admin" | "agent";
}) {
  const isAgent = audience === "agent";
  const router = useRouter();
  const [state, formAction, pending] = useActionState(importAction ?? NOOP_IMPORT_ACTION, EMPTY_STATE);
  const dates = useMemo(() => previousWeek(), []);
  const totals = useMemo(
    () =>
      data.summaries.reduce(
        (result, row) => ({
          calls: result.calls + row.total_calls,
          placed: result.placed + row.placed_calls,
          answered: result.answered + row.answered_calls,
          missed: result.missed + row.missed_calls,
          duration: result.duration + row.total_duration_seconds,
        }),
        { calls: 0, placed: 0, answered: 0, missed: 0, duration: 0 }
      ),
    [data.summaries]
  );
  const averageDurationSeconds = totals.calls > 0 ? Math.round(totals.duration / totals.calls) : 0;
  const maxCalls = Math.max(1, ...data.summaries.map((row) => row.total_calls));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
            <PhoneCall size={17} /> Dialpad reporting
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Dialpad Performance</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAgent ? "Your own weekly call performance." : "Weekly call performance for all active agents and administrators."}
          </p>
        </div>
        {data.selectedReport && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-right shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Current report</div>
            <div className="mt-0.5 text-sm font-bold text-slate-900">
              {data.selectedReport.period_start} – {data.selectedReport.period_end}
            </div>
          </div>
        )}
      </header>

      {!isAgent && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-sky-700" />
            <h2 className="text-base font-bold text-slate-900">Import weekly Dialpad CSV</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Upload User Statistics or Call Logs. The import is shared automatically with {workspace === "growth" ? "Lead CRM" : "Growth CRM"}.
          </p>
          <p className="mt-1 text-xs font-medium text-amber-700">
            For private agent dashboards, export Call Logs with each Dialpad user&apos;s email. The email must match their CRM login.
          </p>
          <form action={formAction} className="mt-4 grid gap-3 lg:grid-cols-[1fr_170px_170px_auto] lg:items-end">
            <label className="block text-xs font-semibold text-slate-600">
              Dialpad CSV
              <input
                name="report_file"
                type="file"
                accept=".csv,text/csv"
                required
                className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-sky-100 file:px-3 file:py-1.5 file:font-semibold file:text-sky-800"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Week starts
              <input name="period_start" type="date" defaultValue={dates.start} required className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Week ends
              <input name="period_end" type="date" defaultValue={dates.end} required className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
            </label>
            <button disabled={pending} className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-wait disabled:opacity-60">
              {pending ? "Importing…" : "Import Report"}
            </button>
          </form>
          {state.error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{state.error}</p>}
          {state.success && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{state.success}</p>}
        </section>
      )}

      {data.reports.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <CalendarDays size={17} className="text-slate-500" />
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="dialpad-report-period">Report week</label>
          <select
            id="dialpad-report-period"
            value={data.selectedReport?.id ?? ""}
            onChange={(event) => router.push(`${basePath}?report=${event.target.value}`)}
            className="min-w-[250px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800"
          >
            {data.reports.map((report) => (
              <option key={report.id} value={report.id}>
                {report.period_start} – {report.period_end} ({report.user_count} users)
              </option>
            ))}
          </select>
          {data.selectedReport && <span className="text-xs text-slate-500">Imported from {data.selectedReport.source_workspace === "growth" ? "Growth CRM" : "Lead CRM"}</span>}
        </section>
      )}

      {!data.selectedReport ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <BarChart3 className="mx-auto text-slate-300" size={38} />
          <h2 className="mt-3 text-lg font-bold text-slate-800">No Dialpad report imported yet</h2>
          <p className="mt-1 text-sm text-slate-500">Export one week from Dialpad Analytics and upload the CSV above.</p>
        </section>
      ) : (
        <>
          <section className={`grid gap-3 sm:grid-cols-2 ${isAgent ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
            <Stat label="Total Calls" value={totals.calls.toLocaleString()} tone="blue" />
            <Stat label="Placed" value={totals.placed.toLocaleString()} tone="indigo" />
            <Stat label="Answered" value={totals.answered.toLocaleString()} tone="green" />
            <Stat label="Missed" value={totals.missed.toLocaleString()} tone="red" />
            <Stat label="Total Duration" value={formatDialpadDuration(totals.duration)} tone="slate" />
            {isAgent && <Stat label="Average Duration" value={formatDialpadDuration(averageDurationSeconds)} tone="slate" />}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">{isAgent ? "Your performance chart" : "All users comparison"}</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {isAgent ? "Your own weekly calls only." : "Agents and administrators are included."}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-slate-600">
                <Legend color="bg-blue-500" label="Total" />
                <Legend color="bg-indigo-500" label="Placed" />
                <Legend color="bg-emerald-500" label="Answered" />
                <Legend color="bg-rose-500" label="Missed" />
              </div>
            </div>
            <div className="mt-6 overflow-x-auto pb-2">
              <div className="flex min-w-max items-end gap-5" style={{ minHeight: 270 }}>
                {data.summaries.map((row) => (
                  <div key={row.id} className="w-32 shrink-0 text-center">
                    <div className="flex h-48 items-end justify-center gap-1.5 border-b border-slate-200 px-2">
                      <Bar value={row.total_calls} max={maxCalls} color="bg-blue-500" />
                      <Bar value={row.placed_calls} max={maxCalls} color="bg-indigo-500" />
                      <Bar value={row.answered_calls} max={maxCalls} color="bg-emerald-500" />
                      <Bar value={row.missed_calls} max={maxCalls} color="bg-rose-500" />
                    </div>
                    <div className="mt-2 truncate text-xs font-bold text-slate-800" title={row.agent_name}>{row.agent_name}</div>
                    <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{row.agent_role}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">{isAgent ? "Your performance" : "User performance"}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Calls</th><th className="p-3">Placed</th><th className="p-3">Answered</th><th className="p-3">Missed</th><th className="p-3">Total Duration</th><th className="p-3">Avg. Duration</th></tr>
                </thead>
                <tbody>
                  {data.summaries.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="p-3"><div className="font-semibold text-slate-900">{row.agent_name}</div>{row.agent_email && <div className="text-xs text-slate-500">{row.agent_email}</div>}</td>
                      <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.agent_role === "admin" ? "bg-purple-100 text-purple-800" : "bg-sky-100 text-sky-800"}`}>{row.agent_role === "admin" ? "Admin" : "Agent"}</span></td>
                      <td className="p-3 font-bold text-slate-900">{row.total_calls}</td><td className="p-3 text-slate-700">{row.placed_calls}</td><td className="p-3 text-emerald-700">{row.answered_calls}</td><td className="p-3 text-rose-700">{row.missed_calls}</td><td className="p-3 text-slate-700">{formatDialpadDuration(row.total_duration_seconds)}</td><td className="p-3 text-slate-700">{formatDialpadDuration(row.average_duration_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.calls.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-base font-bold text-slate-900">Detailed call history</h2>
                <p className="mt-0.5 text-xs text-slate-500">Showing up to 500 rows from the selected report.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Direction</th><th className="p-3">Status</th><th className="p-3">Duration</th><th className="p-3">Number</th></tr></thead>
                  <tbody>{data.calls.map((call) => <tr key={call.id} className="border-t border-slate-100"><td className="p-3 text-slate-600">{call.started_at ? new Date(call.started_at).toLocaleString() : "—"}</td><td className="p-3 font-semibold text-slate-900">{call.agent_name}</td><td className="p-3 capitalize text-slate-600">{call.agent_role}</td><td className="p-3 text-slate-600">{call.direction}</td><td className="p-3 text-slate-600">{call.call_status}</td><td className="p-3 text-slate-600">{formatDialpadDuration(call.duration_seconds)}</td><td className="p-3 text-slate-600">{call.phone_number || "—"}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "blue" | "indigo" | "green" | "red" | "slate" }) {
  const tones = { blue: "bg-blue-50 text-blue-800", indigo: "bg-indigo-50 text-indigo-800", green: "bg-emerald-50 text-emerald-800", red: "bg-rose-50 text-rose-800", slate: "bg-slate-100 text-slate-800" };
  return <div className={`rounded-2xl border border-white/70 p-4 shadow-sm ${tones[tone]}`}><div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>;
}

export function Legend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</span>; }

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const height = value === 0 ? 3 : Math.max(8, Math.round((value / max) * 100));
  return <div className={`relative w-5 rounded-t-md ${color}`} style={{ height: `${height}%` }} title={String(value)}><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-500">{value}</span></div>;
}
