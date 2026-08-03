import type { LeadgenAgentPerformance } from "@/lib/leadgen-performance";
import { leadgenWeekRangeLabel } from "@/lib/leadgen-performance";
import { LEADGEN_APPOINTMENT_STATUS_STYLES } from "@/lib/leadgen-types";

// Renders one agent's Agent Performance Report card - shared by the
// admin's "every agent" view (/leadgen/admin/performance) and an agent's
// own "just me" view (/leadgen/agent/performance), so the two can never
// drift out of sync with each other.
export default function AgentPerformanceCard({ agentName, performance }: { agentName: string; performance: LeadgenAgentPerformance }) {
  const { bookedThisWeek, target, percentage, remainingToTarget, weekStart, weekEnd, dailyBreakdown, previousWeekTotal, monthlyTotal, appointments } =
    performance;
  const barWidth = Math.min(100, percentage);
  const barColor = percentage >= 100 ? "bg-emerald-500" : percentage >= 50 ? "bg-sky-500" : "bg-amber-500";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{agentName}</h2>
        <span className="text-[12px] text-slate-500">Week of {leadgenWeekRangeLabel(weekStart, weekEnd)}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Booked This Week" value={String(bookedThisWeek)} />
        <Stat label="Weekly Target" value={String(target)} />
        <Stat label="Performance" value={`${percentage}%`} />
        <Stat label="Remaining to 100%" value={String(remainingToTarget)} />
        <Stat label="Previous Week" value={String(previousWeekTotal)} />
        <Stat label="Monthly Total" value={String(monthlyTotal)} />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Weekly Progress</span>
          <span>{percentage}%</span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${barWidth}%` }} />
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Daily Breakdown</div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {dailyBreakdown.map((day) => (
            <div key={day.date} className="rounded-lg border border-slate-100 bg-slate-50 px-1.5 py-2 text-center">
              <div className="text-[10px] font-medium text-slate-500">{day.label.split(",")[0]}</div>
              <div className="mt-0.5 text-[15px] font-bold text-slate-900">{day.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Booked Appointments</div>
        {appointments.length === 0 ? (
          <p className="mt-2 text-[13px] text-slate-500">No booked appointments yet.</p>
        ) : (
          <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[520px] text-left text-[12.5px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                  <th className="p-2.5">Business Name</th>
                  <th className="p-2.5">Contact Name</th>
                  <th className="p-2.5">Appointment Date</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Booking Agent</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appt) => (
                  <tr key={appt.id} className="border-b border-slate-100">
                    <td className="p-2.5 font-medium text-slate-900">{appt.business_name}</td>
                    <td className="p-2.5 text-slate-600">{appt.contact_name ?? "—"}</td>
                    <td className="p-2.5 text-slate-600">
                      {appt.appointment_date} {appt.appointment_time}
                    </td>
                    <td className="p-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}>
                        {appt.status}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-600">{agentName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
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
