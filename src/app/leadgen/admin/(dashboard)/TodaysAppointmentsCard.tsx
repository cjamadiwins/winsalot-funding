import Link from "next/link";
import { LEADGEN_APPOINTMENT_STATUS_STYLES, type LeadgenAppointmentStatus } from "@/lib/leadgen-types";

export type TodaysAppointmentRow = {
  id: string;
  appointment_time: string; // "HH:MM" (24h, <input type="time"> value)
  business_name: string;
  contact_name: string | null;
  status: LeadgenAppointmentStatus;
  agentName: string | null;
};

// "14:05" -> "2:05 PM" - appointment_time is stored as a plain 24h
// <input type="time"> value (see AppointmentsListClient.tsx), so this is
// pure string/number formatting, no timezone involved.
function formatAppointmentTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  if (Number.isNaN(hour)) return time;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteStr} ${period}`;
}

// New dashboard widget - today's appointments across every client, at a
// glance, without leaving the Dashboard for the full Appointments page.
// Reuses the exact same leadgen_appointments rows and status styling the
// Appointments page itself uses, so nothing shown here can drift from
// what clicking through to Appointments (or a specific row) shows.
export default function TodaysAppointmentsCard({ appointments }: { appointments: TodaysAppointmentRow[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-cyan-700">Today&apos;s Appointments</h2>
        <Link href="/leadgen/admin/appointments" className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
          View all
        </Link>
      </div>

      {appointments.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-slate-500">No appointments booked for today.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {appointments.map((appt, i) => (
            <Link
              key={appt.id}
              href={`/leadgen/admin/appointments?highlight=${appt.id}`}
              className={`block ${i < appointments.length - 1 ? "border-b border-slate-100 pb-3" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-slate-900">{formatAppointmentTime(appt.appointment_time)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}>
                  {appt.status}
                </span>
              </div>
              <div className="mt-1 text-[13px] font-semibold text-slate-900">{appt.business_name}</div>
              <div className="text-[11.5px] text-slate-500">
                {appt.contact_name ?? "No contact on file"}
                {appt.agentName ? ` · ${appt.agentName}` : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
