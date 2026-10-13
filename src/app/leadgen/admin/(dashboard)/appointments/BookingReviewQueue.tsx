"use client";

import { useState, useTransition } from "react";
import { assignAppointmentCampaignAction, closeBookingReviewItemAction } from "./review-queue-actions";

export type NeedsCampaignAppointment = {
  id: string;
  client_id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  appointment_date: string;
  appointment_time: string;
  timezone: string;
};

export type BookingReviewItem = {
  id: string;
  created_at: string;
  reason: "client_not_matched" | "missing_start_time";
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  business_name: string | null;
  appointment_start: string | null;
  client_id: string | null;
};

type CampaignOption = { id: string; client_id: string; name: string };

const REASON_LABEL: Record<BookingReviewItem["reason"], string> = {
  client_not_matched: "Could not be matched to a client - book it by hand under the right client, then mark it resolved.",
  missing_start_time: "The booking had no start time - confirm the time with the prospect, book it by hand, then mark it resolved.",
};

const buttonClass = "rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

// Admin-only queue of automated bookings (public booking page / Calendly) that
// could not be filed under a campaign - or a client - from verified evidence.
// Nothing here has been assigned to a guessed campaign: appointments are saved
// with an empty campaign and stay out of every agent's view until an Admin
// picks the right one; unmatched Calendly payloads are kept untouched.
export default function BookingReviewQueue({
  needsCampaign,
  queueItems,
  clientNameById,
  campaigns,
}: {
  needsCampaign: NeedsCampaignAppointment[];
  queueItems: BookingReviewItem[];
  clientNameById: Record<string, string>;
  campaigns: CampaignOption[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (needsCampaign.length === 0 && queueItems.length === 0) return null;

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  return (
    <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5" aria-label="Bookings needing Admin review">
      <h2 className="text-base font-bold text-amber-900">Needs review ({needsCampaign.length + queueItems.length})</h2>
      <p className="mt-1 text-sm text-amber-900/80">
        These automated bookings couldn&apos;t be filed under a campaign (or client) from verified information, so they were kept here instead of being
        guessed. Agents can&apos;t see an appointment until it has a campaign.
      </p>
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {needsCampaign.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-amber-900">Upcoming appointments with no campaign</h3>
          <ul className="mt-2 space-y-2">
            {needsCampaign.map((appt) => {
              const options = campaigns.filter((c) => c.client_id === appt.client_id);
              return (
                <li key={appt.id} className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{appt.business_name}</span> - {appt.contact_name || "—"} ({appt.email || "no email"})
                    <div className="text-xs text-slate-500">
                      {clientNameById[appt.client_id] ?? "Unknown client"} · {appt.appointment_date} {appt.appointment_time.slice(0, 5)} ({appt.timezone})
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Campaign for ${appt.business_name}`}
                      value={chosen[appt.id] ?? ""}
                      onChange={(e) => setChosen((prev) => ({ ...prev, [appt.id]: e.target.value }))}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
                    >
                      <option value="" disabled>
                        {options.length === 0 ? "No active campaigns" : "Select a campaign…"}
                      </option>
                      {options.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={pending || !chosen[appt.id]}
                      onClick={() => run(() => assignAppointmentCampaignAction(appt.id, chosen[appt.id]))}
                      className={buttonClass}
                    >
                      Assign campaign
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {queueItems.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-amber-900">Calendly bookings that couldn&apos;t be filed</h3>
          <ul className="mt-2 space-y-2">
            {queueItems.map((item) => (
              <li key={item.id} className="rounded-xl border border-amber-200 bg-white p-3 text-sm text-slate-700">
                <div>
                  <span className="font-semibold text-slate-900">{item.business_name || item.contact_name || "Calendly booking"}</span> - {item.contact_name || "—"} (
                  {item.contact_email || "no email"}
                  {item.contact_phone ? `, ${item.contact_phone}` : ""})
                </div>
                <div className="text-xs text-slate-500">
                  {item.appointment_start ? new Date(item.appointment_start).toUTCString() : "No start time"} · received {new Date(item.created_at).toUTCString()}
                  {item.client_id ? ` · ${clientNameById[item.client_id] ?? "Unknown client"}` : ""}
                </div>
                <p className="mt-1 text-xs text-amber-900">{REASON_LABEL[item.reason]}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    aria-label="Resolution note"
                    placeholder="Note (optional)"
                    value={notes[item.id] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
                  />
                  <button type="button" disabled={pending} onClick={() => run(() => closeBookingReviewItemAction(item.id, "resolved", notes[item.id] ?? ""))} className={buttonClass}>
                    Mark resolved
                  </button>
                  <button type="button" disabled={pending} onClick={() => run(() => closeBookingReviewItemAction(item.id, "dismissed", notes[item.id] ?? ""))} className={buttonClass}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
