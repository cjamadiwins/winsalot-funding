"use client";

import { useMemo, useState } from "react";
import { formatLeadgenSlotLabel, type LeadgenBookingSlot } from "@/lib/leadgen-scheduling";
import { LEADGEN_APPOINTMENT_STATUS_STYLES, type LeadgenAppointmentRow } from "@/lib/leadgen-types";
import { cancelLeadgenAppointmentAction, rescheduleLeadgenAppointmentAction } from "./actions";

export default function ManageAppointmentClient({
  token,
  clientName,
  appointment,
  availableSlots,
}: {
  token: string;
  clientName: string;
  appointment: LeadgenAppointmentRow;
  availableSlots: LeadgenBookingSlot[];
}) {
  const [mode, setMode] = useState<"view" | "reschedule" | "cancel">("view");
  const [current, setCurrent] = useState(appointment);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const dates = useMemo(() => Array.from(new Set(availableSlots.map((s) => s.date))), [availableSlots]);
  const timesForSelectedDate = selectedDate ? availableSlots.filter((s) => s.date === selectedDate) : [];

  async function handleReschedule() {
    if (submitting || !selectedDate || !selectedTime) return;
    setSubmitting(true);
    setError(null);
    const result = await rescheduleLeadgenAppointmentAction(token, selectedDate, selectedTime);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCurrent({ ...current, appointment_date: selectedDate, appointment_time: selectedTime, status: "Rescheduled" });
    setMode("view");
    setMessage("Your consultation has been rescheduled. We've sent you a confirmation email.");
  }

  async function handleCancel() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await cancelLeadgenAppointmentAction(token);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCurrent({ ...current, status: "Cancelled" });
    setMode("view");
    setMessage("Your consultation has been cancelled.");
  }

  const isCancelled = current.status === "Cancelled";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{clientName}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Your Consultation</h1>
        </div>

        {message && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13.5px] text-emerald-800">{message}</p>}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_APPOINTMENT_STATUS_STYLES[current.status]}`}>{current.status}</span>
          </div>
          <dl className="mt-4 space-y-2 text-[14px]">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Date &amp; Time</dt>
              <dd className="text-right font-semibold text-slate-900">
                {formatLeadgenSlotLabel(current.appointment_date, current.appointment_time)} ({current.timezone})
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Business</dt>
              <dd className="text-right font-medium text-slate-900">{current.business_name}</dd>
            </div>
          </dl>

          {!isCancelled && mode === "view" && (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setMode("reschedule")}
                className="rounded-full bg-sky-600 px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-sky-700"
              >
                Reschedule
              </button>
              <button
                type="button"
                onClick={() => setMode("cancel")}
                className="rounded-full border border-rose-300 px-5 py-2.5 text-[13.5px] font-semibold text-rose-700 hover:border-rose-400"
              >
                Cancel Appointment
              </button>
            </div>
          )}

          {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13.5px] text-rose-700">{error}</p>}

          {mode === "reschedule" && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Choose a new date</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {dates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => {
                      setSelectedDate(date);
                      setSelectedTime(null);
                    }}
                    className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                      selectedDate === date ? "bg-sky-600 text-white" : "border border-slate-300 text-slate-700 hover:border-sky-400"
                    }`}
                  >
                    {formatLeadgenSlotLabel(date, "09:00").split(" at ")[0]}
                  </button>
                ))}
              </div>

              {selectedDate && (
                <>
                  <h2 className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Choose a new time</h2>
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {timesForSelectedDate.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => setSelectedTime(slot.time)}
                        className={`rounded-lg px-3 py-2.5 text-[13px] font-semibold transition ${
                          selectedTime === slot.time ? "bg-sky-600 text-white" : "border border-slate-300 text-slate-700 hover:border-sky-400"
                        }`}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!selectedDate || !selectedTime || submitting}
                  onClick={handleReschedule}
                  className="rounded-full bg-sky-600 px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Confirm New Time"}
                </button>
                <button type="button" disabled={submitting} onClick={() => setMode("view")} className="text-[13px] font-semibold text-slate-500 hover:text-slate-700">
                  Back
                </button>
              </div>
            </div>
          )}

          {mode === "cancel" && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-[14px] text-slate-700">Are you sure you want to cancel this consultation?</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleCancel}
                  className="rounded-full bg-rose-600 px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Cancelling…" : "Yes, Cancel It"}
                </button>
                <button type="button" disabled={submitting} onClick={() => setMode("view")} className="text-[13px] font-semibold text-slate-500 hover:text-slate-700">
                  Never mind
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
