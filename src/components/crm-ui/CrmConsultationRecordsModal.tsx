"use client";

import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { winsalotServiceTypeLabel } from "@/lib/winsalot-consultation-types";
import type { ConsultationCardRecord } from "@/lib/winsalot-consultation-data";
import CrmCardModal from "./CrmCardModal";
import type { KpiTone } from "./KpiCard";
import type { ReactNode } from "react";

// Consultations Booked drill-down: reads winsalot_appointments directly
// (status = 'booked' only - see winsalot-consultation-data.ts) instead of
// crm_opportunities.stage, so this always matches a genuine booked
// appointment rather than an opportunity that merely sits at the
// "Consultation Booked" stage. "Manage Appointment" deep-links into the
// existing Appointments page (full reschedule/cancel/edit already lives
// there) instead of duplicating that logic here.
export default function CrmConsultationRecordsModal({
  label,
  tone,
  icon,
  records,
  opportunityHrefBase,
  appointmentsHref,
  emptyMessage = "No consultations currently booked.",
}: {
  label: string;
  tone: KpiTone;
  icon: ReactNode;
  records: ConsultationCardRecord[];
  opportunityHrefBase: string;
  appointmentsHref: string;
  emptyMessage?: string;
}) {
  return (
    <CrmCardModal
      label={label}
      value={records.length}
      tone={tone}
      icon={icon}
      title={label}
      countLabel={`${records.length} booked consultation${records.length === 1 ? "" : "s"}`}
    >
      {records.length === 0 ? (
        <div className="py-12 text-center">
          <CircleCheck className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-slate-700">{emptyMessage}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {records.map((appt) => {
            const start = new Date(appt.appointment_start_at);
            return (
              <article key={appt.id} className="min-w-0 break-words py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{appt.business_name}</span>
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-800">Booked</span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                      {appt.contact_name} · {appt.phone} · {appt.email}
                    </p>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                      Agent: {appt.assignedAgentName || "Unassigned"} · {winsalotServiceTypeLabel(appt.service_type)}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-lg bg-emerald-50 px-3 py-2 text-right">
                    <div className="text-[15px] font-bold text-emerald-800">
                      {start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    <div className="text-[12.5px] font-semibold text-emerald-700">
                      {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} ({appt.business_timezone})
                    </div>
                  </div>
                </div>

                {appt.notes && (
                  <p className="mt-2 text-[12.5px] text-slate-600">
                    <span className="font-semibold text-slate-700">Notes:</span> {appt.notes}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {appt.opportunity_id && (
                    <Link
                      href={`${opportunityHrefBase}/${appt.opportunity_id}`}
                      className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-[11.5px] font-semibold text-indigo-700"
                    >
                      View Prospect
                    </Link>
                  )}
                  <Link
                    href={`${appointmentsHref}#appointment-${appt.id}`}
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
