"use client";

import { useState } from "react";
import { LEADGEN_EMAIL_STATUS_LABELS, LEADGEN_EMAIL_STATUS_STYLES, leadgenEmailStatusAt, type LeadgenEmailRow } from "@/lib/leadgen-types";
import AppointmentEmailConfirmModal from "./AppointmentEmailConfirmModal";

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
  onResend: (appointmentId: string) => Promise<{ error?: string } | void>;
  onReminder: (appointmentId: string) => Promise<{ error?: string } | void>;
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
          onClose={() => setMode(null)}
          onConfirm={() => (mode === "reminder" ? onReminder(appointmentId) : onResend(appointmentId))}
          onSent={() => {
            setMessage(mode === "reminder" ? "Reminder sent." : "Confirmation resent.");
            setMode(null);
          }}
        />
      )}
    </div>
  );
}
