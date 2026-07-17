"use client";

import { useState, useTransition } from "react";
import {
  assignProviderAction,
  createProviderAndAssignAction,
  generateProviderLinkAction,
  revokeProviderLinkAction,
  saveCustomerQuoteAction,
  approveCustomerQuoteAction,
  markQuoteSentAction,
} from "./actions";
import {
  PRICE_TYPE_LABELS,
  isTokenActive,
  type PriceType,
  type ProviderQuoteSubmissionRow,
  type ProviderQuoteTokenRow,
  type ProviderRow,
  type QuoteRequestRow,
} from "@/lib/admin-types";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const labelClasses = "text-sm font-medium text-slate-800";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClasses =
  "rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60";

function formatMoney(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `$${value.toFixed(2)}`;
}

function buildCustomerQuoteText(request: QuoteRequestRow): string {
  const priceLabel = request.customer_quote_price_type
    ? PRICE_TYPE_LABELS[request.customer_quote_price_type as PriceType] ?? request.customer_quote_price_type
    : "";

  const lines = [
    `Quote for ${request.full_name}`,
    `Property: ${request.property_type} — ${request.cleaning_type}`,
    `Location: ${request.city}`,
    "",
    `Price: ${formatMoney(request.customer_quote_price)}${priceLabel ? ` (${priceLabel})` : ""}`,
  ];

  if (request.customer_quote_summary) {
    lines.push("", request.customer_quote_summary);
  }

  return lines.join("\n");
}

export default function RequestWorkflowPanel({
  request,
  providers,
  tokens,
  submissions,
}: {
  request: QuoteRequestRow;
  providers: ProviderRow[];
  tokens: ProviderQuoteTokenRow[];
  submissions: ProviderQuoteSubmissionRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newLinkPath, setNewLinkPath] = useState<string | null>(null);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState(request.assigned_provider_id ?? "");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const assignedProvider = providers.find((p) => p.id === request.assigned_provider_id) ?? null;
  const latestSubmission = submissions[0] ?? null;
  const activeTokens = tokens.filter(isTokenActive);
  const activeProviders = providers.filter((p) => p.status === "active");

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

  function handleGenerateLink() {
    if (!request.assigned_provider_id) return;
    setNewLinkPath(null);
    setError(null);
    startTransition(async () => {
      try {
        const { path } = await generateProviderLinkAction(request.id, request.assigned_provider_id!);
        setNewLinkPath(path);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate link.");
      }
    });
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied.`);
      setTimeout(() => setCopyStatus(null), 2500);
    } catch {
      setCopyStatus("Couldn't copy automatically — select and copy manually.");
    }
  }

  function downloadQuote() {
    const text = buildCustomerQuoteText(request);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `quote-${request.full_name.replace(/\s+/g, "-").toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Assignment */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Assign a Cleaning Provider
        </h2>

        {assignedProvider ? (
          <p className="mt-3 text-sm text-slate-700">
            Assigned to <span className="font-semibold">{assignedProvider.company_name}</span>
            {assignedProvider.status === "inactive" && (
              <span className="ml-2 text-xs text-amber-600">(now inactive)</span>
            )}
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Not assigned yet.</p>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <select
            className={inputClasses}
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
          >
            <option value="">Select a provider…</option>
            {activeProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.company_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isPending || !selectedProviderId}
            onClick={() => runAction(() => assignProviderAction(request.id, selectedProviderId))}
            className={`${buttonClasses} shrink-0`}
          >
            Assign
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowAddProvider((v) => !v)}
          className="mt-3 text-sm font-medium text-sky-600 hover:text-sky-700"
        >
          {showAddProvider ? "Cancel" : "+ Add a new provider"}
        </button>

        {showAddProvider && (
          <form
            action={(formData) => {
              runAction(() => createProviderAndAssignAction(request.id, formData));
              setShowAddProvider(false);
            }}
            className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <input
              name="companyName"
              placeholder="Company name"
              required
              className={inputClasses}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input name="contactPerson" placeholder="Contact person" className={inputClasses} />
              <input name="phone" placeholder="Phone" className={inputClasses} />
              <input name="email" type="email" placeholder="Email" className={inputClasses} />
              <input
                name="serviceLocations"
                placeholder="Service locations"
                className={inputClasses}
              />
            </div>
            <button type="submit" disabled={isPending} className={buttonClasses}>
              Create &amp; Assign
            </button>
          </form>
        )}
      </section>

      {/* Provider link */}
      {request.assigned_provider_id && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Provider Quote Link
          </h2>

          <button
            type="button"
            disabled={isPending}
            onClick={handleGenerateLink}
            className={`${buttonClasses} mt-3`}
          >
            Generate New Link
          </button>

          {newLinkPath && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-medium text-emerald-800">
                Copy this now — it won&apos;t be shown again.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 overflow-x-auto rounded bg-white px-2 py-1.5 text-xs text-slate-800">
                  {typeof window !== "undefined" ? window.location.origin : ""}
                  {newLinkPath}
                </code>
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      `${window.location.origin}${newLinkPath}`,
                      "Link"
                    )
                  }
                  className={secondaryButtonClasses}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {copyStatus && <p className="mt-2 text-xs text-slate-500">{copyStatus}</p>}

          {activeTokens.length > 0 && (
            <ul className="mt-4 space-y-2">
              {activeTokens.map((token) => (
                <li
                  key={token.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="text-slate-600">
                    Link created {new Date(token.created_at).toLocaleDateString()} · expires{" "}
                    {new Date(token.expires_at).toLocaleDateString()}
                    {token.viewed_at && " · viewed"}
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => runAction(() => revokeProviderLinkAction(token.id, request.id))}
                    className="text-xs font-medium text-rose-600 hover:text-rose-700"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Provider's submitted quote */}
      {latestSubmission && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Provider&apos;s Submitted Price
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Price</dt>
              <dd className="font-medium text-slate-900">
                {formatMoney(latestSubmission.price)} ({PRICE_TYPE_LABELS[latestSubmission.price_type]})
              </dd>
            </div>
            {latestSubmission.estimated_hours != null && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Estimated hours</dt>
                <dd className="font-medium text-slate-900">{latestSubmission.estimated_hours}</dd>
              </div>
            )}
            {latestSubmission.travel_charge != null && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Travel charge</dt>
                <dd className="font-medium text-slate-900">
                  {formatMoney(latestSubmission.travel_charge)}
                </dd>
              </div>
            )}
            {latestSubmission.additional_charges != null && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Additional charges</dt>
                <dd className="font-medium text-slate-900">
                  {formatMoney(latestSubmission.additional_charges)}
                </dd>
              </div>
            )}
          </dl>
          {latestSubmission.notes && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-slate-500">Notes for you</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-900">{latestSubmission.notes}</p>
            </div>
          )}
        </section>
      )}

      {/* Customer quote draft */}
      {latestSubmission && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Customer-Facing Quote
          </h2>

          <form
            action={(formData) => runAction(() => saveCustomerQuoteAction(request.id, formData))}
            className="mt-4 space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="price" className={labelClasses}>
                  Price
                </label>
                <input
                  id="price"
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={request.customer_quote_price ?? latestSubmission.price}
                  className={`${inputClasses} mt-1.5`}
                />
              </div>
              <div>
                <label htmlFor="priceType" className={labelClasses}>
                  Price type
                </label>
                <select
                  id="priceType"
                  name="priceType"
                  defaultValue={request.customer_quote_price_type ?? latestSubmission.price_type}
                  className={`${inputClasses} mt-1.5`}
                >
                  {Object.entries(PRICE_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="summary" className={labelClasses}>
                Quote summary (shown to the customer)
              </label>
              <textarea
                id="summary"
                name="summary"
                rows={4}
                defaultValue={request.customer_quote_summary ?? ""}
                className={`${inputClasses} mt-1.5`}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={isPending} className={secondaryButtonClasses}>
                Save Draft
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => runAction(() => approveCustomerQuoteAction(request.id))}
                className={buttonClasses}
              >
                Approve Quote
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Approved, ready to send */}
      {request.customer_quote_approved_at && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Approved Quote — Ready to Send
          </h2>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-4 text-sm text-slate-800">
            {buildCustomerQuoteText(request)}
          </pre>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => copyText(buildCustomerQuoteText(request), "Quote")}
              className={secondaryButtonClasses}
            >
              Copy
            </button>
            <button type="button" onClick={downloadQuote} className={secondaryButtonClasses}>
              Download
            </button>
            <a
              href={`mailto:${request.email ?? ""}?subject=${encodeURIComponent(
                "Your Cleaning Quote"
              )}&body=${encodeURIComponent(buildCustomerQuoteText(request))}`}
              className={secondaryButtonClasses}
            >
              Email
            </a>
            {!request.customer_quote_sent_at && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => runAction(() => markQuoteSentAction(request.id))}
                className={buttonClasses}
              >
                Mark as Sent
              </button>
            )}
          </div>

          {request.customer_quote_sent_at && (
            <p className="mt-3 text-sm text-emerald-700">
              Sent {new Date(request.customer_quote_sent_at).toLocaleString()}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
