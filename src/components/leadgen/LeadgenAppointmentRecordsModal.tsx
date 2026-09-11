"use client";

import Link from "next/link";
import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { AppointmentCardRecord } from "@/lib/leadgen-dashboard-records";
import CrmCardModal from "@/components/crm-ui/CrmCardModal";
import type { KpiTone, KpiTrend } from "@/components/crm-ui/KpiCard";

// Lead Gen equivalent of the Growth CRM's CrmConsultationRecordsModal -
// same shell, same "appointment date/time prominent" layout, same two
// actions (View Prospect / Manage Appointment). "Manage Appointment"
// deep-links into the existing Appointments page's own `?highlight=<id>`
// support (already built - see AppointmentsListClient.tsx) instead of
// duplicating the reschedule/cancel/edit logic that already lives there.
export default function LeadgenAppointmentRecordsModal({
  label,
  tone,
  icon,
  trend,
  records,
  leadHrefBase,
  appointmentsHref,
  emptyMessage = "No appointments currently booked.",
}: {
  label: string;
  tone: KpiTone;
  icon: ReactNode;
  trend?: KpiTrend;
  records: AppointmentCardRecord[];
  leadHrefBase: string;
  appointmentsHref: string;
  emptyMessage?: string;
}) {
  return (
    <CrmCardModal
      label={label}
      value={records.length}
      tone={tone}
      icon={icon}
      trend={trend}
      title={label}
      countLabel={`${records.length} booked appointment${records.length === 1 ? "" : "s"}`}
    >
      {records.length === 0 ? (
        <div className="py-12 text-center">
          <CircleCheck className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-slate-700">{emptyMessage}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {records.map((appt) => {
            const start = new Date(appt.startAtMs);
            return (
              <article key={appt.id} className="min-w-0 break-words py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{appt.business_name}</span>
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-800">Booked</span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                      {appt.contact_name ?? "—"} · {appt.phone ?? "—"} · {appt.email ?? "—"}
                    </p>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                      Agent: {appt.agentName} · {appt.meeting_type}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-lg bg-emerald-50 px-3 py-2 text-right">
                    <div className="text-[15px] font-bold text-emerald-800">
                      {start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    <div className="text-[12.5px] font-semibold text-emerald-700">
                      {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} ({appt.timezone})
                    </div>
                  </div>
                </div>

                {appt.appointment_notes && (
                  <p className="mt-2 text-[12.5px] text-slate-600">
                    <span className="font-semibold text-slate-700">Notes:</span> {appt.appointment_notes}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {appt.lead_id && (
                    <Link
                      href={`${leadHrefBase}/${appt.lead_id}`}
                      className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-[11.5px] font-semibold text-indigo-700"
                    >
                      View Prospect
                    </Link>
                  )}
                  <Link
                    href={`${appointmentsHref}?highlight=${appt.id}`}
                    className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-[11.5px] font-semibold text-sky-700"
                  >
                    Manage Appointment
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </CrmCardModal>
  );
}
