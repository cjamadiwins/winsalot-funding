import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { formatDialpadDuration } from "@/lib/dialpad-report";
import type { DialpadReportRow, DialpadUserStatRow } from "@/lib/dialpad-report-data";
import { Bar, Legend } from "./DialpadPerformanceDashboard";

type Props = {
  audience: "admin" | "agent";
  report: DialpadReportRow | null;
  summaries: DialpadUserStatRow[];
  fullReportHref?: string;
};

function periodLabel(report: DialpadReportRow) {
  const format = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  return `${format(report.period_start)} – ${format(report.period_end)}`;
}

export default function DialpadDashboardPreview({ audience, report, summaries, fullReportHref }: Props) {
  const isAdmin = audience === "admin";
  const visibleRows = isAdmin ? summaries.slice(0, 8) : summaries.slice(0, 1);
  const totals = summaries.reduce(
    (total, row) => ({
      calls: total.calls + row.total_calls,
      placed: total.placed + row.placed_calls,
      answered: total.answered + row.answered_calls,
      missed: total.missed + row.missed_calls,
      duration: total.duration + row.total_duration_seconds,
    }),
    { calls: 0, placed: 0, answered: 0, missed: 0, duration: 0 }
  );
  const maxCalls = Math.max(1, ...visibleRows.map((row) => row.total_calls));

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface,#fff)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700">
            <PhoneCall className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">Dialpad Performance</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              {report
                ? `${isAdmin ? "All agents and admins" : "Your calls only"} · ${periodLabel(report)}`
                : "Weekly outbound call results will appear here after the first CSV import."}
            </p>
          </div>
        </div>
        {isAdmin && fullReportHref && (
          <Link href={fullReportHref} className="text-[13px] font-semibold text-violet-700 hover:text-violet-800">
            Open full report →
          </Link>
        )}
      </div>

      {!report ? null : visibleRows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
          {isAdmin
            ? "This report does not contain any user totals."
            : "No Dialpad row matched your CRM account in the latest report. Ask an admin to check the Dialpad agent mapping."}
        </p>
      ) : isAdmin ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Total calls", totals.calls],
              ["Placed", totals.placed],
              ["Answered", totals.answered],
              ["Missed", totals.missed],
              ["Talk time", formatDialpadDuration(totals.duration)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {visibleRows.map((row) => {
              const answerRate = row.placed_calls > 0 ? Math.round((row.answered_calls / row.placed_calls) * 100) : 0;
              return (
                <div key={row.id} className="grid gap-2 sm:grid-cols-[minmax(130px,1.2fr)_2fr_auto] sm:items-center">
                  <div>
                    <div className="truncate text-[13px] font-semibold text-slate-800">{row.agent_name}</div>
                    <div className="text-[11.5px] text-slate-500">
                      {row.agent_role === "admin" ? "Admin" : "Agent"} · {answerRate}% answered
                    </div>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${Math.max(3, (row.total_calls / maxCalls) * 100)}%` }}
                    />
                  </div>
                  <div className="text-right text-[13px] font-bold text-slate-800">{row.total_calls} calls</div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        // Agent view: this CRM user's own row only (RLS on dialpad_user_stats
        // guarantees `summaries` can never carry another agent's data here),
        // shown with the same stat/chart language as the admin Dialpad
        // Performance dashboard rather than the team comparison list above.
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["Total Calls", totals.calls],
              ["Placed", totals.placed],
              ["Answered", totals.answered],
              ["Missed", totals.missed],
              ["Total Duration", formatDialpadDuration(totals.duration)],
              ["Average Duration", formatDialpadDuration(visibleRows[0].average_duration_seconds)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[13px] font-bold text-slate-900">Weekly performance chart</h3>
            <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-slate-600">
              <Legend color="bg-blue-500" label="Total" />
              <Legend color="bg-indigo-500" label="Placed" />
              <Legend color="bg-emerald-500" label="Answered" />
              <Legend color="bg-rose-500" label="Missed" />
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <div className="w-32 shrink-0 text-center">
              <div className="flex h-40 items-end justify-center gap-1.5 border-b border-slate-200 px-2">
                <Bar value={visibleRows[0].total_calls} max={maxCalls} color="bg-blue-500" />
                <Bar value={visibleRows[0].placed_calls} max={maxCalls} color="bg-indigo-500" />
                <Bar value={visibleRows[0].answered_calls} max={maxCalls} color="bg-emerald-500" />
                <Bar value={visibleRows[0].missed_calls} max={maxCalls} color="bg-rose-500" />
              </div>
              <div className="mt-2 text-xs font-bold text-slate-800">This week</div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
