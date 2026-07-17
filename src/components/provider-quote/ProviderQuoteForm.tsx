"use client";

import { useState, useTransition } from "react";
import { submitProviderQuoteAction } from "@/app/provider-quote/[token]/actions";
import { PRICE_TYPE_LABELS } from "@/lib/admin-types";

const inputClasses =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const labelClasses = "text-sm font-medium text-slate-800";

export default function ProviderQuoteForm({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitProviderQuoteAction(token, formData);
      if (result.ok) {
        setSubmitted(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <h2 className="text-xl font-semibold text-emerald-900">Quote submitted</h2>
        <p className="mt-3 text-emerald-800">
          Thank you — your price has been sent to Winsalot Corp. They&apos;ll review it and follow
          up with the customer.
        </p>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="price" className={labelClasses}>
            Your price <span className="text-rose-600">*</span>
          </label>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            className={`${inputClasses} mt-1.5`}
          />
        </div>

        <div>
          <label htmlFor="priceType" className={labelClasses}>
            Price type <span className="text-rose-600">*</span>
          </label>
          <select id="priceType" name="priceType" required className={`${inputClasses} mt-1.5`}>
            <option value="">Select…</option>
            {Object.entries(PRICE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="estimatedHours" className={labelClasses}>
            Estimated hours <span className="text-slate-400">(if hourly)</span>
          </label>
          <input
            id="estimatedHours"
            name="estimatedHours"
            type="number"
            step="0.25"
            min="0"
            className={`${inputClasses} mt-1.5`}
          />
        </div>

        <div>
          <label htmlFor="travelCharge" className={labelClasses}>
            Travel charge
          </label>
          <input
            id="travelCharge"
            name="travelCharge"
            type="number"
            step="0.01"
            min="0"
            className={`${inputClasses} mt-1.5`}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="additionalCharges" className={labelClasses}>
            Additional charges
          </label>
          <input
            id="additionalCharges"
            name="additionalCharges"
            type="number"
            step="0.01"
            min="0"
            className={`${inputClasses} mt-1.5`}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="notes" className={labelClasses}>
            Notes for Winsalot Corp
          </label>
          <textarea id="notes" name="notes" rows={4} className={`${inputClasses} mt-1.5`} />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-sky-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      >
        {isPending ? "Submitting..." : "Submit Quote to Winsalot Corp"}
      </button>
    </form>
  );
}
