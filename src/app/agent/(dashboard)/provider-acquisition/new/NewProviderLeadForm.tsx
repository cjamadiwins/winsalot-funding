"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CANADIAN_PROVINCES_AND_TERRITORIES,
  PROVIDER_SERVICES_OFFERED,
  type ProviderDuplicateMatch,
} from "@/lib/provider-types";
import { createProviderLeadAction } from "../actions";

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-[15px]";

export default function NewProviderLeadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<ProviderDuplicateMatch[] | null>(null);

  function submit(ignoreDuplicateWarning: boolean) {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setError(null);

    startTransition(async () => {
      const result = await createProviderLeadAction(formData, ignoreDuplicateWarning);
      if (result.duplicates && result.duplicates.length > 0) {
        setDuplicates(result.duplicates);
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id) {
        router.push(`/agent/provider-acquisition/${result.id}?added=1`);
      }
    });
  }

  return (
    <div>
      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {duplicates && duplicates.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            A provider with similar information may already exist.
          </p>
          <ul className="mt-2 space-y-1.5 text-[13.5px] text-amber-800">
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/agent/provider-acquisition/${d.id}`}
                  className="font-semibold underline hover:text-amber-900"
                >
                  {d.business_name}
                </Link>
                {d.contact_person ? ` · ${d.contact_person}` : ""} · {d.phone}
                {d.email ? ` · ${d.email}` : ""} · {d.status}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() => submit(true)}
              className="rounded-full bg-amber-700 px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
            >
              Create Anyway
            </button>
            <button
              type="button"
              onClick={() => setDuplicates(null)}
              className="rounded-full border border-amber-300 px-4 py-2 text-[13px] font-semibold text-amber-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        className="mt-6 max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Business Name" required>
            <input name="business_name" required className={inputClass} />
          </Field>
          <Field label="Contact Person">
            <input name="contact_person" className={inputClass} />
          </Field>
          <Field label="Phone Number" required>
            <input name="phone" type="tel" required className={inputClass} />
          </Field>
          <Field label="Email Address">
            <input name="email" type="email" className={inputClass} />
          </Field>
          <Field label="City" required>
            <input name="city" required className={inputClass} />
          </Field>
          <Field label="Province" required>
            <select name="province" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select a province or territory…
              </option>
              {CANADIAN_PROVINCES_AND_TERRITORIES.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Website">
            <input name="website" type="url" placeholder="https://" className={inputClass} />
          </Field>
          <Field label="Years in Business">
            <input name="years_in_business" placeholder="e.g. 8" className={inputClass} />
          </Field>
          <Field label="Lead Source">
            <input
              name="lead_source"
              placeholder="e.g. Referral, Cold call, Website"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-4">
          <span className="text-[13px] font-semibold text-[var(--color-ink-mute)]">
            Services Offered <span className="text-red-600">*</span>
          </span>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROVIDER_SERVICES_OFFERED.map((service) => (
              <label key={service} className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" name="services_offered" value={service} />
                {service}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <Field label="Notes">
            <textarea
              name="notes"
              placeholder="What did the provider say?"
              className={`${inputClass} min-h-[100px] resize-y`}
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="mt-6 w-full rounded-full bg-[var(--color-accent)] px-6 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
        >
          Save Provider Lead
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[var(--color-ink-mute)]">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
    </label>
  );
}
