"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LEADGEN_APPOINTMENT_INCENTIVE_PENDING_LABEL,
  LEADGEN_APPOINTMENT_INCENTIVE_PENDING_STYLE,
  LEADGEN_APPOINTMENT_INCENTIVE_STATUS_STYLES,
  LEADGEN_APPOINTMENT_STATUS_STYLES,
  LEADGEN_BUSINESS_APPOINTMENT_REMINDER_STATUS_STYLES,
  type LeadgenAppointmentRow,
  type LeadgenAppointmentReminderStatusEntry,
  type LeadgenBusinessAppointmentReminderStatusEntry,
  type LeadgenEmailRow,
} from "@/lib/leadgen-types";
import AppointmentEmailActions from "@/components/leadgen/AppointmentEmailActions";
import { resendAppointmentNotificationAction, sendAppointmentReminderAction } from "./actions";

type LeadContact = { email: string | null; contact_name: string | null };

export default function AgentAppointmentsListClient({
  appointments,
  clients,
  leadContactByLeadId,
  latestEmailByAppointmentId,
  automaticReminderStatusByAppointmentId,
  businessReminderStatusByAppointmentId,
  initialClientFilter,
  viewingClientName,
}: {
  appointments: LeadgenAppointmentRow[];
  // Every client's id/name (agents can already read the full roster - see
  // leads/new/page.tsx) - only used here to label appointments and
  // populate the client filter; the appointments themselves are already
  // RLS-scoped to this agent.
  clients?: { id: string; name: string }[];
  // The lead's currently saved email/contact name, keyed by lead_id - the
  // source of truth the confirmation window shows and the send action
  // re-verifies (brief: "must always send to the lead's latest saved
  // email address").
  leadContactByLeadId: Record<string, LeadContact>;
  latestEmailByAppointmentId: Record<string, LeadgenEmailRow>;
  automaticReminderStatusByAppointmentId: Record<string, LeadgenAppointmentReminderStatusEntry>;
  businessReminderStatusByAppointmentId: Record<string, LeadgenBusinessAppointmentReminderStatusEntry>;
  // Set by the agent dashboard's "My Results by Client" section via
  // ?client=<id> - pre-selects the Client filter below.
  initialClientFilter?: string;
  // Display name for the "Viewing X" banner when scoped to one client.
  viewingClientName?: string | null;
}) {
  const clientList = clients ?? [];
  const validInitialClient = initialClientFilter && clientList.some((c) => c.id === initialClientFilter) ? initialClientFilter : "all";
  const [clientFilter, setClientFilter] = useState(validInitialClient);
  const clientNameById = new Map(clientList.map((c) => [c.id, c.name] as const));
  const showClientFilter = clientList.length > 0 && new Set(appointments.map((a) => a.client_id)).size > 1;

  const visibleAppointments = useMemo(
    () => (clientFilter === "all" ? appointments : appointments.filter((a) => a.client_id === clientFilter)),
    [appointments, clientFilter]
  );

  return (
    <div>
      {viewingClientName && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-[13.5px] font-semibold text-sky-800">Viewing {viewingClientName}</p>
          <Link href="/leadgen/agent" className="text-[13px] font-semibold text-sky-700 hover:text-sky-900">
            ← Back to All Clients
          </Link>
        </div>
      )}

      {showClientFilter && (
        <div className="mt-4 flex flex-wrap gap-3">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="w-auto rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900"
          >
            <option value="all">All clients</option>
            {clientList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {visibleAppointments.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">
            {appointments.length === 0 ? "No appointments yet." : "No appointments match this client."}
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="p-3">Business</th>
                {showClientFilter && <th className="p-3">Client</th>}
                <th className="p-3">Date/Time</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Incentive</th>
                <th className="p-3">Business Reminder</th>
                <th className="p-3">Lead</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleAppointments.map((appt) => {
              const leadContact = appt.lead_id ? leadContactByLeadId[appt.lead_id] : undefined;
              return (
                <tr key={appt.id} className="border-b border-slate-100">
                  <td className="p-3 font-semibold text-slate-900">
                    {appt.lead_id ? (
                      <Link href={`/leadgen/agent/leads/${appt.lead_id}`} className="text-sky-600 hover:text-sky-700 hover:underline">
                        {appt.business_name}
                      </Link>
                    ) : (
                      appt.business_name
                    )}
                  </td>
                  {showClientFilter && <td className="p-3 text-slate-600">{clientNameById.get(appt.client_id) ?? "—"}</td>}
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
                    {businessReminderStatusByAppointmentId[appt.id] && (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          LEADGEN_BUSINESS_APPOINTMENT_REMINDER_STATUS_STYLES[businessReminderStatusByAppointmentId[appt.id].status]
                        }`}
                        title={businessReminderStatusByAppointmentId[appt.id].errorDetail ?? undefined}
                      >
                        {businessReminderStatusByAppointmentId[appt.id].status}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {appt.lead_id && (
                      <Link href={`/leadgen/agent/leads/${appt.lead_id}`} className="font-semibold text-sky-600 hover:text-sky-700">
                        View Lead
                      </Link>
                    )}
                  </td>
                  <td className="p-3">
                    {(appt.status === "Booked" || appt.status === "Confirmed") && (
                      <AppointmentEmailActions
                        appointmentId={appt.id}
                        businessName={appt.business_name}
                        contactName={leadContact?.contact_name ?? appt.contact_name}
                        email={leadContact?.email ?? appt.email}
                        appointmentDate={appt.appointment_date}
                        appointmentTime={appt.appointment_time}
                        timezone={appt.timezone}
                        latestEmail={latestEmailByAppointmentId[appt.id] ?? null}
                        automaticReminderStatus24h={automaticReminderStatusByAppointmentId[appt.id]?.status24h}
                        automaticReminderError24h={automaticReminderStatusByAppointmentId[appt.id]?.errorDetail24h}
                        automaticReminderStatus1h={automaticReminderStatusByAppointmentId[appt.id]?.status1h}
                        automaticReminderError1h={automaticReminderStatusByAppointmentId[appt.id]?.errorDetail1h}
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
    </div>
  );
}
