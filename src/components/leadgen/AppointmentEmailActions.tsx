"use client";

import { useState } from "react";
import { LEADGEN_EMAIL_STATUS_LABELS, LEADGEN_EMAIL_STATUS_STYLES, leadgenEmailStatusAt, type LeadgenEmailRow } from "@/lib/leadgen-types";
import AppointmentEmailConfirmModal from "./AppointmentEmailConfirmModal";

// SMS reminder display status (leadgenSmsReminderDisplayStatus) - the
// fuller "Scheduled, Sent, Delivered, Failed, Skipped or Opted Out" set
// from the brief, distinct from the three-state email styling above.
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

// "Resend Appointment Notification" / "Send Appointment Reminder" (brief
// EMAIL FEATURES #3-6) - shared by the Lead Detail page's Appointments
// section, the admin Appointments page, and the agent Appointments page,
// so the confirmation window, in-flight disabling, and success/failure
// messaging behave identically everywhere they appear. `email` must
// already be the lead's latest saved address (resolved by the caller,
// e.g. lead.email) - the server action re-verifies this independently
// before sending, this is only what the confirmation window shows.
export default function AppointmentEmailActions({
  appointmentId,
  businessName,
  contactName,
  email,
  appointmentDate,
  appointmentTime,
  timezone,
  latestEmail,
  automaticReminderStatus24h,
  automaticReminderError24h,
  automaticReminderStatus1h,
  automaticReminderError1h,
  smsReminderStatus24h,
  smsReminderError24h,
  smsReminderStatus1h,
  smsReminderError1h,
  isAdmin,
  onResend,
  onReminder,
}: {
  appointmentId: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  appointmentDate: string;
  appointmentTime: string;
  timezone: string;
  // Most recent leadgen_emails row for this appointment (if any) - shown
  // as a status badge so both admins and the assigned agent can see the
  // last resend/reminder's delivery status at a glance (brief: "Show the
  // most recent appointment-email status to both administrators and the
  // assigned agent").
  latestEmail?: LeadgenEmailRow | null;
  // Server-computed labels for the automatic 24-hour and 1-hour prospect
  // reminders (brief "EMAIL TRACKING": "Show: Scheduled / Sent /
  // Delivered / Bounced / Failed") - "Scheduled" means eligible and not
  // yet claimed, "Not scheduled" means automatic reminders are off or
  // this appointment isn't eligible (already past, too far out, or not
  // Booked/Confirmed). Two independent slots, shown as two badges, since
  // they can succeed/fail independently of each other.
  automaticReminderStatus24h?: string | null;
  automaticReminderError24h?: string | null;
  automaticReminderStatus1h?: string | null;
  automaticReminderError1h?: string | null;
  // SMS counterpart (src/lib/leadgen-appointment-reminders.ts's
  // fetchLeadgenAppointmentSmsReminderStatusMap) - the fuller Scheduled/
  // Sending/Sent/Delivered/Failed/Skipped/Opted Out/Not scheduled set.
  smsReminderStatus24h?: string | null;
  smsReminderError24h?: string | null;
  smsReminderStatus1h?: string | null;
  smsReminderError1h?: string | null;
  // Gates the "Count this as the 24-hour reminder" checkbox (brief
  // MANUAL CONTROLS: admin-only).
  isAdmin?: boolean;
  onResend: (appointmentId: string) => Promise<{ error?: string } | void>;
  onReminder: (appointmentId: string, countAsAutomaticReminder: boolean) => Promise<{ error?: string } | void>;
}) {
  const [mode, setMode] = useState<"resend" | "reminder" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setMode("resend");
          }}
          className="text-[12px] font-semibold text-sky-600 hover:text-sky-700"
        >
          Resend Appointment Notification
        </button>
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setMode("reminder");
          }}
          className="text-[12px] font-semibold text-sky-600 hover:text-sky-700"
        >
          Send Appointment Reminder
        </button>
      </div>

      {latestEmail && (
        <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[latestEmail.status]}`}>
          Last appointment email: {LEADGEN_EMAIL_STATUS_LABELS[latestEmail.status]} ({new Date(leadgenEmailStatusAt(latestEmail)).toLocaleString()})
        </span>
      )}

      {automaticReminderStatus24h && (
        <span
          className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
          title={automaticReminderError24h ?? undefined}
        >
          Automatic 24h reminder: {automaticReminderStatus24h}
        </span>
      )}

      {automaticReminderStatus1h && (
        <span
          className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
          title={automaticReminderError1h ?? undefined}
        >
          Automatic 1h reminder: {automaticReminderStatus1h}
        </span>
      )}

      {smsReminderStatus24h && (
        <span
          className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${SMS_STATUS_STYLE[smsReminderStatus24h] ?? SMS_STATUS_STYLE.default}`}
          title={smsReminderError24h ?? undefined}
        >
          SMS 24h reminder: {smsReminderStatus24h}
        </span>
      )}

      {smsReminderStatus1h && (
        <span
          className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${SMS_STATUS_STYLE[smsReminderStatus1h] ?? SMS_STATUS_STYLE.default}`}
          title={smsReminderError1h ?? undefined}
        >
          SMS 1h reminder: {smsReminderStatus1h}
        </span>
      )}

      {message && <span className="text-[11.5px] font-medium text-emerald-700">{message}</span>}

      {mode && (
        <AppointmentEmailConfirmModal
          mode={mode}
          businessName={businessName}
          contactName={contactName}
          email={email}
          appointmentDate={appointmentDate}
          appointmentTime={appointmentTime}
          timezone={timezone}
          showCountAsAutomaticReminder={isAdmin}
          onClose={() => setMode(null)}
          onConfirm={(countAsAutomaticReminder) => (mode === "reminder" ? onReminder(appointmentId, countAsAutomaticReminder) : onResend(appointmentId))}
          onSent={() => {
            setMessage(mode === "reminder" ? "Reminder sent." : "Confirmation resent.");
            setMode(null);
          }}
        />
      )}
    </div>
  );
}
