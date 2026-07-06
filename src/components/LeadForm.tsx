"use client";

import { useState, type FormEvent } from "react";

type FormState = {
  businessName: string;
  contactName: string;
  monthlyRevenue: string;
  phone: string;
  email: string;
};

const initialState: FormState = {
  businessName: "",
  contactName: "",
  monthlyRevenue: "",
  phone: "",
  email: "",
};

export default function LeadForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Something went wrong. Please try again.");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="px-1 py-6 text-center">
        <div className="mx-auto mb-[18px] flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-green-soft)] text-[22px] text-[var(--color-green-soft-text)]">
          ✓
        </div>
        <div className="mb-2 font-heading text-[19px] font-bold">Request received</div>
        <div className="text-sm leading-[1.5] text-[var(--color-text-muted-2)]">
          A funding specialist will reach out shortly to go over your options.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-1.5 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">
        See what you qualify for
      </div>
      <div className="mb-2 text-[13.5px] leading-[1.5] text-[var(--color-text-muted)]">
        Takes under 2 minutes. No impact on your credit score.
      </div>
      <div className="mb-5 rounded-xl bg-[var(--color-accent-soft)] px-3.5 py-3 text-[12.5px] font-semibold leading-[1.5] text-[var(--color-accent-soft-text-2)]">
        To qualify: at least $20,000 in monthly revenue and 6 months in business.
      </div>
      <div className="flex flex-col gap-3">
        <input
          required
          value={form.businessName}
          onChange={update("businessName")}
          placeholder="Business name"
          className="w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-[13px] font-sans text-[14.5px]"
        />
        <input
          required
          value={form.contactName}
          onChange={update("contactName")}
          placeholder="Director's name"
          className="w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-[13px] font-sans text-[14.5px]"
        />
        <input
          required
          value={form.monthlyRevenue}
          onChange={update("monthlyRevenue")}
          placeholder="Monthly revenue ($)"
          inputMode="numeric"
          className="w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-[13px] font-sans text-[14.5px]"
        />
        <input
          required
          value={form.phone}
          onChange={update("phone")}
          placeholder="Phone number"
          type="tel"
          className="w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-[13px] font-sans text-[14.5px]"
        />
        <input
          required
          value={form.email}
          onChange={update("email")}
          placeholder="Email address"
          type="email"
          className="w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-[13px] font-sans text-[14.5px]"
        />
      </div>
      {error && (
        <div className="mt-3 text-[13px] font-medium text-red-600">{error}</div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="mt-[18px] w-full rounded-full bg-[var(--color-accent)] py-[15px] text-center text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Check My Eligibility"}
      </button>
    </form>
  );
}
