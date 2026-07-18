"use client";

import { useState, useTransition } from "react";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  AGENT_SETTABLE_STAGES,
  LEAD_STAGE_STYLES,
  type CrmActivityRow,
  type CrmLeadRow,
  type LeadStage,
} from "@/lib/crm-types";
import type { QuoteRequestRow } from "@/lib/admin-types";
import { addActivityAction, updateLeadDetailsAction, updateLeadStageAction } from "./actions";

const inputClass =
  "w-full rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14.5px]";

type LinkedQuote = Pick<
  QuoteRequestRow,
  | "status"
  | "customer_quote_provider_name"
  | "customer_quote_price"
  | "customer_quote_price_type"
  | "customer_quote_sent_at"
  | "customer_response"
  | "customer_response_at"
> | null;

export default function LeadDetailClient({
  lead,
  activities,
  linkedQuote,
  justAdded,
}: {
  lead: CrmLeadRow;
  activities: CrmActivityRow[];
  linkedQuote: LinkedQuote;
  justAdded: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function runAction(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      {justAdded && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Lead saved.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-bold text-[var(--color-ink-strong)]">
            {lead.business_name}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {lead.contact_name ? `${lead.contact_name} · ` : ""}
            {lead.phone} · {lead.city}
          </p>
        </div>
        {AGENT_SETTABLE_STAGES.includes(lead.stage as LeadStage) ? (
          <select
            value={lead.stage}
            disabled={isPending}
            onChange={(e) => runAction(() => updateLeadStageAction(lead.id, e.target.value))}
            className={`rounded-full border-none px-3.5 py-2 text-[13px] font-semibold ${LEAD_STAGE_STYLES[lead.stage as LeadStage]}`}
          >
            {AGENT_SETTABLE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        ) : (
          <span
            title="This stage is set automatically and can only be changed by an admin."
            className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ${LEAD_STAGE_STYLES[lead.stage as LeadStage]}`}
          >
            {lead.stage}
          </span>
        )}
      </div>
      {!AGENT_SETTABLE_STAGES.includes(lead.stage as LeadStage) && (
        <p className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">
          This stage is set automatically and can only be changed by an admin.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Lead Details
            </h2>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-[13px] font-semibold text-[var(--color-accent)]"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>

          {editing ? (
            <form
              action={(formData) => {
                runAction(() => updateLeadDetailsAction(lead.id, formData));
                setEditing(false);
              }}
              className="mt-4 space-y-3"
            >
              <LabeledInput name="business_name" label="Business Name" defaultValue={lead.business_name} required />
              <LabeledInput name="contact_name" label="Contact Person" defaultValue={lead.contact_name ?? ""} />
              <LabeledInput name="phone" label="Phone" defaultValue={lead.phone} required />
              <LabeledInput name="email" label="Email" type="email" defaultValue={lead.email ?? ""} />
              <LabeledInput name="city" label="City" defaultValue={lead.city} required />
              <LabeledInput
                name="service_address"
                label="Service Address"
                defaultValue={lead.service_address ?? ""}
              />
              <LabeledInput
                name="service_requested"
                label="Cleaning Service Requested"
                defaultValue={lead.service_requested}
                required
              />
              <LabeledInput
                name="property_type"
                label="Facility / Property Type"
                defaultValue={lead.property_type ?? ""}
              />
              <LabeledInput
                name="approximate_size"
                label="Approximate Size"
                defaultValue={lead.approximate_size ?? ""}
              />
              <LabeledInput
                name="cleaning_frequency"
                label="Cleaning Frequency"
                defaultValue={lead.cleaning_frequency ?? ""}
              />
              <LabeledInput
                name="preferred_start_date"
                label="Preferred Start Date"
                type="date"
                defaultValue={lead.preferred_start_date ?? ""}
              />
              <LabeledInput
                name="best_time_to_contact"
                label="Best Time to Contact"
                defaultValue={lead.best_time_to_contact ?? ""}
              />
              <LabeledInput name="lead_source" label="Source of Lead" defaultValue={lead.lead_source ?? ""} />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-[var(--color-ink-mute)]">
                  Conversation Notes
                </span>
                <textarea
                  name="notes"
                  defaultValue={lead.notes ?? ""}
                  className={`${inputClass} min-h-[90px] resize-y`}
                />
              </label>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:opacity-90"
              >
                Save
              </button>
            </form>
          ) : (
            <dl className="mt-4 space-y-2.5 text-[14px]">
              <Row label="Email" value={lead.email} />
              <Row label="Service Address" value={lead.service_address} />
              <Row label="Cleaning Service Requested" value={lead.service_requested} />
              <Row label="Facility / Property Type" value={lead.property_type} />
              <Row label="Approximate Size" value={lead.approximate_size} />
              <Row label="Cleaning Frequency" value={lead.cleaning_frequency} />
              <Row label="Preferred Start Date" value={lead.preferred_start_date} />
              <Row label="Best Time to Contact" value={lead.best_time_to_contact} />
              <Row label="Source of Lead" value={lead.lead_source} />
              <Row label="Date Created" value={new Date(lead.created_at).toLocaleString()} />
              <Row
                label="Date Last Contacted"
                value={lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleString() : null}
              />
              <Row
                label="Next Follow-up"
                value={lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleString() : null}
              />
              {lead.notes && (
                <div className="border-t border-[var(--color-border-soft)] pt-2.5">
                  <dt className="text-[var(--color-text-muted)]">Conversation Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-[var(--color-ink-strong)]">{lead.notes}</dd>
                </div>
              )}
            </dl>
          )}

          {linkedQuote && (
            <div className="mt-5 rounded-xl border border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)]/40 p-4">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-accent-soft-text)]">
                Linked Quote Request
              </h3>
              <dl className="mt-2.5 space-y-1.5 text-[13.5px]">
                <Row label="Status" value={linkedQuote.status} />
                <Row label="Provider" value={linkedQuote.customer_quote_provider_name} />
                <Row
                  label="Quote Amount"
                  value={
                    linkedQuote.customer_quote_price != null
                      ? `$${linkedQuote.customer_quote_price} (${linkedQuote.customer_quote_price_type ?? ""})`
                      : null
                  }
                />
                <Row
                  label="Sent to Customer"
                  value={
                    linkedQuote.customer_quote_sent_at
                      ? new Date(linkedQuote.customer_quote_sent_at).toLocaleString()
                      : null
                  }
                />
                <Row
                  label="Customer Response"
                  value={
                    linkedQuote.customer_response
                      ? linkedQuote.customer_response === "accepted"
                        ? "Accepted"
                        : "Declined"
                      : "Awaiting response"
                  }
                />
              </dl>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Log Activity
          </h2>
          <form
            action={(formData) => {
              const form = formData;
              runAction(async () => {
                await addActivityAction(lead.id, form);
              });
            }}
            className="mt-4 space-y-3"
          >
            <select name="activity_type" required className={inputClass} defaultValue="call">
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <textarea
              name="notes"
              placeholder="What happened?"
              className={`${inputClass} min-h-[70px] resize-y`}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-[var(--color-ink-mute)]">
                Next Follow-up (optional)
              </span>
              <input type="datetime-local" name="next_follow_up_at" className={inputClass} />
            </label>
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:opacity-90"
            >
              Save Activity
            </button>
          </form>

          <h2 className="mt-6 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Activity History
          </h2>
          {activities.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-[var(--color-text-muted)]">No activity logged yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="rounded-lg border border-[var(--color-border-soft)] px-3.5 py-3 text-[13.5px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--color-ink-strong)]">
                      {ACTIVITY_TYPE_LABELS[activity.activity_type]}
                    </span>
                    <span className="text-[12px] text-[var(--color-text-muted)]">
                      {new Date(activity.occurred_at).toLocaleString()}
                    </span>
                  </div>
                  {activity.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-[var(--color-text-body)]">{activity.notes}</p>
                  )}
                  {activity.next_follow_up_at && (
                    <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                      Next follow-up: {new Date(activity.next_follow_up_at).toLocaleString()}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-text-muted)]">{label}</dt>
      <dd className="text-right font-medium text-[var(--color-ink-strong)]">{value}</dd>
    </div>
  );
}

function LabeledInput({
  name,
  label,
  type = "text",
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[var(--color-ink-mute)]">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className={inputClass}
      />
    </label>
  );
}
