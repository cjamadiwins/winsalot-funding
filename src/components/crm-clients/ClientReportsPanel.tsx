"use client";

import Link from "next/link";
import { CalendarCheck, Download, Eye, Send, UserCheck, Users } from "lucide-react";
import { useState, useTransition } from "react";
import type { LeadgenReportPeriod } from "@/lib/leadgen-client-report";

type ActionResult = { error?: string; sent?: number };
type ReportSummary = {
  period: LeadgenReportPeriod;
  leadsAdded: number;
  interestedLeads: number;
  appointmentsBooked: number;
  summary: string;
};

export default function ClientReportsPanel({
  crmClientId,
  month,
  report,
  canSend,
  sendAction,
}: {
  crmClientId: string;
  month: string;
  report: ReportSummary | null;
  canSend: boolean;
  sendAction: (crmClientId: string, month: string) => Promise<ActionResult>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const reportPath = `/admin/crm/clients/${crmClientId}/reports`;
  const query = new URLSearchParams(report?.period ?? {}).toString();

  function sendReport() {
    setMessage(null);
    startTransition(async () => {
      const result = await sendAction(crmClientId, month);
      setMessage(result.error ?? `Report sent to ${result.sent ?? 0} client email${result.sent === 1 ? "" : "s"}.`);
    });
  }

  const metrics = report ? [
    { label: "Leads Generated", value: report.leadsAdded, icon: Users },
    { label: "Interested / Qualified Leads", value: report.interestedLeads, icon: UserCheck },
    { label: "Appointments Booked", value: report.appointmentsBooked, icon: CalendarCheck },
  ] : [];

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Monthly Client Reports</h2>
          <p className="mt-1 text-[12.5px] text-slate-500">Client results for the selected calendar month.</p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <label className="text-[12px] font-semibold text-slate-600">
            Month
            <input type="month" name="report_month" defaultValue={month} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">Apply</button>
        </form>
      </div>

      {!report ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          Link this Growth CRM client to its Lead Generation CRM client to view monthly reports.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {metrics.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-slate-200 p-4">
                <Icon className="h-5 w-5 text-sky-600" />
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Monthly Results / Performance Summary</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{report.summary}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`${reportPath}?${query}`} className="flex items-center gap-2 rounded-full border border-slate-300 px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50">
              <Eye className="h-4 w-4" /> View Report
            </Link>
            <Link href={`${reportPath}/download?${query}&format=pdf`} className="flex items-center gap-2 rounded-full bg-indigo-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700">
              <Download className="h-4 w-4" /> Download PDF
            </Link>
            <button type="button" onClick={sendReport} disabled={isPending || !canSend} className="flex items-center gap-2 rounded-full bg-sky-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" /> {isPending ? "Sending…" : "Send to Client"}
            </button>
          </div>
          {!canSend && <p className="mt-2 text-xs text-amber-700">Create and activate a client portal login before sending the report.</p>}
          {message && <p className={`mt-2 text-xs ${message.startsWith("Report sent") ? "text-emerald-700" : "text-red-600"}`}>{message}</p>}
        </>
      )}
    </section>
  );
}
