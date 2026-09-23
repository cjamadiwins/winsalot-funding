"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS, type OpportunityType } from "@/lib/crm-types";
import { SMS_CONSENT_NOTICE } from "@/lib/sms-notice";
import {
  WINSALOT_APPOINTMENT_INCENTIVE_PENDING_LABEL,
  WINSALOT_APPOINTMENT_INCENTIVE_PENDING_STYLE,
  WINSALOT_APPOINTMENT_INCENTIVE_STATUS_STYLES,
  WINSALOT_APPOINTMENT_STATUS_LABELS,
  WINSALOT_APPOINTMENT_STATUS_STYLES,
  WINSALOT_APPOINTMENT_TYPES,
  isWinsalotAppointmentCountable,
  type WinsalotAppointmentIncentiveStatus,
  type WinsalotAppointmentRow,
  type WinsalotAppointmentType,
  type WinsalotFollowUpEmailDisplayStatus,
  type WinsalotReminderDisplayStatus,
} from "@/lib/winsalot-consultation-types";
import WinsalotSlotPicker from "./WinsalotSlotPicker";
// Reused as-is (not a Lead Gen-specific component - no Lead Gen imports)
// for Growth CRM's own "Resend Appointment Notification" / "Send
// Appointment Reminder" confirmation window, so the two CRMs never
// maintain two copies of the same confirm-before-sending modal.
import AppointmentEmailConfirmModal from "./leadgen/AppointmentEmailConfirmModal";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

export type WinsalotAppointmentListRow = WinsalotAppointmentRow & {
  opportunityBusinessName: string | null;
  opportunityStage: string | null;
  assignedAgentName: string | null;
  reminder24h: WinsalotReminderDisplayStatus;
  reminder1h: WinsalotReminderDisplayStatus;
  reminder24hError: string | null;
  reminder1hError: string | null;
  // SMS counterpart (src/lib/winsalot-consultation-reminders.ts's
  // fetchWinsalotSmsReminderStatusMap) - the fuller Scheduled/Sending/
  // Sent/Delivered/Failed/Skipped/Opted Out/Not scheduled set.
  smsReminder24h: string;
  smsReminder1h: string;
  smsReminder24hError: string | null;
  smsReminder1hError: string | null;
  // "Consultation Follow-Up: Sent / Delivered / Failed" - set once the
  // follow-up email has actually gone out, whether automatically (via
  // "Complete Consultation") or via the admin-only manual Send/Resend
  // action below (see src/lib/winsalot-consultation-completion.ts);
  // "Not Sent" otherwise.
  followUpEmailStatus: WinsalotFollowUpEmailDisplayStatus;
  followUpEmailError: string | null;
  // The address the follow-up was actually sent to (from the tracked
  // crm_lead_emails row) - null until a send has happened.
  followUpEmailRecipient: string | null;
};

export type WinsalotAppointmentActions = {
  getOfferedSlots: (excludeAppointmentId: string) => Promise<{ slotIsos: string[]; businessTimezone: string }>;
  reschedule: (id: string, startUtcIso: string) => Promise<{ error?: string }>;
  cancel: (id: string, reason: string | null) => Promise<{ error?: string }>;
  edit: (
    id: string,
    input: {
      businessName: string;
      contactName: string;
      email: string;
      phone: string;
      serviceType: OpportunityType;
      appointmentType: WinsalotAppointmentType;
      notes: string;
    }
  ) => Promise<{ error?: string }>;
  remove?: (id: string) => Promise<{ error?: string }>;
  // "Complete Consultation" / "Mark No Show" - available to admin and the
  // assigned agent alike (unlike remove/reviewIncentive/resend/sendReminder
  // below, which stay admin-only), so both AdminAppointmentsClient and
  // AgentAppointmentsClient always pass these.
  complete?: (id: string) => Promise<{ error?: string; outcome?: "completed" | "already_completed"; followUpEmailStatus?: string }>;
  markNoShow?: (id: string) => Promise<{ error?: string }>;
  // Consultation Follow-Up Email - admin-only "Preview before sending" /
  // "Send immediately" / "Resend if necessary" (see
  // src/lib/winsalot-consultation-completion.ts). Available on every
  // consultation regardless of status - undefined for the agent view.
  previewFollowUpEmail?: (id: string) => Promise<{ subject: string; text: string } | { error: string }>;
  sendFollowUpEmail?: (id: string) => Promise<{ error?: string; message?: string }>;
  // Admin-only Weekly Incentive review ("Verify as Qualified" / "Reject"
  // quick actions) - undefined for the agent view, where the incentive
  // badge is still shown read-only but no review controls render.
  reviewIncentive?: (id: string, decision: Extract<WinsalotAppointmentIncentiveStatus, "Qualified" | "Unqualified">, reason: string | null) => Promise<{ error?: string }>;
  // "Resend Appointment Notification" / "Send Appointment Reminder" -
  // admin-only (mirrors the Lead Gen CRM's own two buttons, also admin-
  // only) - undefined for the agent view, where the reminder/confirmation
  // status badges are still shown read-only but no send controls render.
  // message carries the SMS-side outcome (e.g. "SMS sent." / "SMS not
  // sent (no phone number on file).") - the email side is always implied
  // by a successful result.
  resend?: (id: string) => Promise<{ error?: string; message?: string }>;
  sendReminder?: (id: string) => Promise<{ error?: string; message?: string }>;
  opportunityHref: (opportunityId: string) => string;
};

const REMINDER_STYLE: Record<string, string> = {
  Scheduled: "bg-slate-100 text-slate-600",
  "Not scheduled": "bg-slate-100 text-slate-500",
  Sending: "bg-sky-100 text-sky-700",
  Sent: "bg-emerald-100 text-emerald-700",
  Delivered: "bg-emerald-100 text-emerald-800",
  Bounced: "bg-amber-100 text-amber-800",
  Failed: "bg-rose-100 text-rose-700",
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
  const [view, setView] = useState<"active" | "completed">("active");
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice("#appointment-".length));
    if (window.location.hash.startsWith("#appointment-") && appointments.some((appt) => appt.id === id && appt.status !== "booked")) {
      requestAnimationFrame(() => {
        setView("completed");
        requestAnimationFrame(() => document.getElementById(`appointment-${id}`)?.scrollIntoView());
      });
    }
  }, [appointments]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "reschedule" | "cancel" | "followup" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offeredSlots, setOfferedSlots] = useState<{ slotIsos: string[]; businessTimezone: string } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [rejectingIncentiveId, setRejectingIncentiveId] = useState<string | null>(null);
  const [rejectIncentiveReason, setRejectIncentiveReason] = useState("");
  // "Resend Appointment Notification" / "Send Appointment Reminder" -
  // which appointment's confirm window is open (if any) and the last
  // send's own success/failure message, tracked separately from
  // expandedId/mode above so opening Edit/Reschedule/Cancel on this same
  // card never clears a still-relevant send result, and vice versa.
  const [emailActionId, setEmailActionId] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState<"resend" | "reminder" | null>(null);
  const [emailMessage, setEmailMessage] = useState<{ id: string; text: string } | null>(null);
  // "Complete Consultation" / "Mark No Show" result messages, tracked per
  // appointment id the same way emailMessage is above.
  const [completeMessage, setCompleteMessage] = useState<{ id: string; text: string } | null>(null);
  // Consultation Follow-Up Email preview - fetched fresh each time the
  // panel opens (never cached across appointments) so "Preview" always
  // shows exactly what "Send"/"Resend" would actually send, including
  // whichever CTA (client dashboard button vs. reply-to fallback) applies
  // right now.
  const [followUpPreview, setFollowUpPreview] = useState<{ subject: string; text: string } | { error: string } | null>(null);
  const [followUpMessage, setFollowUpMessage] = useState<{ id: string; text: string } | null>(null);

  function openRow(appt: WinsalotAppointmentListRow, nextMode: "view" | "edit" | "reschedule" | "cancel" | "followup") {
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
    if (nextMode === "followup" && actions.previewFollowUpEmail) {
      setFollowUpPreview(null);
      setFollowUpMessage(null);
      startTransition(async () => {
        const preview = await actions.previewFollowUpEmail!(appt.id);
        setFollowUpPreview(preview);
      });
    }
  }

  function closeRow() {
    setExpandedId(null);
    setMode(null);
    setError(null);
  }

  function handleSendFollowUpEmail(appt: WinsalotAppointmentListRow) {
    if (!actions.sendFollowUpEmail) return;
    const already = appt.followUpEmailStatus !== "Not Sent";
    if (!confirm(already ? `Resend the consultation follow-up email to ${appt.email}?` : `Send the consultation follow-up email to ${appt.email}?`)) return;
    startTransition(async () => {
      const result = await actions.sendFollowUpEmail!(appt.id);
      if (result.error) setFollowUpMessage({ id: appt.id, text: result.error });
      else {
        setFollowUpMessage({ id: appt.id, text: result.message ?? "Follow-up email sent." });
        closeRow();
      }
    });
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
        serviceType: String(formData.get("service_type") ?? "lead_generation") as OpportunityType,
        appointmentType: String(formData.get("appointment_type") ?? "Phone Call") as WinsalotAppointmentType,
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

  // "Easy to use without opening several pages" - one click, a single
  // confirm dialog (since it fires an email and can't be undone), no
  // separate modal/form. The actual "only once" guarantee lives in
  // performWinsalotCompletion's guarded database update, not here - this
  // confirm is just to stop an accidental click, not a safety mechanism.
  function handleComplete(appt: WinsalotAppointmentListRow) {
    if (!actions.complete) return;
    if (!confirm(`Mark the consultation with ${appt.business_name} as completed? This sends a one-time follow-up email to ${appt.email}.`)) return;
    setCompleteMessage(null);
    startTransition(async () => {
      const result = await actions.complete!(appt.id);
      if (result.error) setCompleteMessage({ id: appt.id, text: result.error });
      else if (result.outcome === "already_completed") setCompleteMessage({ id: appt.id, text: "This consultation was already marked completed." });
      else if (result.followUpEmailStatus) setCompleteMessage({ id: appt.id, text: `Marked Completed. Follow-up email: ${result.followUpEmailStatus}.` });
    });
  }

  function handleMarkNoShow(appt: WinsalotAppointmentListRow) {
    if (!actions.markNoShow) return;
    if (!confirm(`Mark the consultation with ${appt.business_name} as No Show? No follow-up email is sent for a no-show.`)) return;
    setCompleteMessage(null);
    startTransition(async () => {
      const result = await actions.markNoShow!(appt.id);
      if (result.error) setCompleteMessage({ id: appt.id, text: result.error });
    });
  }

  function openEmailAction(appt: WinsalotAppointmentListRow, nextMode: "resend" | "reminder") {
    setEmailMessage(null);
    setEmailActionId(appt.id);
    setEmailMode(nextMode);
  }

  function closeEmailAction() {
    setEmailActionId(null);
    setEmailMode(null);
  }

  const visibleAppointments = appointments.filter((appt) =>
    view === "completed" ? appt.status !== "booked" : appt.status === "booked"
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Appointment view">
        {(["active", "completed"] as const).map((option) => (
          <button key={option} type="button" onClick={() => setView(option)} aria-pressed={view === option}
            className={`rounded-full px-4 py-2 text-xs font-semibold ${view === option ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {option === "active" ? "Active Appointments" : "Completed / Past Appointments"}
          </button>
        ))}
      </div>
      {visibleAppointments.length === 0 && <p className="text-sm text-slate-500">No {view === "active" ? "active" : "completed or past"} appointments.</p>}
      <ul className="space-y-3">
      {visibleAppointments.map((appt) => {
        const start = new Date(appt.appointment_start_at);
        const isExpanded = expandedId === appt.id;

        return (
          <li key={appt.id} id={`appointment-${appt.id}`} className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  {appt.opportunity_id ? (
                    <Link
                      href={actions.opportunityHref(appt.opportunity_id)}
                      className="font-semibold text-slate-900 hover:text-sky-700 hover:underline"
                    >
                      {appt.business_name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-slate-900">{appt.business_name}</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${WINSALOT_APPOINTMENT_STATUS_STYLES[appt.status]}`}>
                    {WINSALOT_APPOINTMENT_STATUS_LABELS[appt.status]}
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
                  {start.toLocaleString()} ({appt.business_timezone}) · {appt.appointment_type} · {OPPORTUNITY_TYPE_LABELS[appt.service_type]} · Agent:{" "}
                  {appt.assignedAgentName || "Unassigned"}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${REMINDER_STYLE[appt.reminder24h]}`}
                    title={appt.reminder24hError ?? undefined}
                  >
                    Email 24h: {appt.reminder24h}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${REMINDER_STYLE[appt.reminder1h]}`}
                    title={appt.reminder1hError ?? undefined}
                  >
                    Email 1h: {appt.reminder1h}
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
                {appt.status === "completed" && (
                  <p className="mt-1 text-[12.5px] text-emerald-700">
                    Completed On {appt.completed_at ? new Date(appt.completed_at).toLocaleString() : "—"} · Completed By {appt.completed_by_name || "—"}
                  </p>
                )}
                {appt.status === "no_show" && (
                  <p className="mt-1 text-[12.5px] text-amber-700">
                    Marked No Show on {appt.no_show_at ? new Date(appt.no_show_at).toLocaleString() : "—"} by {appt.no_show_by_name || "—"}
                  </p>
                )}
                {/* "Consultation Follow-Up: Sent — [date/time]" / "Not Sent" - always
                    shown (not just once Completed), tracked entirely independently
                    of the appointment reminder badges above. */}
                <p
                  className={`mt-1 text-[12.5px] font-medium ${
                    appt.followUpEmailStatus === "Not Sent"
                      ? "text-slate-500"
                      : appt.followUpEmailStatus === "Failed" || appt.followUpEmailStatus === "Bounced"
                        ? "text-rose-600"
                        : "text-emerald-700"
                  }`}
                  title={appt.followUpEmailError ?? undefined}
                >
                  Consultation Follow-Up: {appt.followUpEmailStatus}
                  {appt.follow_up_email_sent_at && appt.followUpEmailStatus !== "Not Sent" ? ` — ${new Date(appt.follow_up_email_sent_at).toLocaleString()}` : ""}
                  {appt.followUpEmailRecipient ? ` · Recipient: ${appt.followUpEmailRecipient}` : ""}
                </p>
                {completeMessage?.id === appt.id && <p className="mt-1 text-[12.5px] font-medium text-slate-700">{completeMessage.text}</p>}
                {followUpMessage?.id === appt.id && <p className="mt-1 text-[12.5px] font-medium text-slate-700">{followUpMessage.text}</p>}
              </div>

              <div className="flex flex-wrap gap-2">
                {appt.opportunity_id && (
                  <Link href={actions.opportunityHref(appt.opportunity_id)} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                    View Prospect
                  </Link>
                )}
                {/* Admin-only shortcut into the Client Consultation Guide -
                    that feature is admin-only per its own RLS policy, so
                    it's never shown on the agent view (isAdmin=false),
                    where it would only lead to a login redirect. Shown here
                    for every status except "booked", where the prominent
                    green "Start Consultation" button below is the one and
                    only way in (so there's never two links to the same
                    guide on the same row) - a guide is still useful to open
                    for a completed/cancelled/no-show appointment (e.g. to
                    review or correct a past consultation). */}
                {isAdmin && appt.status !== "booked" && (
                  <Link
                    href={`/admin/consultation-guide/new?appointmentId=${appt.id}`}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    Open Consultation Guide
                  </Link>
                )}
                <button type="button" onClick={() => openRow(appt, "edit")} className="text-xs font-semibold text-slate-600 hover:text-slate-800">
                  Edit
                </button>
                {isAdmin && actions.previewFollowUpEmail && actions.sendFollowUpEmail && (
                  <button type="button" onClick={() => openRow(appt, "followup")} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                    {appt.followUpEmailStatus === "Not Sent" ? "Send Follow-Up Email" : "Resend Follow-Up Email"}
                  </button>
                )}
                {appt.status === "booked" && (
                  <>
                    {/* Admin: only the Client Consultation Guide's own
                        "Mark Consultation Complete" may complete an
                        appointment and send its follow-up email now - this
                        button only opens the guide, it never completes or
                        emails anything by itself (see
                        completeLinkedAppointment in
                        consultation-guide/actions.ts). Agents have no
                        access to the guide (admin-only RLS), so they keep
                        the original one-click "Complete Consultation" flow
                        below unchanged. */}
                    {isAdmin ? (
                      <Link
                        href={`/admin/consultation-guide/new?appointmentId=${appt.id}`}
                        className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Start Consultation
                      </Link>
                    ) : (
                      actions.complete && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleComplete(appt)}
                          className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Complete Consultation
                        </button>
                      )
                    )}
                    {actions.markNoShow && (
                      <button type="button" disabled={isPending} onClick={() => handleMarkNoShow(appt)} className="text-xs font-semibold text-amber-700 hover:text-amber-800">
                        Mark No Show
                      </button>
                    )}
                    <button type="button" onClick={() => openRow(appt, "reschedule")} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                      Reschedule
                    </button>
                    <button type="button" onClick={() => openRow(appt, "cancel")} className="text-xs font-semibold text-rose-600 hover:text-rose-700">
                      Cancel
                    </button>
                    {isAdmin && actions.resend && actions.sendReminder && (
                      <>
                        <button type="button" onClick={() => openEmailAction(appt, "resend")} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                          Resend Appointment Notification
                        </button>
                        <button type="button" onClick={() => openEmailAction(appt, "reminder")} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                          Send Appointment Reminder
                        </button>
                      </>
                    )}
                  </>
                )}
                {isAdmin && actions.remove && (
                  <button type="button" onClick={() => handleDelete(appt.id)} disabled={isPending} className="text-xs font-semibold text-rose-700 hover:text-rose-800">
                    Delete
                  </button>
                )}
              </div>
            </div>

            {emailMessage?.id === appt.id && <p className="mt-1.5 text-[11.5px] font-medium text-emerald-700">{emailMessage.text}</p>}

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
                <p className="text-[11.5px] text-slate-500 sm:col-span-2">{SMS_CONSENT_NOTICE}</p>
                <select name="service_type" defaultValue={appt.service_type} className={inputClass}>
                  {OPPORTUNITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {OPPORTUNITY_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <select name="appointment_type" defaultValue={appt.appointment_type} className={inputClass}>
                  {WINSALOT_APPOINTMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
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

            {isExpanded && mode === "followup" && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                {!followUpPreview ? (
                  <p className="text-xs text-slate-500">Loading preview…</p>
                ) : "error" in followUpPreview ? (
                  <p className="text-xs font-medium text-rose-600">{followUpPreview.error}</p>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preview — Subject</p>
                    <p className="mt-0.5 text-[13.5px] font-semibold text-slate-900">{followUpPreview.subject}</p>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preview — Body</p>
                    <pre className="mt-0.5 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-slate-700">{followUpPreview.text}</pre>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isPending || !followUpPreview || "error" in followUpPreview}
                    onClick={() => handleSendFollowUpEmail(appt)}
                    className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {appt.followUpEmailStatus === "Not Sent" ? "Send Follow-Up Email" : "Resend Follow-Up Email"}
                  </button>
                  <button type="button" onClick={closeRow} className="text-xs font-semibold text-slate-500">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isAdmin && actions.resend && actions.sendReminder && emailActionId === appt.id && emailMode && (
              <AppointmentEmailConfirmModal
                mode={emailMode === "reminder" ? "reminder" : "resend"}
                businessName={appt.business_name}
                contactName={appt.contact_name}
                email={appt.email}
                appointmentDate={start.toLocaleDateString()}
                appointmentTime={start.toLocaleTimeString()}
                timezone={appt.business_timezone}
                onClose={closeEmailAction}
                onConfirm={() => (emailMode === "reminder" ? actions.sendReminder!(appt.id) : actions.resend!(appt.id))}
                onSent={(result) => {
                  const emailPart = emailMode === "reminder" ? "Reminder sent." : "Confirmation resent.";
                  setEmailMessage({ id: appt.id, text: result?.message ? `${emailPart} ${result.message}` : emailPart });
                  closeEmailAction();
                }}
              />
            )}
          </li>
        );
      })}
      </ul>
    </div>
  );
}
