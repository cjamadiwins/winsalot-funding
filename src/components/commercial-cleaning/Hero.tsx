"use client";

import { useState, type FormEvent } from "react";
import { Phone } from "lucide-react";
import { businessConfig } from "@/config/business";
import { QUICK_QUOTE_EVENT, type QuickQuotePrefill } from "@/lib/quick-quote";

const inputClasses =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-100";

const initialQuickForm: QuickQuotePrefill = {
  fullName: "",
  phone: "",
  email: "",
  description: "",
};

function validateQuickForm(form: QuickQuotePrefill): string | null {
  if (!form.fullName.trim()) return "Please enter your name.";
  if (!form.phone.trim()) return "Please enter your phone number.";
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "Please enter a valid email address.";
  }
  if (!form.description.trim()) return "Please tell us what you need cleaned.";
  return null;
}

export default function Hero() {
  const [quickForm, setQuickForm] = useState<QuickQuotePrefill>(initialQuickForm);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof QuickQuotePrefill>(field: K, value: QuickQuotePrefill[K]) {
    setQuickForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleQuickSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateQuickForm(quickForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    window.dispatchEvent(new CustomEvent(QUICK_QUOTE_EVENT, { detail: quickForm }));
    document.getElementById("quote")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section id="home" className="bg-white">
      <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-600">
          Professional Commercial &amp; Home Cleaning Services
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Request a Commercial or Home Cleaning Quote
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Tell us about your commercial or residential cleaning needs and receive a customized
          quote from a professional cleaning provider.
        </p>

        <form
          onSubmit={handleQuickSubmit}
          noValidate
          className="mx-auto mt-10 max-w-4xl rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-xl shadow-slate-200/60 sm:p-6"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="quickName" className="sr-only">
                Your Name
              </label>
              <input
                id="quickName"
                type="text"
                placeholder="Your Name"
                required
                className={inputClasses}
                value={quickForm.fullName}
                onChange={(e) => updateField("fullName", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="quickPhone" className="sr-only">
                Phone Number
              </label>
              <input
                id="quickPhone"
                type="tel"
                placeholder="Phone Number"
                required
                className={inputClasses}
                value={quickForm.phone}
                onChange={(e) => updateField("phone", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="quickEmail" className="sr-only">
                Email Address
              </label>
              <input
                id="quickEmail"
                type="email"
                placeholder="Email Address"
                className={inputClasses}
                value={quickForm.email}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="quickDetails" className="sr-only">
                What do you need cleaned?
              </label>
              <input
                id="quickDetails"
                type="text"
                placeholder="What do you need cleaned?"
                required
                className={inputClasses}
                value={quickForm.description}
                onChange={(e) => updateField("description", e.target.value)}
              />
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

          <button
            type="submit"
            className="mt-4 w-full rounded-full bg-sky-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            Get Free Quote →
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          No obligation • Fast response • Serving homes and businesses in your area
        </p>
        <a
          href={`tel:${businessConfig.phone.href}`}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-sky-600"
        >
          <Phone className="h-3.5 w-3.5" />
          Or call the quote team: {businessConfig.phone.display}
        </a>
      </div>
    </section>
  );
}
