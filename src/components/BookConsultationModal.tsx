"use client";

import { useEffect, useState } from "react";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS, type OpportunityType } from "@/lib/crm-types";
import { SMS_CONSENT_NOTICE } from "@/lib/sms-notice";
import WinsalotSlotPicker from "./WinsalotSlotPicker";

export type BookConsultationInput = {
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  serviceType: OpportunityType;
  notes: string;
  startUtcIso: string;
};

export type BookConsultationResult = { error?: string; appointmentId?: string };

// Agent/admin "Book Consultation" action - available on every prospect-
// detail page. Uses the exact same availability/slot-generation and
// double-booking prevention as the public self-booking page
// (src/lib/winsalot-consultation-book.ts's performWinsalotBooking is the
// single shared core both booking methods call).
export default function BookConsultationModal({
  businessName,
  contactName,
  email,
  phone,
  opportunityType,
  getOfferedSlots,
  onBook,
  onClose,
  onBooked,
}: {
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string;
  opportunityType: OpportunityType;
  getOfferedSlots: () => Promise<{ slotIsos: string[]; businessTimezone: string }>;
  onBook: (input: BookConsultationInput) => Promise<BookConsultationResult>;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [slots, setSlots] = useState<{ slotIsos: string[]; businessTimezone: string } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [contactNameValue, setContactNameValue] = useState(contactName ?? "");
  const [businessNameValue, setBusinessNameValue] = useState(businessName);
  const [emailValue, setEmailValue] = useState(email ?? "");
  const [phoneValue, setPhoneValue] = useState(phone);
  const [serviceType, setServiceType] = useState<OpportunityType>(opportunityType);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOfferedSlots().then(setSlots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBook() {
    if (submitting || booked) return; // guard against a double-click firing two bookings
    if (!selectedSlot) {
      setError("Choose a date and time.");
      return;
    }
    if (!emailValue.trim()) {
      setError("Enter an email address.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await onBook({
      contactName: contactNameValue,
      businessName: businessNameValue,
      email: emailValue,
      phone: phoneValue,
      serviceType,
      notes,
      startUtcIso: selectedSlot,
    });

    if (result.error) {
      setSubmitting(false);
      setError(result.error);
      return;
    }

    setBooked(true);
    onBooked();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={submitting ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Book Consultation"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-slate-900">Book Consultation</h2>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-50">
            ✕
          </button>
        </div>

        {booked ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13.5px] font-medium text-emerald-700">
            Consultation booked for {contactNameValue}.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Date &amp; Time</h3>
              <div className="mt-2">
                {slots ? (
                  <WinsalotSlotPicker slotIsos={slots.slotIsos} businessTimezone={slots.businessTimezone} selected={selectedSlot} onSelect={setSelectedSlot} />
                ) : (
                  <p className="text-sm text-slate-500">Loading availability…</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labeled label="Contact Name">
                <input value={contactNameValue} onChange={(e) => setContactNameValue(e.target.value)} className={fieldClass} />
              </Labeled>
              <Labeled label="Business Name">
                <input value={businessNameValue} onChange={(e) => setBusinessNameValue(e.target.value)} className={fieldClass} />
              </Labeled>
              <Labeled label="Email">
                <input type="email" value={emailValue} onChange={(e) => setEmailValue(e.target.value)} className={fieldClass} />
              </Labeled>
              <Labeled label="Phone">
                <input value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} className={fieldClass} />
              </Labeled>
              <Labeled label="Service Type">
                <select value={serviceType} onChange={(e) => setServiceType(e.target.value as OpportunityType)} className={fieldClass}>
                  {OPPORTUNITY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {OPPORTUNITY_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </Labeled>
            </div>
            <p className="text-[12px] text-slate-500">{SMS_CONSENT_NOTICE}</p>
            <Labeled label="Notes (optional)">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${fieldClass} resize-y`} />
            </Labeled>

            {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={submitting || !selectedSlot}
                onClick={handleBook}
                className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Booking…" : "Book Consultation"}
              </button>
              <button type="button" disabled={submitting} onClick={onClose} className="text-[13.5px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const fieldClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
