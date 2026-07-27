"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  CANADIAN_PROVINCES_AND_TERRITORIES,
  PROVIDER_SERVICES_OFFERED,
} from "@/lib/provider-types";

type FormState = {
  businessName: string;
  contactPerson: string;
  email: string;
  phone: string;
  city: string;
  province: string;
  website: string;
  servicesOffered: string[];
  yearsInBusiness: string;
  notes: string;
  // Honeypot - real visitors never see or fill this field.
  companyFax: string;
};

const initialState: FormState = {
  businessName: "",
  contactPerson: "",
  email: "",
  phone: "",
  city: "",
  province: "",
  website: "",
  servicesOffered: [],
  yearsInBusiness: "",
  notes: "",
  companyFax: "",
};

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-[13px] font-sans text-[14.5px]";

const SUCCESS_MESSAGE =
  "Thank you! Your provider intake form has been submitted. Our team will review your information and contact you regarding suitable opportunities.";

export default function ProviderIntakeForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const update =
    (field: keyof Omit<FormState, "servicesOffered">) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setSuccess(false);
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const toggleService = (service: string) => {
    setSuccess(false);
    setForm((prev) => ({
      ...prev,
      servicesOffered: prev.servicesOffered.includes(service)
        ? prev.servicesOffered.filter((s) => s !== service)
        : [...prev.servicesOffered, service],
    }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSuccess(false);

    if (form.servicesOffered.length === 0) {
      setError("Select at least one service your company offers.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/provider-intake", {
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

      <input
        type="text"
        name="companyFax"
        value={form.companyFax}
        onChange={update("companyFax")}
        tabIndex={-1}
        autoComplete="off"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
        aria-hidden="true"
      />

      <div className="flex flex-col gap-4">
        <Field label="Business Name">
          <input
            required
            value={form.businessName}
            onChange={update("businessName")}
            className={inputClass}
          />
        </Field>
        <Field label="Contact Person" optional>
          <input
            value={form.contactPerson}
            onChange={update("contactPerson")}
            className={inputClass}
          />
        </Field>
        <Field label="Phone Number">
          <input
            required
            type="tel"
            value={form.phone}
            onChange={update("phone")}
            className={inputClass}
          />
        </Field>
        <Field label="Email Address" optional>
          <input type="email" value={form.email} onChange={update("email")} className={inputClass} />
        </Field>
        <Field label="City">
          <input required value={form.city} onChange={update("city")} className={inputClass} />
        </Field>
        <Field label="Province / Territory">
          <select
            required
            value={form.province}
            onChange={update("province")}
            className={inputClass}
          >
            <option value="" disabled>
              Select a province or territory
            </option>
            {CANADIAN_PROVINCES_AND_TERRITORIES.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Business Website" optional>
          <input
            type="text"
            placeholder="www.yourbusiness.com"
            value={form.website}
            onChange={update("website")}
            className={inputClass}
          />
        </Field>

        <div>
          <span className="text-[13.5px] font-semibold text-[var(--color-ink-mute)]">
            Services Offered
          </span>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROVIDER_SERVICES_OFFERED.map((service) => (
              <label
                key={service}
                className="flex items-center gap-2 rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-[13.5px]"
              >
                <input
                  type="checkbox"
                  checked={form.servicesOffered.includes(service)}
                  onChange={() => toggleService(service)}
                />
                {service}
              </label>
            ))}
          </div>
        </div>

        <Field label="Years in Business" optional>
          <input
            value={form.yearsInBusiness}
            onChange={update("yearsInBusiness")}
            className={inputClass}
          />
        </Field>
        <Field label="Additional Information" optional>
          <textarea
            value={form.notes}
            onChange={update("notes")}
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
        {submitting ? "Submitting…" : "Submit Intake Form"}
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
