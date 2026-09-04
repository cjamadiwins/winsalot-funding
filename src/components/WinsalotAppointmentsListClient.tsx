"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS, type OpportunityType } from "@/lib/crm-types";
import {
  WINSALOT_APPOINTMENT_INCENTIVE_PENDING_LABEL,
  WINSALOT_APPOINTMENT_INCENTIVE_PENDING_STYLE,
  WINSALOT_APPOINTMENT_INCENTIVE_STATUS_STYLES,
  isWinsalotAppointmentCountable,
  type WinsalotAppointmentIncentiveStatus,
  type WinsalotAppointmentRow,
} from "@/lib/winsalot-consultation-types";
import WinsalotSlotPicker from "./WinsalotSlotPicker";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

export type WinsalotAppointmentListRow = WinsalotAppointmentRow & {
  opportunityBusinessName: string | null;
  opportunityStage: string | null;
  assignedAgentName: string | null;
  reminder24h: "scheduled" | "sent" | "failed";
  reminder1h: "scheduled" | "sent" | "failed";
  reminder24hError: string | null;
  reminder1hError: string | null;
  // SMS counterpart (src/lib/winsalot-consultation-reminders.ts's
  // fetchWinsalotSmsReminderStatusMap) - the fuller Scheduled/Sending/
  // Sent/Delivered/Failed/Skipped/Opted Out/Not scheduled set, unlike the
  // email badge's simpler three states above.
  smsReminder24h: string;
  smsReminder1h: string;
  smsReminder24hError: string | null;
  smsReminder1hError: string | null;
};

export type WinsalotAppointmentActions = {
  getOfferedSlots: (excludeAppointmentId: string) => Promise<{ slotIsos: string[]; businessTimezone: string }>;
  reschedule: (id: string, startUtcIso: string) => Promise<{ error?: string }>;
  cancel: (id: string, reason: string | null) => Promise<{ error?: string }>;
  edit: (
    id: string,
    input: { businessName: string; contactName: string; email: string; phone: string; smsConsent: boolean; serviceType: OpportunityType; notes: string }
  ) => Promise<{ error?: string }>;
  remove?: (id: string) => Promise<{ error?: string }>;
  // Admin-only Weekly Incentive review ("Verify as Qualified" / "Reject"
  // quick actions) - undefined for the agent view, where the incentive
  // badge is still shown read-only but no review controls render.
  reviewIncentive?: (id: string, decision: Extract<WinsalotAppointmentIncentiveStatus, "Qualified" | "Unqualified">, reason: string | null) => Promise<{ error?: string }>;
  opportunityHref: (opportunityId: string) => string;
};

const REMINDER_LABEL: Record<string, string> = { scheduled: "Scheduled", sent: "Sent", failed: "Failed" };
const REMINDER_STYLE: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-600",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
};

// SMS reminder display status (leadgenSmsReminderDisplayStatus /
// winsalotSmsReminderDisplayStatus) - the fuller "Scheduled, Sent,
// Delivered, Failed, Skipped or Opted Out" set from the brief.
const SMS_STATUS_STYLE: Record<string, string> = {
  Scheduled: "bg-slate-100 text-slate-600",
  "Not scheduled": "bg-slate-100 text-slate-500",
  Sending: "bg-sky-100 text-sky-700",
  Sent: "bg-emerald-100 text-emerald-700",
  Delivered: "bg-emerald-100 text-emerald-800",
  Failed: "bg-rose-100 text-rose-700",
  Skipped: "bg-amber-100 text-amber-700",
  "Opted Out": "bg-slate-200 text-slate-600",
  default: "bg-slate-100 text-slate-600",
};

export default function WinsalotAppointmentsListClient({
  appointments,
  actions,
  isAdmin,
}: {
  appointments: WinsalotAppointmentListRow[];
  actions: WinsalotAppointmentActions;
  isAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "reschedule" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offeredSlots, setOfferedSlots] = useState<{ slotIsos: string[]; businessTimezone: string } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [rejectingIncentiveId, setRejectingIncentiveId] = useState<string | null>(null);
  const [rejectIncentiveReason, setRejectIncentiveReason] = useState("");

  function openRow(appt: WinsalotAppointmentListRow, nextMode: "view" | "edit" | "reschedule" | "cancel") {
    setError(null);
    setExpandedId(appt.id);
    setMode(nextMode);
    setSelectedSlot(null);
    setCancelReason("");
    if (nextMode === "reschedule") {
      startTransition(async () => {
        const slots = await actions.getOfferedSlots(appt.id);
        setOfferedSlots(slots);
      });
    }
  }

  function closeRow() {
    setExpandedId(null);
    setMode(null);
    setError(null);
  }

  function handleReschedule(id: string) {
    if (!selectedSlot) {
      setError("Choose a new date and time.");
      return;
    }
    startTransition(async () => {
      const result = await actions.reschedule(id, selectedSlot);
      if (result.error) setError(result.error);
      else closeRow();
    });
  }

  function handleCancel(id: string) {
    startTransition(async () => {
      const result = await actions.cancel(id, cancelReason.trim() ? cancelReason.trim() : null);
      if (result.error) setError(result.error);
      else closeRow();
    });
  }

  function handleEdit(id: string, formData: FormData) {
    startTransition(async () => {
      const result = await actions.edit(id, {
        businessName: String(formData.get("business_name") ?? ""),
        contactName: String(formData.get("contact_name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        smsConsent: formData.get("sms_consent") === "on",
        serviceType: String(formData.get("service_type") ?? "lead_generation") as OpportunityType,
        notes: String(formData.get("notes") ?? ""),
      });
      if (result.error) setError(result.error);
      else closeRow();
    });
  }

  // "Verify as Qualified" - a no-op if it's already Qualified. Changing
  // away from a different, already-reviewed decision asks for
  // confirmation first; the very first review (from Not Reviewed) never
  // needs one. Mirrors the Lead Gen CRM's admin appointments table
  // exactly (leadgen/admin/appointments/AppointmentsListClient.tsx).
  function handleVerifyQualified(appt: WinsalotAppointmentListRow) {
    if (!actions.reviewIncentive) return;
    if (appt.incentive_status === "Qualified") return;
    if (appt.incentive_status && !confirm(`This appointment is currently reviewed as "${appt.incentive_status}". Change the decision to Qualified?`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await actions.reviewIncentive!(appt.id, "Qualified", null);
      if (result.error) setError(result.error);
    });
  }

  function handleConfirmRejectIncentive(appt: WinsalotAppointmentListRow) {
    if (!actions.reviewIncentive) return;
    const reason = rejectIncentiveReason.trim();
    if (!reason) {
      setError("A rejection reason is required.");
      return;
    }
    if (
      appt.incentive_status &&
      appt.incentive_status !== "Unqualified" &&
      !confirm(`This appointment is currently reviewed as "${appt.incentive_status}". Change the decision to Rejected?`)
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await actions.reviewIncentive!(appt.id, "Unqualified", reason);
      if (result.error) setError(result.error);
      else {
        setRejectingIncentiveId(null);
        setRejectIncentiveReason("");
      }
    });
  }

  function handleDelete(id: string) {
    if (!actions.remove) return;
    if (!confirm("Permanently delete this appointment? This cannot be undone.")) return;
    startTransition(async () => {
      await actions.remove!(id);
    });
  }

  if (appointments.length === 0) {
    return <p className="text-sm text-slate-500">No appointments yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {appointments.map((appt) => {
        const start = new Date(appt.appointment_start_at);
        const isExpanded = expandedId === appt.id;

        return (
          <li key={appt.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{appt.business_name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      appt.status === "cancelled" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {appt.status === "cancelled" ? "Cancelled" : "Booked"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {appt.booked_by === "self" ? "Self-booked" : "Agent-booked"}
                  </span>
                  <span
                    title={appt.incentive_status_reason ?? undefined}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      appt.incentive_status ? WINSALOT_APPOINTMENT_INCENTIVE_STATUS_STYLES[appt.incentive_status] : WINSALOT_APPOINTMENT_INCENTIVE_PENDING_STYLE
                    }`}
                  >
                    {appt.incentive_status ?? WINSALOT_APPOINTMENT_INCENTIVE_PENDING_LABEL}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-slate-600">
                  {appt.contact_name} · {appt.email} · {appt.phone}
                </p>
                <p className="mt-0.5 text-[13px] text-slate-600">
                  {start.toLocaleString()} ({appt.business_timezone}) · {OPPORTUNITY_TYPE_LABELS[appt.service_type]} · Agent:{" "}
                  {appt.assignedAgentName || "Unassigned"}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${REMINDER_STYLE[appt.reminder24h]}`}
                    title={appt.reminder24hError ?? undefined}
                  >
                    24h: {REMINDER_LABEL[appt.reminder24h]}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${REMINDER_STYLE[appt.reminder1h]}`}
                    title={appt.reminder1hError ?? undefined}
                  >
                    1h: {REMINDER_LABEL[appt.reminder1h]}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${SMS_STATUS_STYLE[appt.smsReminder24h] ?? SMS_STATUS_STYLE.default}`} title={appt.smsReminder24hError ?? undefined}>
                    SMS 24h: {appt.smsReminder24h}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${SMS_STATUS_STYLE[appt.smsReminder1h] ?? SMS_STATUS_STYLE.default}`} title={appt.smsReminder1hError ?? undefined}>
                    SMS 1h: {appt.smsReminder1h}
                  </span>
                </p>
                {appt.status === "cancelled" && (
                  <p className="mt-1 text-[12.5px] text-rose-600">
                    Cancelled by {appt.cancelled_by_role}
                    {appt.cancelled_reason ? ` — ${appt.cancelled_reason}` : ""}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {appt.opportunity_id && (
                  <Link href={actions.opportunityHref(appt.opportunity_id)} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                    View Prospect
                  </Link>
                )}
                <button type="button" onClick={() => openRow(appt, "edit")} className="text-xs font-semibold text-slate-600 hover:text-slate-800">
                  Edit
                </button>
                {appt.status !== "cancelled" && (
                  <>
                    <button type="button" onClick={() => openRow(appt, "reschedule")} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                      Reschedule
                    </button>
                    <button type="button" onClick={() => openRow(appt, "cancel")} className="text-xs font-semibold text-rose-600 hover:text-rose-700">
                      Cancel
                    </button>
                  </>
                )}
                {isAdmin && actions.remove && (
                  <button type="button" onClick={() => handleDelete(appt.id)} disabled={isPending} className="text-xs font-semibold text-rose-700 hover:text-rose-800">
                    Delete
                  </button>
                )}
              </div>
            </div>

            {isAdmin && actions.reviewIncentive && isWinsalotAppointmentCountable(appt.status) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Weekly Incentive:</span>
                {appt.incentive_status !== "Qualified" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleVerifyQualified(appt)}
                    className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Verify as Qualified
                  </button>
                )}
                {appt.incentive_status !== "Unqualified" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      setError(null);
                      setRejectIncentiveReason("");
                      setRejectingIncentiveId(rejectingIncentiveId === appt.id ? null : appt.id);
                    }}
                    className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Reject
                  </button>
                )}
              </div>
            )}

            {rejectingIncentiveId === appt.id && (
              <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2 sm:w-72">
                <input
                  type="text"
                  value={rejectIncentiveReason}
                  onChange={(e) => setRejectIncentiveReason(e.target.value)}
                  placeholder="Rejection reason (required)"
                  className="rounded border border-rose-300 px-2 py-1 text-[11.5px] text-slate-900"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleConfirmRejectIncentive(appt)}
                    className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending ? "Saving…" : "Confirm Reject"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectingIncentiveId(null)}
                    className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isExpanded && error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}

            {isExpanded && mode === "edit" && (
              <form action={(fd) => handleEdit(appt.id, fd)} className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
                <input name="business_name" defaultValue={appt.business_name} placeholder="Business name" className={inputClass} />
                <input name="contact_name" defaultValue={appt.contact_name} placeholder="Contact name" className={inputClass} />
                <input name="email" type="email" defaultValue={appt.email} placeholder="Email" className={inputClass} />
                <input name="phone" defaultValue={appt.phone} placeholder="Phone" className={inputClass} />
                <label className="flex items-center gap-2 text-[12.5px] text-slate-600 sm:col-span-2">
                  <input type="checkbox" name="sms_consent" defaultChecked={appt.sms_consent} className="h-4 w-4" />
                  SMS reminder consent
                </label>
                <select name="service_type" defaultValue={appt.service_type} className={inputClass}>
                  {OPPORTUNITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {OPPORTUNITY_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input name="notes" defaultValue={appt.notes ?? ""} placeholder="Notes" className={inputClass} />
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">
                    Save
                  </button>
                  <button type="button" onClick={closeRow} className="text-xs font-semibold text-slate-500">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {isExpanded && mode === "reschedule" && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                {offeredSlots ? (
                  <WinsalotSlotPicker
                    slotIsos={offeredSlots.slotIsos}
                    businessTimezone={offeredSlots.businessTimezone}
                    selected={selectedSlot}
                    onSelect={setSelectedSlot}
                  />
                ) : (
                  <p className="text-xs text-slate-500">Loading availability…</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isPending || !selectedSlot}
                    onClick={() => handleReschedule(appt.id)}
                    className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    Confirm Reschedule
                  </button>
                  <button type="button" onClick={closeRow} className="text-xs font-semibold text-slate-500">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isExpanded && mode === "cancel" && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Reason for cancelling"
                  className={inputClass}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleCancel(appt.id)}
                    className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    Confirm Cancellation
                  </button>
                  <button type="button" onClick={closeRow} className="text-xs font-semibold text-slate-500">
                    Keep Appointment
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
