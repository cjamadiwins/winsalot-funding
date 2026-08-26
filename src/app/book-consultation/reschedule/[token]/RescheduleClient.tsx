"use client";

import { useMemo, useState } from "react";
import { rescheduleWinsalotAppointmentAction } from "./actions";

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

export default function RescheduleClient({
  token,
  slotIsos,
  businessTimezone,
  currentStartUtcIso,
  contactName,
}: {
  token: string;
  slotIsos: string[];
  businessTimezone: string;
  currentStartUtcIso: string;
  contactName: string;
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const currentLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: prospectTimezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(currentStartUtcIso));

  const selectedLabel = selectedSlot
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: prospectTimezone,
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(selectedSlot))
    : null;

  async function handleSubmit() {
    if (submitting || done || !selectedSlot) return;
    setSubmitting(true);
    setError(null);
    const result = await rescheduleWinsalotAppointmentAction(token, selectedSlot, prospectTimezone);
    if (result.error) {
      setSubmitting(false);
      setError(result.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Shell>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <h2 className="text-lg font-bold text-emerald-800">Rescheduled!</h2>
          <p className="mt-2 text-sm text-emerald-700">Your new time is {selectedLabel}. A confirmation email is on its way.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm text-slate-600">Hi {contactName}, your consultation is currently scheduled for:</p>
      <p className="mt-1 font-semibold text-slate-900">{currentLabel}</p>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Choose a New Date &amp; Time</h2>
      <p className="mt-1 text-xs text-slate-500">Times shown in your local timezone: {prospectTimezone.replace(/_/g, " ")}</p>

      {days.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">No availability right now — please contact us directly.</p>
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
                  selectedSlot === slot.iso ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-sky-300"
                }`}
              >
                {slot.label}
              </button>
            ))}
          </div>
        </>
      )}

      {selectedLabel && (
        <div className="mt-5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-[13.5px] text-sky-900">
          <strong>New time:</strong> {selectedLabel}
        </div>
      )}

      {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}

      <button
        type="button"
        disabled={submitting || !selectedSlot}
        onClick={handleSubmit}
        className="mt-5 w-full rounded-full bg-sky-600 px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Confirm New Time"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-center text-lg font-bold text-slate-900">Reschedule Your Consultation</h1>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
