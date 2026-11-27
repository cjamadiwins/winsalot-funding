"use client";

import { LEADGEN_MEETING_TYPES, type LeadgenCampaignRow, type LeadgenClientRow, type LeadgenLeadRow, type LeadgenUserRow } from "@/lib/leadgen-types";
import { SMS_CONSENT_NOTICE } from "@/lib/sms-notice";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900";

export type GuidedBooking = {
  // Prospect's preferred part of the day, from the call guide.
  preferredPart: "morning" | "afternoon" | null;
  // Primary service requirements recorded so far in the guide.
  requirements: string;
  // Error from the last attempt (qualification not ready, or the booking itself failed).
  error: string | null;
  // Things the qualification still needs before this can be saved.
  missing: string[];
  // True while the qualification save + booking are running.
  saving: boolean;
};

type Props = {
  lead: Pick<LeadgenLeadRow, "id" | "business_name" | "contact_name" | "phone" | "email">;
  client: Pick<LeadgenClientRow, "id" | "name">;
  campaign: Pick<LeadgenCampaignRow, "id"> | null;
  agents: Pick<LeadgenUserRow, "id" | "full_name">[];
  currentUserId: string;
  isAdmin: boolean;
  isPending: boolean;
  onBook: (formData: FormData) => void;
  // Present when opened from the call guide's BOOK APPOINTMENT button.
  guided?: GuidedBooking;
};

// The CRM's existing appointment scheduling form (the lead page's "Book
// Appointment"), used both there and from the call guide. It submits to the
// same booking action, so appointment approval, notifications and reminders
// work exactly as before. It never invents availability: the agent enters the
// date and time the prospect agrees to.
export default function AppointmentBookingForm({ lead, client, campaign, agents, currentUserId, isAdmin, isPending, onBook, guided }: Props) {
  const busy = isPending || Boolean(guided?.saving);
  return (
    <form
      // A form `action` resets every field after it runs, which would wipe the agent's
      // date, time and confirmations when a save is blocked or fails mid-call. The
      // guided form therefore submits through a handler and keeps what was typed.
      {...(guided
        ? {
            onSubmit: (e: React.FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              onBook(new FormData(e.currentTarget));
            },
          }
        : { action: onBook })}
      data-testid="appointment-booking-form" className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-3 sm:grid-cols-2 sm:p-4">
      <input type="hidden" name="lead_id" value={lead.id} />
      <input type="hidden" name="client_id" value={client.id} />
      {campaign && <input type="hidden" name="campaign_id" value={campaign.id} />}
      <input type="hidden" name="business_name" value={lead.business_name} />

      {guided && (guided.error || guided.missing.length > 0) && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 sm:col-span-2">
          {guided.error && <p className="font-semibold">{guided.error}</p>}
          {guided.missing.length > 0 && (
            <>
              <p className="font-semibold">Still needed before this can be saved (use &ldquo;Record remaining requirements&rdquo; below):</p>
              <ul className="mt-0.5 list-disc pl-5">
                {guided.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <p className="text-sm font-semibold text-slate-800 sm:col-span-2">Verify the contact details with the prospect</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-600">Contact Name</span>
        <input name="contact_name" defaultValue={lead.contact_name ?? ""} autoComplete="off" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-600">Phone Number</span>
        <input name="phone" type="tel" defaultValue={lead.phone ?? ""} autoComplete="off" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-semibold text-slate-600">Email</span>
        <input name="email" type="email" defaultValue={lead.email ?? ""} autoComplete="off" className={inputClass} />
      </label>

      <p className="text-sm font-semibold text-slate-800 sm:col-span-2">Date and time the prospect agrees to</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-600">Appointment Date</span>
        <input name="appointment_date" type="date" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-600">Appointment Time</span>
        <input name="appointment_time" type="time" required className={inputClass} />
      </label>
      {guided && (
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-slate-600">Prospect&apos;s preferred part of the day</span>
          <select name="time_preference" defaultValue={guided.preferredPart ?? ""} className={inputClass}>
            <option value="">No preference stated</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
          </select>
        </label>
      )}
      <p className="text-xs text-slate-500 sm:col-span-2">No availability calendar is connected for {client.name}, so no times are suggested. Enter only a date and time the prospect has agreed to.</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-600">Time Zone</span>
        <input name="timezone" defaultValue="America/Toronto" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-600">Meeting Type</span>
        <select name="meeting_type" defaultValue="Phone Call" className={inputClass}>
          {LEADGEN_MEETING_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-600">Meeting Link (optional)</span>
        <input name="meeting_link" type="url" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-600">Assigned Specialist</span>
        {isAdmin && agents.length > 0 ? (
          <select name="assigned_specialist_id" defaultValue={currentUserId} className={inputClass}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input type="hidden" name="assigned_specialist_id" value={currentUserId} />
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">You</span>
          </>
        )}
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-semibold text-slate-600">Primary service requirements (in the prospect&apos;s own words)</span>
        <textarea name="service_requirements" defaultValue={guided?.requirements ?? ""} rows={2} className={`${inputClass} min-h-[50px] resize-y`} />
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-semibold text-slate-600">Internal Appointment Notes</span>
        <textarea name="appointment_notes" className={`${inputClass} min-h-[50px] resize-y`} />
      </label>

      {guided && (
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 sm:col-span-2">
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" name="contact_verified" required className="mt-1 h-4 w-4" />
            <span>I verified the contact name, phone number and email address with the prospect.</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" name="appointment_confirmed" required className="mt-1 h-4 w-4" />
            <span>The prospect confirmed this date and time and accepted the consultation.</span>
          </label>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="hidden" name="notify_client" value="false" />
        <input
          type="checkbox"
          onChange={(e) => {
            const hidden = e.currentTarget.previousElementSibling as HTMLInputElement;
            hidden.value = e.currentTarget.checked ? "true" : "false";
          }}
          defaultChecked
        />
        Email the client a notification now
      </label>
      <p className="text-xs text-slate-500 sm:col-span-2">{SMS_CONSENT_NOTICE}</p>
      <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60 sm:col-span-2 sm:w-fit">
        {busy ? "Saving…" : guided ? "Save appointment" : "Book Appointment"}
      </button>
    </form>
  );
}
