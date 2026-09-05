"use client";

import { useState, useTransition } from "react";
import type { WinsalotAppointmentReminderSettingsRow, WinsalotAvailabilitySettingsRow, WinsalotBlackoutRow } from "@/lib/winsalot-consultation-types";
import {
  addWinsalotBlackoutAction,
  removeWinsalotBlackoutAction,
  updateWinsalotAvailabilityAction,
  updateWinsalotCompanySmsNumberAction,
} from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClass =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ConsultationAvailabilityClient({
  settings,
  blackouts,
  reminderSettings,
}: {
  settings: WinsalotAvailabilitySettingsRow;
  blackouts: WinsalotBlackoutRow[];
  reminderSettings: WinsalotAppointmentReminderSettingsRow;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(settings.available_weekdays);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [blackoutError, setBlackoutError] = useState<string | null>(null);
  const [companySmsError, setCompanySmsError] = useState<string | null>(null);
  const [companySmsSaved, setCompanySmsSaved] = useState(false);

  function toggleWeekday(day: number) {
    setSelectedWeekdays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()));
  }

  function handleSaveSettings(formData: FormData) {
    setError(null);
    setSaved(false);
    selectedWeekdays.forEach((d) => formData.append("available_weekdays", String(d)));
    startTransition(async () => {
      const result = await updateWinsalotAvailabilityAction(formData);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  function handleAddBlackout(formData: FormData) {
    setBlackoutError(null);
    startTransition(async () => {
      const result = await addWinsalotBlackoutAction(formData);
      if (result.error) setBlackoutError(result.error);
    });
  }

  function handleRemoveBlackout(id: string) {
    startTransition(async () => {
      await removeWinsalotBlackoutAction(id);
    });
  }

  function handleSaveCompanySmsNumber(formData: FormData) {
    setCompanySmsError(null);
    setCompanySmsSaved(false);
    startTransition(async () => {
      const result = await updateWinsalotCompanySmsNumberAction(formData);
      if (result.error) setCompanySmsError(result.error);
      else setCompanySmsSaved(true);
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Consultation Availability</h1>
      <p className="mt-1 text-sm text-slate-500">
        Controls the schedule offered on the public booking page (/book-consultation) and the agent/admin
        &quot;Book Consultation&quot; action. Appointments are always 15 minutes long.
      </p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Schedule</h2>
        <form action={handleSaveSettings} className="mt-4 space-y-4">
          <div>
            <span className="text-sm font-medium text-slate-800">Available Weekdays</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                    selectedWeekdays.includes(day) ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Labeled label="Business Start Time">
              <input type="time" name="business_start_time" defaultValue={settings.business_start_time.slice(0, 5)} required className={inputClass} />
            </Labeled>
            <Labeled label="Business End Time">
              <input type="time" name="business_end_time" defaultValue={settings.business_end_time.slice(0, 5)} required className={inputClass} />
            </Labeled>
            <Labeled label="Business Timezone">
              <input name="business_timezone" defaultValue={settings.business_timezone} required className={inputClass} />
            </Labeled>
            <Labeled label="Buffer Time Between Appointments (minutes)">
              <input type="number" name="buffer_minutes" min={0} defaultValue={settings.buffer_minutes} required className={inputClass} />
            </Labeled>
            <Labeled label="Minimum Advance Notice (minutes)">
              <input type="number" name="min_notice_minutes" min={0} defaultValue={settings.min_notice_minutes} required className={inputClass} />
            </Labeled>
            <Labeled label="Maximum Future Booking Range (days)">
              <input type="number" name="max_advance_days" min={1} defaultValue={settings.max_advance_days} required className={inputClass} />
            </Labeled>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          {saved && !error && <p className="text-sm font-medium text-emerald-600">Settings saved.</p>}

          <button type="submit" disabled={isPending} className={buttonClass}>
            Save Schedule
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Company SMS Notification Number</h2>
        <p className="mt-1 text-sm text-slate-500">
          Winsalot Corp&apos;s own phone number for Growth CRM consultation bookings — receives an immediate SMS the
          moment an appointment is booked, plus automatic 24-hour and 1-hour reminders. No client record is needed
          for Winsalot Corp to receive these; this number applies only to the Growth CRM.
        </p>
        <form action={handleSaveCompanySmsNumber} className="mt-4 flex flex-wrap items-end gap-3">
          <Labeled label="Company SMS Notification Number">
            <input
              name="company_sms_notification_number"
              defaultValue={reminderSettings.company_sms_notification_number ?? ""}
              placeholder="e.g. +14165551234"
              className={inputClass}
            />
          </Labeled>
          <button type="submit" disabled={isPending} className={buttonClass}>
            Save
          </button>
        </form>
        {companySmsError && <p className="mt-2 text-sm text-rose-600">{companySmsError}</p>}
        {companySmsSaved && !companySmsError && <p className="mt-2 text-sm font-medium text-emerald-600">Saved.</p>}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Blocked Dates &amp; Unavailable Periods</h2>
        <p className="mt-1 text-xs text-slate-500">
          To block an entire day, set Start to 12:00 AM and End to 12:00 AM the following day.
        </p>

        <form action={handleAddBlackout} className="mt-4 flex flex-wrap items-end gap-3">
          <Labeled label="Start">
            <input type="datetime-local" name="start_at" required className={inputClass} />
          </Labeled>
          <Labeled label="End">
            <input type="datetime-local" name="end_at" required className={inputClass} />
          </Labeled>
          <Labeled label="Reason (optional)">
            <input name="reason" placeholder="e.g. Statutory holiday" className={inputClass} />
          </Labeled>
          <button type="submit" disabled={isPending} className={buttonClass}>
            Add
          </button>
        </form>
        {blackoutError && <p className="mt-2 text-sm text-rose-600">{blackoutError}</p>}

        {blackouts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No blocked dates or periods configured.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {blackouts.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-3 text-sm">
                <div>
                  <span className="font-medium text-slate-900">
                    {new Date(b.start_at).toLocaleString()} — {new Date(b.end_at).toLocaleString()}
                  </span>
                  {b.reason && <span className="ml-2 text-slate-500">{b.reason}</span>}
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleRemoveBlackout(b.id)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {children}
    </label>
  );
}
