"use client";

import { type ReactNode, useState } from "react";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS, type CrmOpportunityRow, type OpportunityType } from "@/lib/crm-types";
import { toDatetimeLocal } from "@/lib/crm-types";

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-[15px]";

// Type-conditional field set shared by the agent's "New Opportunity" form
// and the opportunity detail page's editor (item 2 & 3 of the brief) - one
// place owns which fields exist for which opportunity_type, so the two
// screens can never drift apart. Deliberately renders only the <label>/
// <input> fields, not a <form> or submit button of its own, so each caller
// wraps it in its own <form action={...}> alongside whatever
// buttons/error UI that screen needs.
export default function OpportunityFieldsForm({
  defaultOpportunityType,
  defaults,
}: {
  defaultOpportunityType?: OpportunityType;
  defaults?: Partial<
    Pick<
      CrmOpportunityRow,
      | "business_name"
      | "contact_name"
      | "phone"
      | "email"
      | "city"
      | "province_state"
      | "notes"
      | "industry"
      | "target_customers"
      | "current_marketing_method"
      | "appointments_wanted"
      | "estimated_monthly_budget"
      | "consultation_date"
      | "business_structure"
      | "time_in_business"
      | "average_monthly_revenue"
      | "financing_amount_requested"
      | "bank_statements_available"
      | "application_status"
    >
  >;
}) {
  const [type, setType] = useState<OpportunityType>(defaultOpportunityType ?? "lead_generation");
  const showLeadGen = type === "lead_generation" || type === "both_services";
  const showFinancing = type === "business_financing" || type === "both_services";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Opportunity Type" required>
          <select
            name="opportunity_type"
            value={type}
            onChange={(e) => setType(e.target.value as OpportunityType)}
            required
            className={inputClass}
          >
            {OPPORTUNITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {OPPORTUNITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Business Name" required>
          <input name="business_name" required defaultValue={defaults?.business_name ?? ""} className={inputClass} />
        </Field>
        <Field label="Contact Name">
          <input name="contact_name" defaultValue={defaults?.contact_name ?? ""} className={inputClass} />
        </Field>
        <Field label="Phone Number" required>
          <input name="phone" type="tel" required defaultValue={defaults?.phone ?? ""} className={inputClass} />
        </Field>
        <Field label="Email Address">
          <input name="email" type="email" defaultValue={defaults?.email ?? ""} className={inputClass} />
        </Field>
        <Field label="City">
          <input name="city" defaultValue={defaults?.city ?? ""} className={inputClass} />
        </Field>
        <Field label="Province / State">
          <input name="province_state" defaultValue={defaults?.province_state ?? ""} className={inputClass} />
        </Field>
      </div>

      {showLeadGen && (
        <fieldset className="rounded-xl border border-[var(--color-border)] p-4">
          <legend className="px-1 text-[12.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Lead Generation Details
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Industry">
              <input name="industry" defaultValue={defaults?.industry ?? ""} className={inputClass} />
            </Field>
            <Field label="Target Customers">
              <input name="target_customers" defaultValue={defaults?.target_customers ?? ""} className={inputClass} />
            </Field>
            <Field label="Current Marketing Method">
              <input
                name="current_marketing_method"
                defaultValue={defaults?.current_marketing_method ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Number of Appointments Wanted">
              <input
                name="appointments_wanted"
                type="number"
                min={0}
                defaultValue={defaults?.appointments_wanted ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Estimated Monthly Budget">
              <input
                name="estimated_monthly_budget"
                type="number"
                min={0}
                step="0.01"
                defaultValue={defaults?.estimated_monthly_budget ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Consultation Date">
              <input
                name="consultation_date"
                type="datetime-local"
                defaultValue={defaults?.consultation_date ? toDatetimeLocal(defaults.consultation_date) : ""}
                className={inputClass}
              />
            </Field>
          </div>
        </fieldset>
      )}

      {showFinancing && (
        <fieldset className="rounded-xl border border-[var(--color-border)] p-4">
          <legend className="px-1 text-[12.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Business Financing Details
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Business Structure">
              <select
                name="business_structure"
                defaultValue={defaults?.business_structure ?? ""}
                className={inputClass}
              >
                <option value="">—</option>
                <option value="corporation">Corporation</option>
                <option value="sole_proprietorship">Sole Proprietorship</option>
              </select>
            </Field>
            <Field label="Time in Business">
              <input name="time_in_business" defaultValue={defaults?.time_in_business ?? ""} className={inputClass} />
            </Field>
            <Field label="Average Monthly Revenue">
              <input
                name="average_monthly_revenue"
                type="number"
                min={0}
                step="0.01"
                defaultValue={defaults?.average_monthly_revenue ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Financing Amount Requested">
              <input
                name="financing_amount_requested"
                type="number"
                min={0}
                step="0.01"
                defaultValue={defaults?.financing_amount_requested ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Six Months of Bank Statements Available">
              <label className="mt-2 flex items-center gap-2 text-[14px] text-[var(--color-ink)]">
                <input
                  name="bank_statements_available"
                  type="checkbox"
                  defaultChecked={defaults?.bank_statements_available ?? false}
                  className="h-4 w-4"
                />
                Yes, available
              </label>
            </Field>
            <Field label="Application Status">
              <input name="application_status" defaultValue={defaults?.application_status ?? ""} className={inputClass} />
            </Field>
          </div>
        </fieldset>
      )}

      <Field label="Notes">
        <textarea
          name="notes"
          placeholder="Any additional context..."
          defaultValue={defaults?.notes ?? ""}
          className={`${inputClass} min-h-[100px] resize-y`}
        />
      </Field>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
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
