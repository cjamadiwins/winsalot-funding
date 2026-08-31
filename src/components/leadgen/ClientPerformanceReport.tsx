import Link from "next/link";
import { CalendarCheck, Download, UserCheck, Users } from "lucide-react";
import type { LeadgenClientReport } from "@/lib/leadgen-client-report";

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function ClientPerformanceReport({
  report,
  pagePath,
  downloadPath,
}: {
  report: LeadgenClientReport;
  pagePath: string;
  downloadPath: string;
}) {
  const query = new URLSearchParams(report.period).toString();
  const cards = [
    { label: "Leads Generated", value: report.leadsAdded, icon: <Users className="h-5 w-5" /> },
    { label: "Interested / Qualified Leads", value: report.interestedLeads, icon: <UserCheck className="h-5 w-5" /> },
    { label: "Appointments Booked", value: report.appointmentsBooked, icon: <CalendarCheck className="h-5 w-5" /> },
  ];

  return (
    <div>
      <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <form action={pagePath} method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-slate-600">
              From
              <input type="date" name="from" defaultValue={report.period.from} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-slate-600">
              To
              <input type="date" name="to" defaultValue={report.period.to} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">Apply Dates</button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Link href={`${downloadPath}?${query}&format=pdf`} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              <Download className="h-4 w-4" /> Download PDF
            </Link>
            <Link href={`${downloadPath}?${query}&format=csv`} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Download CSV
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <section key={card.label} className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4">
            <div className="text-sky-600">{card.icon}</div>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
          </section>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="font-bold text-slate-900">Performance Summary</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{report.summary}</p>
        </section>
        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
          <h2 className="font-bold text-sky-900">Recommended Next Step</h2>
          <p className="mt-3 text-sm leading-6 text-sky-800">{report.nextStep}</p>
          {report.campaign && <p className="mt-4 text-xs font-semibold text-sky-700">Campaign: {report.campaign.name}</p>}
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">Appointments During This Period</h2>
          <p className="mt-1 text-xs text-slate-500">Only appointments belonging to {report.client.name} are included.</p>
        </div>
        {report.appointments.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No appointments during this reporting period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr><th className="p-3">Date</th><th className="p-3">Business</th><th className="p-3">Contact</th><th className="p-3">Meeting Type</th><th className="p-3">Status</th></tr>
              </thead>
              <tbody>
                {report.appointments.map((appointment) => (
                  <tr key={appointment.id} className="border-t border-slate-100">
                    <td className="p-3 text-slate-600">{formatDate(appointment.appointment_date)} · {appointment.appointment_time}</td>
                    <td className="p-3 font-semibold text-slate-900">{appointment.business_name}</td>
                    <td className="p-3 text-slate-600">{appointment.contact_name ?? "—"}</td>
                    <td className="p-3 text-slate-600">{appointment.meeting_type}</td>
                    <td className="p-3"><span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">{appointment.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
