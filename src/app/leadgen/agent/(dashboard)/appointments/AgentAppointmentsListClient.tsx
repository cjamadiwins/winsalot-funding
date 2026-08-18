"use client";

import Link from "next/link";
import {
  LEADGEN_APPOINTMENT_INCENTIVE_PENDING_LABEL,
  LEADGEN_APPOINTMENT_INCENTIVE_PENDING_STYLE,
  LEADGEN_APPOINTMENT_INCENTIVE_STATUS_STYLES,
  LEADGEN_APPOINTMENT_STATUS_STYLES,
  type LeadgenAppointmentRow,
  type LeadgenEmailRow,
} from "@/lib/leadgen-types";
import AppointmentEmailActions from "@/components/leadgen/AppointmentEmailActions";
import { resendAppointmentNotificationAction, sendAppointmentReminderAction } from "./actions";

type LeadContact = { email: string | null; contact_name: string | null };

export default function AgentAppointmentsListClient({
  appointments,
  leadContactByLeadId,
  latestEmailByAppointmentId,
}: {
  appointments: LeadgenAppointmentRow[];
  // The lead's currently saved email/contact name, keyed by lead_id - the
  // source of truth the confirmation window shows and the send action
  // re-verifies (brief: "must always send to the lead's latest saved
  // email address").
  leadContactByLeadId: Record<string, LeadContact>;
  latestEmailByAppointmentId: Record<string, LeadgenEmailRow>;
}) {
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
      {appointments.length === 0 ? (
        <p className="p-6 text-center text-[13.5px] text-slate-500">No appointments yet.</p>
      ) : (
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
              <th className="p-3">Business</th>
              <th className="p-3">Date/Time</th>
              <th className="p-3">Type</th>
              <th className="p-3">Status</th>
              <th className="p-3">Incentive</th>
              <th className="p-3">Lead</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appt) => {
              const leadContact = appt.lead_id ? leadContactByLeadId[appt.lead_id] : undefined;
              return (
                <tr key={appt.id} className="border-b border-slate-100">
                  <td className="p-3 font-semibold text-slate-900">{appt.business_name}</td>
                  <td className="p-3 text-slate-600">
                    {appt.appointment_date} {appt.appointment_time} ({appt.timezone})
                  </td>
                  <td className="p-3 text-slate-600">{appt.meeting_type}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}>{appt.status}</span>
                  </td>
                  <td className="p-3">
                    <span
                      title={appt.incentive_status_reason ?? undefined}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        appt.incentive_status ? LEADGEN_APPOINTMENT_INCENTIVE_STATUS_STYLES[appt.incentive_status] : LEADGEN_APPOINTMENT_INCENTIVE_PENDING_STYLE
                      }`}
                    >
                      {appt.incentive_status ?? LEADGEN_APPOINTMENT_INCENTIVE_PENDING_LABEL}
                    </span>
                  </td>
                  <td className="p-3">
                    {appt.lead_id && (
                      <Link href={`/leadgen/agent/leads/${appt.lead_id}`} className="font-semibold text-sky-600 hover:text-sky-700">
                        View Lead
                      </Link>
                    )}
                  </td>
                  <td className="p-3">
                    {appt.status === "Booked" && (
                      <AppointmentEmailActions
                        appointmentId={appt.id}
                        businessName={appt.business_name}
                        contactName={leadContact?.contact_name ?? appt.contact_name}
                        email={leadContact?.email ?? appt.email}
                        appointmentDate={appt.appointment_date}
                        appointmentTime={appt.appointment_time}
                        timezone={appt.timezone}
                        latestEmail={latestEmailByAppointmentId[appt.id] ?? null}
                        onResend={resendAppointmentNotificationAction}
                        onReminder={sendAppointmentReminderAction}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
