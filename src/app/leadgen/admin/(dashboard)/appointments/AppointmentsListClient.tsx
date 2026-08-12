"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import {
  LEADGEN_APPOINTMENT_INCENTIVE_PENDING_LABEL,
  LEADGEN_APPOINTMENT_INCENTIVE_PENDING_STYLE,
  LEADGEN_APPOINTMENT_INCENTIVE_STATUSES,
  LEADGEN_APPOINTMENT_INCENTIVE_STATUS_STYLES,
  LEADGEN_APPOINTMENT_STATUSES,
  LEADGEN_APPOINTMENT_STATUS_STYLES,
  LEADGEN_MEETING_TYPES,
  type LeadgenAppointmentRow,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenLeadRow,
  type LeadgenUserRow,
} from "@/lib/leadgen-types";
import { bookAppointmentAction, updateAppointmentAction } from "./actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

type LeadOption = Pick<LeadgenLeadRow, "id" | "business_name" | "client_id" | "campaign_id" | "contact_name" | "phone" | "email">;

export default function AppointmentsListClient({
  appointments,
  clients,
  campaigns,
  agents,
  leads,
  highlightId,
}: {
  appointments: LeadgenAppointmentRow[];
  clients: LeadgenClientRow[];
  campaigns: LeadgenCampaignRow[];
  agents: LeadgenUserRow[];
  leads: LeadOption[];
  highlightId?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(highlightId ?? null);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const highlightRef = useRef<HTMLTableRowElement>(null);

  // "A direct link to open the appointment in the CRM" (brief, admin
  // booking-notification email) - the admin notification links here with
  // ?highlight=<id>, which auto-expands that row's Manage panel and
  // scrolls it into view on load.
  useEffect(() => {
    if (highlightId) highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const selectedLead = selectedLeadId ? leadById.get(selectedLeadId) : null;

  function runAction(fn: () => Promise<{ error?: string } | void>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
      else onSuccess?.();
    });
  }

  return (
    <div>
      <div className="mt-6">
        <button type="button" onClick={() => setShowForm((v) => !v)} className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700">
          {showForm ? "Cancel" : "+ Book Appointment"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form
          action={(formData) => runAction(() => bookAppointmentAction(formData), () => { setShowForm(false); setSelectedLeadId(""); })}
          className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[13px] font-semibold text-slate-600">From an existing lead (optional)</span>
            <select
              name="lead_id"
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              className={inputClass}
            >
              <option value="">Not tied to a lead</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.business_name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Client</span>
            <select name="client_id" required defaultValue={selectedLead?.client_id ?? ""} className={inputClass} key={selectedLeadId}>
              <option value="" disabled>
                Select a client…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Campaign (optional)</span>
            <select name="campaign_id" defaultValue={selectedLead?.campaign_id ?? ""} className={inputClass} key={`camp-${selectedLeadId}`}>
              <option value="">No campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Business Name</span>
            <input name="business_name" required defaultValue={selectedLead?.business_name ?? ""} className={inputClass} key={`biz-${selectedLeadId}`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Contact Name</span>
            <input name="contact_name" defaultValue={selectedLead?.contact_name ?? ""} className={inputClass} key={`contact-${selectedLeadId}`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Phone</span>
            <input name="phone" defaultValue={selectedLead?.phone ?? ""} className={inputClass} key={`phone-${selectedLeadId}`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Email</span>
            <input name="email" type="email" defaultValue={selectedLead?.email ?? ""} className={inputClass} key={`email-${selectedLeadId}`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Appointment Date</span>
            <input name="appointment_date" type="date" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Appointment Time</span>
            <input name="appointment_time" type="time" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Time Zone</span>
            <input name="timezone" defaultValue="America/Toronto" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Meeting Type</span>
            <select name="meeting_type" defaultValue="Phone Call" className={inputClass}>
              {LEADGEN_MEETING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Meeting Link (optional)</span>
            <input name="meeting_link" type="url" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Assigned Specialist</span>
            <select name="assigned_specialist_id" className={inputClass} defaultValue="">
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[13px] font-semibold text-slate-600">Internal Appointment Notes</span>
            <textarea name="appointment_notes" className={`${inputClass} min-h-[60px] resize-y`} />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[13px] font-semibold text-slate-600">Notes visible to the client (optional, included in the notification email)</span>
            <textarea name="client_visible_notes" className={`${inputClass} min-h-[50px] resize-y`} />
          </label>
          <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2">
            <input type="hidden" name="notify_client" value="false" />
            <input
              type="checkbox"
              onChange={(e) => {
                const hidden = e.currentTarget.previousElementSibling as HTMLInputElement;
                hidden.value = e.currentTarget.checked ? "true" : "false";
              }}
              defaultChecked
            />
            Email the client a notification now
          </label>
          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700 sm:col-span-2 sm:w-fit">
            {isPending ? "Booking…" : "Book Appointment"}
          </button>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {appointments.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">No appointments booked yet.</p>
        ) : (
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="p-3">Business</th>
                <th className="p-3">Client</th>
                <th className="p-3">Date/Time</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Incentive</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appt) => (
                <Fragment key={appt.id}>
                  <tr
                    ref={appt.id === highlightId ? highlightRef : undefined}
                    className={`border-b border-slate-100 ${appt.id === highlightId ? "bg-amber-50" : ""}`}
                  >
                    <td className="p-3 font-semibold text-slate-900">{appt.business_name}</td>
                    <td className="p-3 text-slate-600">{clientById.get(appt.client_id)?.name ?? "—"}</td>
                    <td className="p-3 text-slate-600">
                      {appt.appointment_date} {appt.appointment_time} ({appt.timezone})
                    </td>
                    <td className="p-3 text-slate-600">{appt.meeting_type}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}>
                        {appt.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          appt.incentive_status ? LEADGEN_APPOINTMENT_INCENTIVE_STATUS_STYLES[appt.incentive_status] : LEADGEN_APPOINTMENT_INCENTIVE_PENDING_STYLE
                        }`}
                      >
                        {appt.incentive_status ?? LEADGEN_APPOINTMENT_INCENTIVE_PENDING_LABEL}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => setEditingId(editingId === appt.id ? null : appt.id)}
                        className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700"
                      >
                        {editingId === appt.id ? "Close" : "Manage"}
                      </button>
                    </td>
                  </tr>
                  {editingId === appt.id && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50 p-4">
                        <form
                          action={(formData) => runAction(() => updateAppointmentAction(appt.id, formData))}
                          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                        >
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Status</span>
                            <select name="status" defaultValue={appt.status} className={inputClass}>
                              {LEADGEN_APPOINTMENT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Incentive Status</span>
                            <select name="incentive_status" defaultValue={appt.incentive_status ?? ""} className={inputClass}>
                              <option value="">{LEADGEN_APPOINTMENT_INCENTIVE_PENDING_LABEL}</option>
                              {LEADGEN_APPOINTMENT_INCENTIVE_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Meeting Link</span>
                            <input name="meeting_link" type="url" defaultValue={appt.meeting_link ?? ""} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Assigned Specialist</span>
                            <select name="assigned_specialist_id" defaultValue={appt.assigned_specialist_id ?? ""} className={inputClass}>
                              <option value="">Unassigned</option>
                              {agents.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.full_name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Appointment Date</span>
                            <input name="appointment_date" type="date" defaultValue={appt.appointment_date} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Appointment Time</span>
                            <input name="appointment_time" type="time" defaultValue={appt.appointment_time} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1.5 sm:col-span-2">
                            <span className="text-[12.5px] font-semibold text-slate-600">Appointment Notes</span>
                            <textarea name="appointment_notes" defaultValue={appt.appointment_notes ?? ""} className={`${inputClass} min-h-[50px] resize-y`} />
                          </label>
                          <label className="flex flex-col gap-1.5 sm:col-span-2">
                            <span className="text-[12.5px] font-semibold text-slate-600">Client Feedback</span>
                            <textarea name="client_feedback" defaultValue={appt.client_feedback ?? ""} className={`${inputClass} min-h-[50px] resize-y`} />
                          </label>
                          <label className="flex items-center gap-2 text-[13px]">
                            <input type="hidden" name="confirmation_sent" value={appt.confirmation_sent ? "true" : "false"} />
                            <input
                              type="checkbox"
                              defaultChecked={appt.confirmation_sent}
                              onChange={(e) => {
                                const hidden = e.currentTarget.previousElementSibling as HTMLInputElement;
                                hidden.value = e.currentTarget.checked ? "true" : "false";
                              }}
                            />
                            Confirmation sent
                          </label>
                          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-sky-700 sm:col-span-2 sm:w-fit">
                            Save
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
