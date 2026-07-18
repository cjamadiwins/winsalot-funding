"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  LEAD_STAGES,
  type CrmActivityRow,
  type CrmLeadRow,
  type CrmUserRow,
} from "@/lib/crm-types";
import type { QuoteRequestRow } from "@/lib/admin-types";
import {
  addActivityAction,
  deleteLeadAction,
  linkQuoteAction,
  searchQuoteRequestsAction,
  unlinkQuoteAction,
  updateLeadAction,
  type QuoteRequestSearchResult,
} from "./actions";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

export default function AdminLeadDetailClient({
  lead,
  activities,
  agents,
  linkedQuote,
}: {
  lead: CrmLeadRow;
  activities: CrmActivityRow[];
  agents: CrmUserRow[];
  linkedQuote: QuoteRequestRow | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [quoteQuery, setQuoteQuery] = useState("");
  const [quoteResults, setQuoteResults] = useState<QuoteRequestSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

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

  function handleDelete() {
    if (!confirm(`Permanently delete the lead "${lead.business_name}"? This cannot be undone.`)) {
      return;
    }
    runAction(async () => {
      await deleteLeadAction(lead.id);
      window.location.href = "/admin/crm";
    });
  }

  async function handleQuoteSearch(query: string) {
    setQuoteQuery(query);
    if (!query.trim()) {
      setQuoteResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchQuoteRequestsAction(query);
      setQuoteResults(results);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{lead.business_name}</h1>
        <button
          type="button"
          disabled={isPending}
          onClick={handleDelete}
          className="rounded-full border border-rose-300 px-4 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Delete Lead
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Lead Details
          </h2>
          <form
            action={(formData) => runAction(() => updateLeadAction(lead.id, formData))}
            className="mt-4 space-y-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labeled label="Stage">
                <select name="stage" defaultValue={lead.stage} className={inputClasses}>
                  {LEAD_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="Assigned Agent">
                <select
                  name="assigned_agent_id"
                  defaultValue={lead.assigned_agent_id ?? ""}
                  className={inputClasses}
                >
                  <option value="">Unassigned</option>
                  {agents
                    .filter((a) => a.active)
                    .map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.full_name || agent.email}
                      </option>
                    ))}
                </select>
              </Labeled>
              <Labeled label="Business Name">
                <input name="business_name" defaultValue={lead.business_name} required className={inputClasses} />
              </Labeled>
              <Labeled label="Contact Person">
                <input name="contact_name" defaultValue={lead.contact_name ?? ""} className={inputClasses} />
              </Labeled>
              <Labeled label="Phone">
                <input name="phone" defaultValue={lead.phone} required className={inputClasses} />
              </Labeled>
              <Labeled label="Email">
                <input name="email" type="email" defaultValue={lead.email ?? ""} className={inputClasses} />
              </Labeled>
              <Labeled label="City">
                <input name="city" defaultValue={lead.city} required className={inputClasses} />
              </Labeled>
              <Labeled label="Service Address">
                <input
                  name="service_address"
                  defaultValue={lead.service_address ?? ""}
                  className={inputClasses}
                />
              </Labeled>
              <Labeled label="Cleaning Service Requested">
                <input
                  name="service_requested"
                  defaultValue={lead.service_requested}
                  required
                  className={inputClasses}
                />
              </Labeled>
              <Labeled label="Facility / Property Type">
                <input name="property_type" defaultValue={lead.property_type ?? ""} className={inputClasses} />
              </Labeled>
              <Labeled label="Approximate Size">
                <input
                  name="approximate_size"
                  defaultValue={lead.approximate_size ?? ""}
                  className={inputClasses}
                />
              </Labeled>
              <Labeled label="Cleaning Frequency">
                <input
                  name="cleaning_frequency"
                  defaultValue={lead.cleaning_frequency ?? ""}
                  className={inputClasses}
                />
              </Labeled>
              <Labeled label="Preferred Start Date">
                <input
                  name="preferred_start_date"
                  type="date"
                  defaultValue={lead.preferred_start_date ?? ""}
                  className={inputClasses}
                />
              </Labeled>
              <Labeled label="Best Time to Contact">
                <input
                  name="best_time_to_contact"
                  defaultValue={lead.best_time_to_contact ?? ""}
                  className={inputClasses}
                />
              </Labeled>
              <Labeled label="Source of Lead">
                <input name="lead_source" defaultValue={lead.lead_source ?? ""} className={inputClasses} />
              </Labeled>
            </div>
            <Labeled label="Conversation Notes">
              <textarea
                name="notes"
                defaultValue={lead.notes ?? ""}
                className={`${inputClasses} min-h-[90px] resize-y`}
              />
            </Labeled>
            <div className="text-xs text-slate-500">
              Created {new Date(lead.created_at).toLocaleString()}
              {lead.last_contacted_at &&
                ` · Last contacted ${new Date(lead.last_contacted_at).toLocaleString()}`}
            </div>
            <button type="submit" disabled={isPending} className={buttonClasses}>
              Save Changes
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Quote Request Link
            </h2>

            {linkedQuote ? (
              <div className="mt-3 space-y-2 text-sm">
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
                  label="Quote Received"
                  value={
                    linkedQuote.customer_quote_approved_at
                      ? new Date(linkedQuote.customer_quote_approved_at).toLocaleString()
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
                <div className="flex items-center gap-3 pt-2">
                  <Link
                    href={`/admin/requests/${linkedQuote.id}`}
                    className="text-sm font-medium text-sky-600 hover:text-sky-700"
                  >
                    View in Quote Dashboard →
                  </Link>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => runAction(() => unlinkQuoteAction(lead.id))}
                    className="text-sm font-medium text-rose-600 hover:text-rose-700"
                  >
                    Unlink
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <input
                  value={quoteQuery}
                  onChange={(e) => handleQuoteSearch(e.target.value)}
                  placeholder="Search quote requests by name, phone, or email..."
                  className={inputClasses}
                />
                {searching && <p className="mt-2 text-xs text-slate-500">Searching…</p>}
                {quoteResults.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {quoteResults.map((result) => (
                      <li
                        key={result.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium text-slate-900">{result.full_name}</span>
                          <span className="text-slate-500"> · {result.city} · {result.status}</span>
                        </span>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => runAction(() => linkQuoteAction(lead.id, result.id))}
                          className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                        >
                          Link
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Log Activity
          </h2>
          <form
            action={(formData) => runAction(() => addActivityAction(lead.id, formData))}
            className="mt-4 space-y-3"
          >
            <select name="activity_type" required className={inputClasses} defaultValue="note">
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <textarea
              name="notes"
              placeholder="What happened?"
              className={`${inputClasses} min-h-[70px] resize-y`}
            />
            <Labeled label="Next Follow-up (optional)">
              <input type="datetime-local" name="next_follow_up_at" className={inputClasses} />
            </Labeled>
            <button type="submit" disabled={isPending} className={buttonClasses}>
              Save Activity
            </button>
          </form>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Activity History
          </h2>
          {activities.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No activity logged yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {activities.map((activity) => (
                <li key={activity.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {ACTIVITY_TYPE_LABELS[activity.activity_type]}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(activity.occurred_at).toLocaleString()}
                    </span>
                  </div>
                  {activity.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">{activity.notes}</p>
                  )}
                  {activity.next_follow_up_at && (
                    <p className="mt-1 text-xs text-slate-500">
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
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {children}
    </label>
  );
}
