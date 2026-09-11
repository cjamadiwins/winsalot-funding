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
  type LeadgenSmsReminderStatusEntry,
  type LeadgenEmailRow,
} from "@/lib/leadgen-types";
import AppointmentEmailActions from "@/components/leadgen/AppointmentEmailActions";
import { resendAppointmentNotificationAction, sendAppointmentReminderAction } from "./actions";

type LeadContact = { email: string | null; contact_name: string | null };

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export default function AgentAppointmentsListClient({
  appointments,
  clients,
  leadContactByLeadId,
  latestEmailByAppointmentId,
  automaticReminderStatusByAppointmentId,
  businessReminderStatusByAppointmentId,
  smsReminderStatusByAppointmentId,
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
  smsReminderStatusByAppointmentId: Record<string, LeadgenSmsReminderStatusEntry>;
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

  // Pagination over `visibleAppointments` - a pure display slice, no
  // change to which appointments match the Client filter. Same approach
  // as the admin Appointments table.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // A filter change can shrink the result set out from under the page
  // the agent was on - jump back to page 1 whenever the filter itself
  // changes. Adjusting state during render (React's documented pattern
  // for "derived state that resets on a dependency change") rather than
  // in a useEffect, which would cause an extra render pass.
  const filterKey = clientFilter;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(visibleAppointments.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = visibleAppointments.slice(pageStart, pageStart + pageSize);
  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, i) => i + 1);
    let start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [totalPages, currentPage]);

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

      <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {visibleAppointments.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">
            {appointments.length === 0 ? "No appointments yet." : "No appointments match this client."}
          </p>
        ) : (
          <>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase text-slate-500">
                <th className="px-3 py-2">Business</th>
                {showClientFilter && <th className="px-3 py-2">Client</th>}
                <th className="px-3 py-2">Date/Time</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Incentive</th>
                <th className="px-3 py-2">Business Reminder</th>
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((appt) => {
              const leadContact = appt.lead_id ? leadContactByLeadId[appt.lead_id] : undefined;
              return (
                <tr key={appt.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-semibold text-slate-900">
                    {appt.lead_id ? (
                      <Link href={`/leadgen/agent/leads/${appt.lead_id}`} className="text-sky-600 hover:text-sky-700 hover:underline">
                        {appt.business_name}
                      </Link>
                    ) : (
                      appt.business_name
                    )}
                  </td>
                  {showClientFilter && <td className="px-3 py-2 text-slate-600">{clientNameById.get(appt.client_id) ?? "—"}</td>}
                  <td className="px-3 py-2 text-slate-600">
                    {appt.appointment_date} {appt.appointment_time} ({appt.timezone})
                  </td>
                  <td className="px-3 py-2 text-slate-600">{appt.meeting_type}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}>{appt.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      title={appt.incentive_status_reason ?? undefined}
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                        appt.incentive_status ? LEADGEN_APPOINTMENT_INCENTIVE_STATUS_STYLES[appt.incentive_status] : LEADGEN_APPOINTMENT_INCENTIVE_PENDING_STYLE
                      }`}
                    >
                      {appt.incentive_status ?? LEADGEN_APPOINTMENT_INCENTIVE_PENDING_LABEL}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {businessReminderStatusByAppointmentId[appt.id] && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                          LEADGEN_BUSINESS_APPOINTMENT_REMINDER_STATUS_STYLES[businessReminderStatusByAppointmentId[appt.id].status]
                        }`}
                        title={businessReminderStatusByAppointmentId[appt.id].errorDetail ?? undefined}
                      >
                        {businessReminderStatusByAppointmentId[appt.id].status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {appt.lead_id && (
                      <Link href={`/leadgen/agent/leads/${appt.lead_id}`} className="font-semibold text-sky-600 hover:text-sky-700">
                        View Lead
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2">
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
                        smsReminderStatus24h={smsReminderStatusByAppointmentId[appt.id]?.status24h}
                        smsReminderError24h={smsReminderStatusByAppointmentId[appt.id]?.errorDetail24h}
                        smsReminderStatus1h={smsReminderStatusByAppointmentId[appt.id]?.status1h}
                        smsReminderError1h={smsReminderStatusByAppointmentId[appt.id]?.errorDetail1h}
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-2.5 text-[12.5px] text-slate-500">
          <span>
            {pageStart + 1}–{Math.min(pageStart + pageSize, visibleAppointments.length)} of {visibleAppointments.length} appointment
            {visibleAppointments.length === 1 ? "" : "s"}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-slate-300 px-2 py-1 text-[12.5px]"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
                className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ‹
              </button>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    n === currentPage ? "bg-sky-600 text-white" : "border border-slate-300 text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
                className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </div>
        </>
      )}
      </div>
    </div>
  );
}
