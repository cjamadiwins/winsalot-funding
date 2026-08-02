"use client";

import { useMemo, useState } from "react";
import { formatLeadgenBookingSlot, LEADGEN_BOOKING_TIMEZONE_LABEL, type LeadgenBookingDay } from "@/lib/leadgen-booking";
import { isValidEmail } from "@/lib/leadgen-types";
import { bookLeadgenAppointmentAction } from "./actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14.5px] text-slate-900";

export default function BookingPageClient({ slug, clientName, days }: { slug: string; clientName: string; days: LeadgenBookingDay[] }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(days[0]?.date ?? null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ date: string; time: string } | null>(null);

  const selectedDay = useMemo(() => days.find((d) => d.date === selectedDate) ?? null, [days, selectedDate]);
  const emailValid = !email || isValidEmail(email);
  const canSubmit = !!selectedDate && !!selectedTime && !!name.trim() && !!businessName.trim() && isValidEmail(email) && !!phone.trim();

  async function handleSubmit() {
    if (submitting || !canSubmit || !selectedDate || !selectedTime) return;
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("date", selectedDate);
    formData.set("time", selectedTime);
    formData.set("name", name.trim());
    formData.set("business_name", businessName.trim());
    formData.set("email", email.trim());
    formData.set("phone", phone.trim());

    const result = await bookLeadgenAppointmentAction(slug, formData);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setBooked({ date: selectedDate, time: selectedTime });
  }

  if (days.length === 0) {
    return (
      <PageShell clientName={clientName}>
        <p className="text-[14.5px] text-slate-600">
          There are no available times right now. Please reply to the email that brought you here and we&apos;ll find a time together.
        </p>
      </PageShell>
    );
  }

  if (booked) {
    return (
      <PageShell clientName={clientName}>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="text-[15px] font-semibold text-emerald-900">You&apos;re booked!</p>
          <p className="mt-2 text-[14.5px] text-emerald-800">
            {formatLeadgenBookingSlot(booked.date, booked.time)}
          </p>
          <p className="mt-3 text-[13.5px] text-emerald-700">A confirmation email is on its way to {email}.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell clientName={clientName}>
      <div className="space-y-5">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">1. Choose a date</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {days.map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => {
                  setSelectedDate(day.date);
                  setSelectedTime(null);
                }}
                className={`rounded-lg border px-3.5 py-2 text-[13.5px] font-medium transition ${
                  selectedDate === day.date ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 text-slate-700 hover:border-sky-400"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        {selectedDay && (
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
              2. Choose a time ({LEADGEN_BOOKING_TIMEZONE_LABEL})
            </h2>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {selectedDay.times.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => setSelectedTime(time)}
                  className={`rounded-lg border px-3 py-2 text-[13.5px] font-medium transition ${
                    selectedTime === time ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 text-slate-700 hover:border-sky-400"
                  }`}
                >
                  {formatLeadgenBookingSlot(selectedDay.date, time).split(" at ")[1]}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedTime && (
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">3. Your details</h2>
            <div className="mt-2 space-y-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Your Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Business Name</span>
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
                {!emailValid && <span className="text-[12px] text-rose-600">Enter a valid email address.</span>}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-slate-600">Phone Number</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className={inputClass} />
              </label>
            </div>
          </div>
        )}

        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13.5px] font-medium text-rose-700">{error}</p>}

        {selectedTime && (
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
            className="w-full rounded-full bg-sky-600 px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Booking…" : `Book ${selectedDay ? formatLeadgenBookingSlot(selectedDay.date, selectedTime) : ""}`}
          </button>
        )}
      </div>
    </PageShell>
  );
}

function PageShell({ clientName, children }: { clientName: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-sky-600">{clientName}</p>
        <h1 className="mt-1 text-[22px] font-bold text-slate-900">Book Your Free 15-Minute Appointment</h1>
        <p className="mt-2 text-[14.5px] text-slate-600">Pick a time that works for you - we&apos;ll take it from there.</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
