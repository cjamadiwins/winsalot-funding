"use client";

import { useState } from "react";
import Image from "next/image";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS, type OpportunityType } from "@/lib/crm-types";
import { submitWinsalotContinueRequestAction } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14.5px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

const NEXT_STEPS = [
  "Confirm your business information",
  "Confirm the service and campaign package discussed during your consultation",
  "Provide your preferred target market and ideal customer profile",
  "Review the Winsalot Corp. service agreement",
  "Complete payment or deposit requirements where applicable",
  "Receive access to your client onboarding and dashboard",
];

export default function ContinueWithWinsalotClient() {
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceType, setServiceType] = useState<OpportunityType>("lead_generation");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || submitted) return; // guard against a double-click firing two requests
    setSubmitting(true);
    setError(null);

    const result = await submitWinsalotContinueRequestAction({
      contactName,
      businessName,
      email,
      phone,
      serviceType,
      notes,
    });

    if (result.error) {
      setSubmitting(false);
      setError(result.error);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <PageShell>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <h2 className="text-xl font-bold text-emerald-800">Thank you.</h2>
          <p className="mt-2 text-[15px] text-emerald-700">Your request has been received.</p>
          <p className="mt-2 text-[15px] text-emerald-700">Winsalot Corp. will prepare your next onboarding steps and contact you shortly.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <p className="text-[15px] text-slate-700">Thank you for speaking with Winsalot Corp.</p>
        <p className="mt-3 text-[15px] text-slate-700">
          If you&apos;re ready to move forward, the next step is to provide a few details so we can prepare your campaign, onboarding, and service
          agreement.
        </p>

        <h2 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">What Happens Next</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14.5px] text-slate-700">
          {NEXT_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
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
          <Labeled label="Service Interest">
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value as OpportunityType)} className={inputClass}>
              {OPPORTUNITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {OPPORTUNITY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Anything else we should know? (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputClass} resize-y`} />
          </Labeled>
        </div>

        {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-full bg-sky-600 px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Continue With Winsalot Corp."}
        </button>

        <p className="mt-4 text-center text-[12px] text-slate-500">
          Submitting this form does not guarantee any specific sales, revenue, or closed deals — it starts your onboarding conversation with our team.
        </p>
      </form>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="bg-[#1e3a8a] px-6 py-8 text-center text-white">
        <Image src="/winsalot-logo.png" alt="Winsalot Corp." width={160} height={48} className="mx-auto h-12 w-auto object-contain" priority />
        <p className="mt-3 text-sm font-medium text-sky-100">Empowering Businesses, One Solution at a Time.</p>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-center text-2xl font-bold text-slate-900 sm:text-[28px]">Continue With Winsalot Corp.</h1>
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
