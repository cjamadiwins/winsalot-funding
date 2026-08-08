import type { LeadgenAgentPerformance, LeadgenPerformanceTier } from "@/lib/leadgen-performance";
import { LEADGEN_PERFORMANCE_TIER_LABEL, leadgenPerformanceTier, leadgenWeekRangeLabel } from "@/lib/leadgen-performance";
import { LEADGEN_APPOINTMENT_STATUS_STYLES } from "@/lib/leadgen-types";
import PerformanceRing from "@/components/crm-ui/PerformanceRing";

// One color per tier, shared by the percentage badge, the progress bar,
// and the performance status pill so all three always agree for a given
// agent (brief: "Use the same color on the percentage badge, progress
// bar, and performance status").
const TIER_STYLES: Record<LeadgenPerformanceTier, { bar: string; badge: string; text: string }> = {
  green: { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800", text: "text-emerald-700" },
  yellow: { bar: "bg-amber-500", badge: "bg-amber-100 text-amber-800", text: "text-amber-700" },
  red: { bar: "bg-rose-500", badge: "bg-rose-100 text-rose-800", text: "text-rose-700" },
};

// Renders one agent's Agent Performance Report card - shared by the
// admin's "every agent" view (/leadgen/admin/performance) and an agent's
// own "just me" view (/leadgen/agent/performance), so the two can never
// drift out of sync with each other.
export default function AgentPerformanceCard({ agentName, performance }: { agentName: string; performance: LeadgenAgentPerformance }) {
  const { bookedThisWeek, target, percentage, remainingToTarget, weekStart, weekEnd, dailyBreakdown, previousWeekTotal, monthlyTotal, appointments } =
    performance;
  const barWidth = Math.min(100, percentage);
  const tier = leadgenPerformanceTier(percentage);
  const tierStyle = TIER_STYLES[tier];

  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{agentName}</h2>
        <span className="text-[12px] text-slate-500">Week of {leadgenWeekRangeLabel(weekStart, weekEnd)}</span>
      </div>

      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <PerformanceRing percentage={percentage} tier={tier} label="of weekly target" />
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Booked This Week" value={String(bookedThisWeek)} />
          <Stat label="Weekly Target" value={String(target)} />
          <Stat label="Performance" value={`${percentage}%`} badgeClassName={tierStyle.badge} />
          <Stat label="Remaining to 100%" value={String(remainingToTarget)} />
          <Stat label="Previous Week" value={String(previousWeekTotal)} />
          <Stat label="Monthly Total" value={String(monthlyTotal)} />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Weekly Progress</span>
          <span className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold normal-case tracking-normal ${tierStyle.badge}`}>
              {LEADGEN_PERFORMANCE_TIER_LABEL[tier]}
            </span>
            <span className={tierStyle.text}>{percentage}%</span>
          </span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${tierStyle.bar} transition-all`} style={{ width: `${barWidth}%` }} />
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
              <thead className="sticky top-0 bg-[var(--crm-surface)]">
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
