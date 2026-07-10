"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { addLead, LEAD_STATUSES, type LeadStatus } from "@/lib/leads";

type FormState = {
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  industry: string;
  status: LeadStatus;
  followUpDate: string;
  dealValue: string;
  notes: string;
};

const initialState: FormState = {
  businessName: "",
  contactName: "",
  phone: "",
  email: "",
  industry: "",
  status: "New Lead",
  followUpDate: "",
  dealValue: "",
  notes: "",
};

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-[11px] font-sans text-[14.5px]";

export default function AddLeadForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const router = useRouter();

  const update =
    (field: keyof FormState) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    addLead({
      businessName: form.businessName.trim(),
      contactName: form.contactName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      industry: form.industry.trim(),
      status: form.status,
      followUpDate: form.followUpDate,
      dealValue: Number(form.dealValue) || 0,
      notes: form.notes.trim(),
    });
    router.push("/sales-tracker?added=1");
  };

  return (
    <div>
      <h1 className="font-heading text-[26px] font-bold text-[var(--color-ink-strong)]">
        Add Lead
      </h1>
      <p className="mt-1 text-[14.5px] text-[var(--color-text-muted)]">
        Enter the details for a new sales lead.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-6 max-w-xl rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-6"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Business Name">
            <input
              required
              value={form.businessName}
              onChange={update("businessName")}
              className={inputClass}
            />
          </Field>
          <Field label="Contact Name">
            <input
              required
              value={form.contactName}
              onChange={update("contactName")}
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={form.phone}
              onChange={update("phone")}
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={update("email")}
              className={inputClass}
            />
          </Field>
          <Field label="Industry">
            <input
              value={form.industry}
              onChange={update("industry")}
              placeholder="e.g. Retail, Construction"
              className={inputClass}
            />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={update("status")} className={inputClass}>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Follow-up Date">
            <input
              type="date"
              value={form.followUpDate}
              onChange={update("followUpDate")}
              className={inputClass}
            />
          </Field>
          <Field label="Deal Value ($)">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.dealValue}
              onChange={update("dealValue")}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={update("notes")}
              placeholder="Anything worth remembering about this lead..."
              className={`${inputClass} min-h-[90px] resize-y`}
            />
          </Field>
        </div>

        <button
          type="submit"
          className="mt-6 rounded-full bg-[var(--color-accent)] px-6 py-[12px] text-[14.5px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Save Lead
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[var(--color-ink-mute)]">{label}</span>
      {children}
    </label>
  );
}
