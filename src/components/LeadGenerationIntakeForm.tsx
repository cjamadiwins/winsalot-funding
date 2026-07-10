"use client";

import { useState, type FormEvent, type ReactNode } from "react";

type FormState = {
  businessName: string;
  contactPerson: string;
  businessEmail: string;
  phoneNumber: string;
  businessWebsite: string;
  targetIndustry: string;
  servicesToPromote: string;
  leadsPerMonth: string;
  preferredStartDate: string;
  additionalNotes: string;
};

const initialState: FormState = {
  businessName: "",
  contactPerson: "",
  businessEmail: "",
  phoneNumber: "",
  businessWebsite: "",
  targetIndustry: "",
  servicesToPromote: "",
  leadsPerMonth: "",
  preferredStartDate: "",
  additionalNotes: "",
};

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-[13px] font-sans text-[14.5px]";

const SUCCESS_MESSAGE =
  "Thank you! Your request has been received. A Winsalot Corp representative will contact you within one business day.";

export default function LeadGenerationIntakeForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const update =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSuccess(false);
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      const res = await fetch("/api/lead-generation-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Something went wrong. Please try again.");
      }
      setForm(initialState);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-xl">
      {success && (
        <div className="mb-6 rounded-xl bg-[var(--color-green-soft)] px-4 py-3 text-[14px] font-medium text-[var(--color-green-soft-text)]">
          {SUCCESS_MESSAGE}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <Field label="Business Name">
          <input
            required
            value={form.businessName}
            onChange={update("businessName")}
            className={inputClass}
          />
        </Field>
        <Field label="Contact Person">
          <input
            required
            value={form.contactPerson}
            onChange={update("contactPerson")}
            className={inputClass}
          />
        </Field>
        <Field label="Business Email">
          <input
            required
            type="email"
            value={form.businessEmail}
            onChange={update("businessEmail")}
            className={inputClass}
          />
        </Field>
        <Field label="Phone Number">
          <input
            required
            type="tel"
            value={form.phoneNumber}
            onChange={update("phoneNumber")}
            className={inputClass}
          />
        </Field>
        <Field label="Business Website" optional>
          <input
            type="text"
            placeholder="www.yourbusiness.com"
            value={form.businessWebsite}
            onChange={update("businessWebsite")}
            className={inputClass}
          />
        </Field>
        <Field label="Target Industry">
          <input
            required
            placeholder="e.g. Home Services, Retail"
            value={form.targetIndustry}
            onChange={update("targetIndustry")}
            className={inputClass}
          />
        </Field>
        <Field label="Services to Promote">
          <input
            required
            placeholder="e.g. Kitchen renovations, roofing"
            value={form.servicesToPromote}
            onChange={update("servicesToPromote")}
            className={inputClass}
          />
        </Field>
        <Field label="Number of Leads Required Per Month">
          <input
            required
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={form.leadsPerMonth}
            onChange={update("leadsPerMonth")}
            className={inputClass}
          />
        </Field>
        <Field label="Preferred Start Date" optional>
          <input
            type="date"
            value={form.preferredStartDate}
            onChange={update("preferredStartDate")}
            className={inputClass}
          />
        </Field>
        <Field label="Additional Notes" optional>
          <textarea
            value={form.additionalNotes}
            onChange={update("additionalNotes")}
            rows={4}
            className={`${inputClass} resize-y`}
          />
        </Field>
      </div>

      {error && <div className="mt-3 text-[13px] font-medium text-red-600">{error}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-[22px] w-full rounded-full bg-[var(--color-accent)] py-[15px] text-center text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit Registration"}
      </button>
    </form>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13.5px] font-semibold text-[var(--color-ink-mute)]">
        {label}
        {optional && (
          <span className="ml-1.5 font-normal text-[var(--color-text-faint)]">(optional)</span>
        )}
      </span>
      {children}
    </label>
  );
}
