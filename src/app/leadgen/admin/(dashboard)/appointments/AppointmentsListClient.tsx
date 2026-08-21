"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import {
  LEADGEN_APPOINTMENT_INCENTIVE_PENDING_LABEL,
  LEADGEN_APPOINTMENT_INCENTIVE_PENDING_STYLE,
  LEADGEN_APPOINTMENT_INCENTIVE_STATUSES,
  LEADGEN_APPOINTMENT_INCENTIVE_STATUS_STYLES,
  LEADGEN_APPOINTMENT_STATUSES,
  LEADGEN_APPOINTMENT_STATUS_STYLES,
  LEADGEN_BUSINESS_APPOINTMENT_REMINDER_STATUS_STYLES,
  LEADGEN_MEETING_TYPES,
  type LeadgenAppointmentReminderSettingsRow,
  type LeadgenBusinessAppointmentReminderDisplayStatus,
  type LeadgenAppointmentRow,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenEmailRow,
  type LeadgenLeadRow,
  type LeadgenUserRow,
} from "@/lib/leadgen-types";
import AppointmentEmailActions from "@/components/leadgen/AppointmentEmailActions";
import AppointmentEmailConfirmModal from "@/components/leadgen/AppointmentEmailConfirmModal";
import {
  bookAppointmentAction,
  cancelOrReplaceAppointmentAction,
  resendAppointmentNotificationAction,
  sendAppointmentReminderAction,
  updateAppointmentAction,
  updateLeadgenAppointmentReminderSettingsAction,
} from "./actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

type LeadOption = Pick<LeadgenLeadRow, "id" | "business_name" | "client_id" | "campaign_id" | "contact_name" | "phone" | "email">;

export default function AppointmentsListClient({
  appointments,
  clients,
  campaigns,
  agents,
  leads,
  latestEmailByAppointmentId,
  automaticReminderStatusByAppointmentId,
  businessReminderStatusByAppointmentId,
  reminderSettings,
  highlightId,
}: {
  appointments: LeadgenAppointmentRow[];
  clients: LeadgenClientRow[];
  campaigns: LeadgenCampaignRow[];
  agents: LeadgenUserRow[];
  leads: LeadOption[];
  // Most recent leadgen_emails row per appointment id (if any) - for the
  // "Resend Appointment Notification" / "Send Appointment Reminder"
  // status badge.
  latestEmailByAppointmentId?: Record<string, LeadgenEmailRow>;
  // "Automatic reminder: Scheduled/Sent/Delivered/.../Not scheduled"
  // label per appointment id (brief EMAIL TRACKING).
  automaticReminderStatusByAppointmentId?: Record<string, string>;
  // "Business Reminder: Scheduled/Sent/Failed/Cancelled" - the
  // client-facing (e.g. Brent's Essentials) 24-hour + 1-hour reminder
  // status, distinct from the prospect-facing one above.
  businessReminderStatusByAppointmentId?: Record<string, LeadgenBusinessAppointmentReminderDisplayStatus>;
  // Current leadgen_appointment_reminder_settings row (brief "ADMIN
  // SETTINGS").
  reminderSettings: LeadgenAppointmentReminderSettingsRow;
  highlightId?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showReminderSettings, setShowReminderSettings] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(highlightId ?? null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  // Result of the last "Save" on the Manage edit panel, shown inline in
  // that appointment's panel (distinct from the page-level `error` above,
  // which the resend/reminder confirm modals below already surface their
  // own way) - so "was the resend I just asked for actually sent?" is
  // answered right where the admin is looking.
  const [manageResult, setManageResult] = useState<{ id: string; text: string } | null>(null);
  // Pending "Save & Resend" submission on the Manage edit panel, waiting
  // on the confirmation window below (brief: "Ask for confirmation before
  // resending the email") - holds the already-built FormData so
  // confirming sends exactly what the admin just filled in, with nothing
  // re-read or re-typed.
  const [pendingResend, setPendingResend] = useState<{
    appointmentId: string;
    formData: FormData;
    businessName: string;
    contactName: string | null;
    email: string | null;
    appointmentDate: string;
    appointmentTime: string;
    timezone: string;
  } | null>(null);
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

  function runAction(fn: () => Promise<{ error?: string; message?: string } | void>, onSuccess?: (message?: string) => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
      else onSuccess?.(result && "message" in result ? result.message : undefined);
    });
  }

  function handleManageSubmit(appointment: LeadgenAppointmentRow, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setManageResult(null);
    const formData = new FormData(e.currentTarget);
    if (formData.get("send_updated_confirmation") !== "true") {
      runAction(
        () => updateAppointmentAction(appointment.id, formData),
        (message) => setManageResult({ id: appointment.id, text: message ?? "Appointment saved." })
      );
      return;
    }
    // Resend requested - hold off on saving/sending until the admin
    // confirms in the window below, reusing the same confirmation
    // component the standalone "Resend Appointment Notification" button
    // uses so the experience (and success/failure messaging) matches.
    const lead = leadById.get(appointment.lead_id ?? "");
    setPendingResend({
      appointmentId: appointment.id,
      formData,
      businessName: String(formData.get("business_name") ?? ""),
      contactName: String(formData.get("contact_name") ?? "") || null,
      // The email that will actually receive it: the lead's own saved
      // email takes priority server-side (resolveAppointmentEmailRecipient)
      // over whatever is typed into this appointment's Email field, so the
      // preview must match that same resolution or it would promise a
      // recipient the send won't actually use.
      email: lead?.email ?? (String(formData.get("email") ?? "") || null),
      appointmentDate: String(formData.get("appointment_date") ?? ""),
      appointmentTime: String(formData.get("appointment_time") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
    });
  }

  return (
    <div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => setShowForm((v) => !v)} className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700">
          {showForm ? "Cancel" : "+ Book Appointment"}
        </button>
        <button
          type="button"
          onClick={() => setShowReminderSettings((v) => !v)}
          className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-400"
        >
          {showReminderSettings ? "Close" : "Appointment Reminder Settings"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {showReminderSettings && (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-base font-bold text-slate-900">Appointment Reminder Settings</h2>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Controls the automatic 24-hour reminder cron job. Off by default until you&apos;ve verified it against real
            appointments.
          </p>
          <form
            action={(formData) => runAction(() => updateLeadgenAppointmentReminderSettingsAction(formData), () => setShowReminderSettings(false))}
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2">
              <input type="hidden" name="automatic_reminders_enabled" value={reminderSettings.automatic_reminders_enabled ? "true" : "false"} />
              <input
                type="checkbox"
                defaultChecked={reminderSettings.automatic_reminders_enabled}
                onChange={(e) => {
                  const hidden = e.currentTarget.previousElementSibling as HTMLInputElement;
                  hidden.value = e.currentTarget.checked ? "true" : "false";
                }}
              />
              Automatic 24-hour reminders: {reminderSettings.automatic_reminders_enabled ? "On" : "Off"}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-slate-600">Reminder Timing (hours before appointment)</span>
              <input name="reminder_hours_before" type="number" min={1} step={1} defaultValue={reminderSettings.reminder_hours_before} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-slate-600">Sender Name</span>
              <input name="sender_name" type="text" defaultValue={reminderSettings.sender_name} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12.5px] font-semibold text-slate-600">Reply-To Address (must already be an approved sending address)</span>
              <input name="reply_to_email" type="email" defaultValue={reminderSettings.reply_to_email} required className={inputClass} />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700">
                Save Reminder Settings
              </button>
            </div>
          </form>
        </section>
      )}

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
                <th className="p-3">Business Reminder</th>
                <th className="sticky right-0 z-10 bg-[var(--crm-surface)] p-3 shadow-[-6px_0_6px_-4px_rgba(0,0,0,0.12)]">Actions</th>
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
                      <span
                        title={appt.status_reason ?? undefined}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[appt.status]}`}
                      >
                        {appt.status}
                      </span>
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
                      {businessReminderStatusByAppointmentId?.[appt.id] && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            LEADGEN_BUSINESS_APPOINTMENT_REMINDER_STATUS_STYLES[businessReminderStatusByAppointmentId[appt.id]]
                          }`}
                        >
                          {businessReminderStatusByAppointmentId[appt.id]}
                        </span>
                      )}
                    </td>
                    <td
                      className={`sticky right-0 z-10 p-3 shadow-[-6px_0_6px_-4px_rgba(0,0,0,0.12)] ${
                        appt.id === highlightId ? "bg-amber-50" : "bg-[var(--crm-surface)]"
                      }`}
                    >
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setManageResult(null);
                            setPendingResend(null);
                            setEditingId(editingId === appt.id ? null : appt.id);
                          }}
                          className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700"
                        >
                          {editingId === appt.id ? "Close" : "Manage"}
                        </button>
                        {appt.status !== "Cancelled" && appt.status !== "Replaced" && (
                          <button
                            type="button"
                            onClick={() => setCancelingId(cancelingId === appt.id ? null : appt.id)}
                            className="text-[12.5px] font-semibold text-rose-600 hover:text-rose-700"
                          >
                            {cancelingId === appt.id ? "Close" : "Cancel/Replace"}
                          </button>
                        )}
                      </div>
                      {(appt.status === "Booked" || appt.status === "Confirmed") && (
                        <div className="mt-2.5">
                          <AppointmentEmailActions
                            appointmentId={appt.id}
                            businessName={appt.business_name}
                            contactName={leadById.get(appt.lead_id ?? "")?.contact_name ?? appt.contact_name}
                            email={leadById.get(appt.lead_id ?? "")?.email ?? appt.email}
                            appointmentDate={appt.appointment_date}
                            appointmentTime={appt.appointment_time}
                            timezone={appt.timezone}
                            latestEmail={latestEmailByAppointmentId?.[appt.id] ?? null}
                            automaticReminderStatus={automaticReminderStatusByAppointmentId?.[appt.id]}
                            isAdmin
                            onResend={resendAppointmentNotificationAction}
                            onReminder={sendAppointmentReminderAction}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                  {cancelingId === appt.id && (
                    <tr>
                      <td colSpan={8} className="bg-rose-50 p-4">
                        <form
                          action={(formData) =>
                            runAction(() => cancelOrReplaceAppointmentAction(appt.id, formData), () => setCancelingId(null))
                          }
                          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                        >
                          <p className="text-[12.5px] text-slate-600 sm:col-span-2">
                            Use this to correct an invalid appointment (e.g. rebooked because the original contact email
                            bounced) without deleting the record - it&apos;s excluded from every appointment total, but the
                            lead and activity history are kept.
                          </p>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">New Status</span>
                            <select name="status" defaultValue="Replaced" className={inputClass}>
                              <option value="Replaced">Replaced (a corrected appointment exists)</option>
                              <option value="Cancelled">Cancelled (no replacement)</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Reason (optional)</span>
                            <input
                              name="reason"
                              type="text"
                              placeholder="e.g. Incorrect email—appointment rebooked."
                              className={inputClass}
                            />
                          </label>
                          <button
                            type="submit"
                            disabled={isPending}
                            className="rounded-full bg-rose-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-rose-700 sm:col-span-2 sm:w-fit"
                          >
                            Cancel/Replace Appointment
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                  {editingId === appt.id && (
                    <tr>
                      <td colSpan={8} className="bg-slate-50 p-4">
                        <form
                          onSubmit={(e) => handleManageSubmit(appt, e)}
                          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                        >
                          <p className="text-[12.5px] text-slate-600 sm:col-span-2">
                            Edits save to this same appointment record - it&apos;s never re-created, so the appointment
                            count, agent attribution, and any already-reviewed incentive can&apos;t duplicate. Every
                            changed field is logged to this lead&apos;s activity timeline with its old and new value.
                          </p>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Business Name</span>
                            <input name="business_name" required defaultValue={appt.business_name} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Contact Name</span>
                            <input name="contact_name" defaultValue={appt.contact_name ?? ""} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Phone</span>
                            <input name="phone" defaultValue={appt.phone ?? ""} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Email</span>
                            <input name="email" type="email" defaultValue={appt.email ?? ""} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Appointment Date</span>
                            <input name="appointment_date" type="date" required defaultValue={appt.appointment_date} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Appointment Time</span>
                            <input name="appointment_time" type="time" required defaultValue={appt.appointment_time} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Time Zone</span>
                            <input name="timezone" required defaultValue={appt.timezone} className={inputClass} />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Meeting Type</span>
                            <select name="meeting_type" defaultValue={appt.meeting_type} className={inputClass}>
                              {LEADGEN_MEETING_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-slate-600">Meeting Link</span>
                            <input name="meeting_link" type="url" defaultValue={appt.meeting_link ?? ""} className={inputClass} />
                          </label>
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
                            <span className="text-[12.5px] font-semibold text-slate-600">
                              Incentive Reason (required unless Qualified/Not Reviewed)
                            </span>
                            <input
                              name="incentive_status_reason"
                              type="text"
                              defaultValue={appt.incentive_status_reason ?? ""}
                              className={inputClass}
                            />
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
                          <label className="flex items-center gap-2 text-[13px]">
                            <input type="hidden" name="send_updated_confirmation" value="false" />
                            <input
                              type="checkbox"
                              onChange={(e) => {
                                const hidden = e.currentTarget.previousElementSibling as HTMLInputElement;
                                hidden.value = e.currentTarget.checked ? "true" : "false";
                              }}
                            />
                            Send the updated confirmation to the prospect&apos;s latest saved email (you&apos;ll be asked to
                            confirm before it sends)
                          </label>
                          {manageResult?.id === appt.id && (
                            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-medium text-emerald-700 sm:col-span-2">
                              {manageResult.text}
                            </p>
                          )}
                          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-sky-700 sm:col-span-2 sm:w-fit">
                            {isPending ? "Saving…" : "Save"}
                          </button>
                        </form>
                        {pendingResend?.appointmentId === appt.id && (
                          <AppointmentEmailConfirmModal
                            mode="resend"
                            businessName={pendingResend.businessName}
                            contactName={pendingResend.contactName}
                            email={pendingResend.email}
                            appointmentDate={pendingResend.appointmentDate}
                            appointmentTime={pendingResend.appointmentTime}
                            timezone={pendingResend.timezone}
                            note="Your other edits on this form will be saved at the same time."
                            onClose={() => setPendingResend(null)}
                            onConfirm={async () => {
                              const result = await updateAppointmentAction(pendingResend.appointmentId, pendingResend.formData);
                              if (!result?.error) {
                                setManageResult({ id: pendingResend.appointmentId, text: result?.message ?? "Appointment saved and confirmation resent." });
                              }
                              return result;
                            }}
                            onSent={() => setPendingResend(null)}
                          />
                        )}
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
