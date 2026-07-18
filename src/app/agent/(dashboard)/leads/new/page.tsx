import type { ReactNode } from "react";
import { createLeadAction } from "./actions";

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-[15px]";

export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div>
      <h1 className="font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">
        Add Lead
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Enter the cleaning details for a new interested lead. It will be assigned to you.
      </p>

      <form
        action={createLeadAction}
        className="mt-6 max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 sm:p-6"
      >
        {params.error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {params.error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Business or Customer Name" required>
            <input name="business_name" required className={inputClass} />
          </Field>
          <Field label="Contact Person">
            <input name="contact_name" className={inputClass} />
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
          <Field label="Full Service Address">
            <input name="service_address" className={inputClass} />
          </Field>
          <Field label="Cleaning Service Requested" required>
            <input
              name="service_requested"
              required
              placeholder="e.g. Weekly office cleaning"
              className={inputClass}
            />
          </Field>
          <Field label="Facility / Property Type">
            <input
              name="property_type"
              placeholder="e.g. Office, Retail, Warehouse"
              className={inputClass}
            />
          </Field>
          <Field label="Approximate Size">
            <input name="approximate_size" placeholder="e.g. 5,000 sq ft" className={inputClass} />
          </Field>
          <Field label="Cleaning Frequency">
            <input
              name="cleaning_frequency"
              placeholder="e.g. Weekly, One-time"
              className={inputClass}
            />
          </Field>
          <Field label="Preferred Start Date">
            <input name="preferred_start_date" type="date" className={inputClass} />
          </Field>
          <Field label="Best Time to Contact">
            <input
              name="best_time_to_contact"
              placeholder="e.g. Weekday mornings"
              className={inputClass}
            />
          </Field>
          <Field label="Source of Lead">
            <input
              name="lead_source"
              placeholder="e.g. Referral, Website, Cold call"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Conversation Notes">
            <textarea
              name="notes"
              placeholder="What did the customer say?"
              className={`${inputClass} min-h-[100px] resize-y`}
            />
          </Field>
        </div>

        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-[var(--color-accent)] px-6 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
        >
          Save Lead
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
  children: ReactNode;
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
