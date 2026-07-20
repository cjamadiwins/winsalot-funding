"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { QUICK_QUOTE_EVENT, type QuickQuoteEvent } from "@/lib/quick-quote";
import { gtag_report_conversion } from "@/lib/google-ads";

const CLEANING_TYPES = [
  "Residential cleaning",
  "Commercial cleaning",
  "Office cleaning",
  "Move-in cleaning",
  "Move-out cleaning",
  "Deep cleaning",
  "Regular scheduled cleaning",
  "Other",
];

const BEDROOM_OPTIONS = ["Studio", "1", "2", "3", "4", "5+"];
const BATHROOM_OPTIONS = ["1", "1.5", "2", "2.5", "3", "3.5+"];

type FormState = {
  fullName: string;
  phone: string;
  email: string;
  city: string;
  serviceAddress: string;
  propertyType: "" | "residential" | "commercial";
  cleaningType: string;
  bedrooms: string;
  bathrooms: string;
  propertySize: string;
  preferredDate: string;
  serviceFrequency: "" | "one-time" | "recurring";
  preferredContactMethod: "" | "phone" | "email" | "text";
  description: string;
  consent: boolean;
  website: string; // honeypot
};

const initialState: FormState = {
  fullName: "",
  phone: "",
  email: "",
  city: "",
  serviceAddress: "",
  propertyType: "",
  cleaningType: "",
  bedrooms: "",
  bathrooms: "",
  propertySize: "",
  preferredDate: "",
  serviceFrequency: "",
  preferredContactMethod: "",
  description: "",
  consent: false,
  website: "",
};

const inputClasses =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const labelClasses = "text-sm font-medium text-slate-800";

function validate(form: FormState): string | null {
  if (!form.fullName.trim()) return "Please enter your full name.";
  if (!form.phone.trim()) return "Please enter your phone number.";
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "Please enter a valid email address.";
  }
  if (!form.city.trim()) return "Please enter your city.";
  if (!form.propertyType) return "Please select whether this is a residential or commercial property.";
  if (!form.cleaningType) return "Please select the type of cleaning required.";
  if (!form.description.trim()) return "Please describe the cleaning you need.";
  if (!form.consent) return "Please agree to be contacted about your quote request.";
  return null;
}

export default function QuoteForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  // React state updates aren't applied synchronously, so two clicks
  // dispatched in the same tick (a fast double-click, or a synthetic
  // double dispatch) can both read the same stale `status` before either
  // setStatus("submitting") call commits - the `status === "submitting"`
  // check alone doesn't close that race. This ref is mutated immediately,
  // so the second call always sees the first call's lock.
  const submittingRef = useRef(false);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Subscribes to the compact hero quick-quote form so values it collects
  // can flow into this form's state the moment the visitor submits it,
  // regardless of when this component happened to mount.
  useEffect(() => {
    function handleQuickQuote(event: Event) {
      const { detail } = event as QuickQuoteEvent;
      setForm((prev) => ({
        ...prev,
        fullName: detail.fullName || prev.fullName,
        phone: detail.phone || prev.phone,
        email: detail.email || prev.email,
        description: detail.description || prev.description,
      }));
    }

    window.addEventListener(QUICK_QUOTE_EVENT, handleQuickQuote);
    return () => window.removeEventListener(QUICK_QUOTE_EVENT, handleQuickQuote);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) return;

    setError(null);

    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    submittingRef.current = true;
    setStatus("submitting");

    try {
      const response = await fetch("/api/commercial-cleaning-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Something went wrong. Please try again later.");
        setStatus("idle");
        submittingRef.current = false;
        return;
      }

      // Only reached once the request has been validated and saved by the
      // API (it responds 201 only after the Supabase insert succeeds) -
      // never on click, a validation error, or an API/DB failure above.
      gtag_report_conversion();
      setStatus("success");
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
      setStatus("idle");
      submittingRef.current = false;
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <h3 className="text-xl font-semibold text-emerald-900">Thank you for your request.</h3>
        <p className="mt-3 text-emerald-800">
          Your quote request has been received. We will contact you shortly to discuss your
          cleaning needs.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Honeypot field: kept off-screen and out of the tab order. Real
          visitors never fill this in; bots that auto-fill every field do. */}
      <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(e) => updateField("website", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="fullName" className={labelClasses}>
            Full name <span className="text-rose-600">*</span>
          </label>
          <input
            id="fullName"
            type="text"
            required
            className={`${inputClasses} mt-1.5`}
            value={form.fullName}
            onChange={(e) => updateField("fullName", e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="phone" className={labelClasses}>
            Phone number <span className="text-rose-600">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            required
            className={`${inputClasses} mt-1.5`}
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="email" className={labelClasses}>
            Email address
          </label>
          <input
            id="email"
            type="email"
            className={`${inputClasses} mt-1.5`}
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="city" className={labelClasses}>
            City <span className="text-rose-600">*</span>
          </label>
          <input
            id="city"
            type="text"
            required
            className={`${inputClasses} mt-1.5`}
            value={form.city}
            onChange={(e) => updateField("city", e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="serviceAddress" className={labelClasses}>
            Full service address
          </label>
          <input
            id="serviceAddress"
            type="text"
            className={`${inputClasses} mt-1.5`}
            value={form.serviceAddress}
            onChange={(e) => updateField("serviceAddress", e.target.value)}
          />
        </div>

        <div>
          <span className={labelClasses}>
            Residential or commercial property <span className="text-rose-600">*</span>
          </span>
          <div className="mt-1.5 flex gap-4">
            {(["residential", "commercial"] as const).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="propertyType"
                  required
                  checked={form.propertyType === option}
                  onChange={() => updateField("propertyType", option)}
                  className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                {option === "residential" ? "Residential" : "Commercial"}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="cleaningType" className={labelClasses}>
            Type of cleaning required <span className="text-rose-600">*</span>
          </label>
          <select
            id="cleaningType"
            required
            className={`${inputClasses} mt-1.5`}
            value={form.cleaningType}
            onChange={(e) => updateField("cleaningType", e.target.value)}
          >
            <option value="" disabled>
              Select a service
            </option>
            {CLEANING_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bedrooms" className={labelClasses}>
            Number of bedrooms
          </label>
          <select
            id="bedrooms"
            className={`${inputClasses} mt-1.5`}
            value={form.bedrooms}
            onChange={(e) => updateField("bedrooms", e.target.value)}
          >
            <option value="">Not sure / not applicable</option>
            {BEDROOM_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bathrooms" className={labelClasses}>
            Number of bathrooms
          </label>
          <select
            id="bathrooms"
            className={`${inputClasses} mt-1.5`}
            value={form.bathrooms}
            onChange={(e) => updateField("bathrooms", e.target.value)}
          >
            <option value="">Not sure / not applicable</option>
            {BATHROOM_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="propertySize" className={labelClasses}>
            Approximate property size
          </label>
          <input
            id="propertySize"
            type="text"
            placeholder="e.g. 1,200 sq ft"
            className={`${inputClasses} mt-1.5`}
            value={form.propertySize}
            onChange={(e) => updateField("propertySize", e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="preferredDate" className={labelClasses}>
            Preferred service date
          </label>
          <input
            id="preferredDate"
            type="date"
            className={`${inputClasses} mt-1.5`}
            value={form.preferredDate}
            onChange={(e) => updateField("preferredDate", e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="serviceFrequency" className={labelClasses}>
            One-time or recurring service
          </label>
          <select
            id="serviceFrequency"
            className={`${inputClasses} mt-1.5`}
            value={form.serviceFrequency}
            onChange={(e) =>
              updateField("serviceFrequency", e.target.value as FormState["serviceFrequency"])
            }
          >
            <option value="">Not sure yet</option>
            <option value="one-time">One-time</option>
            <option value="recurring">Recurring</option>
          </select>
        </div>

        <div>
          <label htmlFor="preferredContactMethod" className={labelClasses}>
            Preferred contact method
          </label>
          <select
            id="preferredContactMethod"
            className={`${inputClasses} mt-1.5`}
            value={form.preferredContactMethod}
            onChange={(e) =>
              updateField(
                "preferredContactMethod",
                e.target.value as FormState["preferredContactMethod"]
              )
            }
          >
            <option value="">No preference</option>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="text">Text</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="description" className={labelClasses}>
            Description of cleaning needed <span className="text-rose-600">*</span>
          </label>
          <textarea
            id="description"
            required
            rows={4}
            className={`${inputClasses} mt-1.5`}
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
          />
        </div>
      </div>

      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          required
          checked={form.consent}
          onChange={(e) => updateField("consent", e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
        />
        <span>
          I agree to be contacted about my quote request. <span className="text-rose-600">*</span>
        </span>
      </label>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-sky-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      >
        {status === "submitting" ? "Sending..." : "Request My Free Quote"}
      </button>

      <p className="text-xs text-slate-500">
        The information you provide will only be used to respond to your quote request and
        arrange cleaning services.
      </p>
    </form>
  );
}
