"use client";

import { useMemo, useState } from "react";
import { generateAvailableSlots, formatLeadgenSlotLabel } from "@/lib/leadgen-scheduling";
import { isValidEmail } from "@/lib/leadgen-types";
import { submitConsultationBookingAction } from "./actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-3 text-[15px] text-slate-900";

export default function BookConsultationClient({
  clientName,
  clientSlug,
  bookedSlots,
}: {
  clientName: string;
  clientSlug: string;
  bookedSlots: { date: string; time: string; status: string }[];
}) {
  const slots = useMemo(() => generateAvailableSlots(bookedSlots), [bookedSlots]);
  const dates = useMemo(() => Array.from(new Set(slots.map((s) => s.date))), [slots]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ date: string; time: string; timezone: string } | null>(null);

  const timesForSelectedDate = selectedDate ? slots.filter((s) => s.date === selectedDate) : [];
  const emailValid = isValidEmail(email);
  const canSubmit = selectedDate && selectedTime && contactName.trim() && businessName.trim() && emailValid && phone.trim();

  async function handleSubmit() {
    if (submitting || !canSubmit || !selectedDate || !selectedTime) return;
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("contact_name", contactName);
    formData.set("business_name", businessName);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("appointment_date", selectedDate);
    formData.set("appointment_time", selectedTime);

    const result = await submitConsultationBookingAction(clientSlug, formData);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirmed({ date: result.appointmentDate, time: result.appointmentTime, timezone: result.timezone });
  }

  if (confirmed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
        <div className="max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">{clientName}</p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">You&rsquo;re booked!</h1>
          <p className="mt-3 text-[15px] text-slate-700">Your free 15-minute consultation is confirmed for:</p>
          <p className="mt-2 text-[17px] font-bold text-emerald-800">{formatLeadgenSlotLabel(confirmed.date, confirmed.time)}</p>
          <p className="mt-1 text-[13px] text-slate-500">({confirmed.timezone})</p>
          <p className="mt-4 text-[13.5px] text-slate-600">
            We&rsquo;ve sent a confirmation email with a link to reschedule or cancel if you need to.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{clientName}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Book Your Free 15-Minute Consultation</h1>
          <p className="mt-2 text-[14px] text-slate-600">No obligation, no cost - just pick a time that works for you.</p>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">1. Choose a date</h2>
          {dates.length === 0 ? (
            <p className="mt-3 text-[14px] text-slate-500">No availability right now - please contact us directly.</p>
          ) : (
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
          )}

          {selectedDate && (
            <>
              <h2 className="mt-6 text-[12px] font-semibold uppercase tracking-wide text-slate-500">2. Choose a time</h2>
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

          {selectedDate && selectedTime && (
            <>
              <h2 className="mt-6 text-[12px] font-semibold uppercase tracking-wide text-slate-500">3. Your details</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-600">Full Name</span>
                  <input value={contactName} onChange={(e) => setContactName(e.target.value)} required className={inputClass} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-600">Business Name</span>
                  <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className={inputClass} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-600">Email</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
                  {email && !emailValid && <span className="text-[12px] text-rose-600">Enter a valid email address.</span>}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-600">Phone</span>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className={inputClass} />
                </label>
              </div>

              {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13.5px] text-rose-700">{error}</p>}

              <button
                type="button"
                disabled={!canSubmit || submitting}
                onClick={handleSubmit}
                className="mt-5 w-full rounded-full bg-emerald-600 px-5 py-3.5 text-[15px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {submitting ? "Booking…" : `Confirm ${formatLeadgenSlotLabel(selectedDate, selectedTime)}`}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
