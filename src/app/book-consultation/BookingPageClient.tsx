"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS, type OpportunityType } from "@/lib/crm-types";
import { bookWinsalotConsultationAction } from "./actions";

export type WinsalotPrefill = {
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  serviceType: OpportunityType;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14.5px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

function groupSlotsByLocalDate(slotIsos: string[], timeZone: string) {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const labelFormatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
  const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });

  const groups = new Map<string, { label: string; slots: { iso: string; label: string }[] }>();
  for (const iso of slotIsos) {
    const date = new Date(iso);
    const key = dateFormatter.format(date);
    if (!groups.has(key)) groups.set(key, { label: labelFormatter.format(date), slots: [] });
    groups.get(key)!.slots.push({ iso, label: timeFormatter.format(date) });
  }
  return Array.from(groups.entries()).map(([key, value]) => ({ key, ...value }));
}

export default function BookingPageClient({
  slotIsos,
  businessTimezone,
  prefillToken,
  prefill,
}: {
  slotIsos: string[];
  businessTimezone: string;
  prefillToken: string | null;
  prefill: WinsalotPrefill | null;
}) {
  const [prospectTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || businessTimezone;
    } catch {
      return businessTimezone;
    }
  });

  const days = useMemo(() => groupSlotsByLocalDate(slotIsos, prospectTimezone), [slotIsos, prospectTimezone]);
  const [selectedDay, setSelectedDay] = useState<string | null>(days[0]?.key ?? null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [contactName, setContactName] = useState(prefill?.contactName ?? "");
  const [businessName, setBusinessName] = useState(prefill?.businessName ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [smsConsent, setSmsConsent] = useState(false);
  const [serviceType, setServiceType] = useState<OpportunityType>(prefill?.serviceType ?? "lead_generation");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedAppointmentId, setConfirmedAppointmentId] = useState<string | null>(null);

  const selectedSlotLabel = useMemo(() => {
    if (!selectedSlot) return null;
    const date = new Date(selectedSlot);
    const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: prospectTimezone, weekday: "long", month: "long", day: "numeric" }).format(date);
    const timeLabel = new Intl.DateTimeFormat("en-US", { timeZone: prospectTimezone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(
      date
    );
    return `${dateLabel} at ${timeLabel}`;
  }, [selectedSlot, prospectTimezone]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || confirmedAppointmentId) return; // guard against a double-click firing two bookings
    if (!selectedSlot) {
      setError("Please choose an available date and time.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await bookWinsalotConsultationAction({
      prefillToken,
      contactName,
      businessName,
      email,
      phone,
      smsConsent,
      serviceType,
      notes,
      startUtcIso: selectedSlot,
      prospectTimezone,
    });

    if (result.error) {
      setSubmitting(false);
      setError(result.error);
      return;
    }

    setConfirmedAppointmentId(result.appointmentId ?? "booked");
  }

  if (confirmedAppointmentId) {
    return (
      <PageShell>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <h2 className="text-xl font-bold text-emerald-800">You&apos;re all set!</h2>
          <p className="mt-2 text-[15px] text-emerald-700">
            Your free 15-minute business consultation is confirmed for <strong>{selectedSlotLabel}</strong>.
          </p>
          <p className="mt-3 text-sm text-emerald-700">A confirmation email is on its way to {email}.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Choose a Date &amp; Time</h2>
          <p className="mt-1 text-xs text-slate-500">Times shown in your local timezone: {prospectTimezone.replace(/_/g, " ")}</p>

          {days.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No availability right now — please check back soon.</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {days.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => {
                      setSelectedDay(day.key);
                      setSelectedSlot(null);
                    }}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                      selectedDay === day.key ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {(days.find((d) => d.key === selectedDay)?.slots ?? []).map((slot) => (
                  <button
                    key={slot.iso}
                    type="button"
                    onClick={() => setSelectedSlot(slot.iso)}
                    className={`rounded-lg border px-2 py-2 text-[13px] font-medium transition ${
                      selectedSlot === slot.iso
                        ? "border-sky-600 bg-sky-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-sky-300"
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {selectedSlotLabel && (
            <div className="mt-5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-[13.5px] text-sky-900">
              <strong>Selected:</strong> {selectedSlotLabel} ({prospectTimezone.replace(/_/g, " ")})
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your Information</h2>
          <div className="mt-4 space-y-3">
            <Labeled label="Contact Name">
              <input required value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
            </Labeled>
            <Labeled label="Business Name">
              <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputClass} />
            </Labeled>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labeled label="Email">
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </Labeled>
              <Labeled label="Phone">
                <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
              </Labeled>
            </div>
            <label className="flex items-start gap-2 text-[12.5px] text-slate-600">
              <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} className="mt-0.5" />
              <span>Text me SMS reminders about this appointment (24 hours and 1 hour before). Reply STOP anytime to opt out.</span>
            </label>
            <Labeled label="Service Interest">
              <select value={serviceType} onChange={(e) => setServiceType(e.target.value as OpportunityType)} className={inputClass}>
                {OPPORTUNITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {OPPORTUNITY_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Notes (optional)">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputClass} resize-y`} />
            </Labeled>
          </div>

          {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !selectedSlot}
            className="mt-5 w-full rounded-full bg-sky-600 px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Booking…" : "Confirm My Free Consultation"}
          </button>
        </section>
      </form>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="bg-[#1e3a8a] px-6 py-8 text-center text-white">
        <Image src="/winsalot-logo.png" alt="Winsalot Corp" width={160} height={48} className="mx-auto h-12 w-auto object-contain" priority />
        <p className="mt-3 text-sm font-medium text-sky-100">Empowering Businesses, One Solution at a Time.</p>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-center text-2xl font-bold text-slate-900 sm:text-[28px]">Book a Free 15-Minute Business Consultation</h1>
        <p className="mt-2 text-center text-[15px] text-slate-600">
          Tell us a bit about your business and pick a time that works for you.
        </p>
        {children}
      </main>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
