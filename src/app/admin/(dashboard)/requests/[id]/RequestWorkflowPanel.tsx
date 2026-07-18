"use client";

import { useState, useTransition } from "react";
import {
  assignProviderAction,
  createProviderAndAssignAction,
  generateProviderLinkAction,
  revokeProviderLinkAction,
  approveCustomerQuoteAction,
  sendQuoteToCustomerAction,
} from "./actions";
import {
  PRICE_TYPE_LABELS,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_STYLES,
  isTokenActive,
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

// Statuses at or beyond "sent" — the customer-facing quote is final and no
// longer editable from here.
const SENT_STATUSES = new Set(["Sent to Customer", "Customer Accepted", "Customer Declined"]);

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
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [sendConfirmation, setSendConfirmation] = useState<string | null>(null);

  const assignedProvider = providers.find((p) => p.id === request.assigned_provider_id) ?? null;
  const latestSubmission = submissions[0] ?? null;
  const activeTokens = tokens.filter(isTokenActive);
  const activeProviders = providers.filter((p) => p.status === "active");
  const isApproved = request.status === "Approved";
  const isSent = SENT_STATUSES.has(request.status);
  const statusLabel = QUOTE_STATUS_LABELS[request.status as keyof typeof QUOTE_STATUS_LABELS] ?? request.status;
  const statusStyle = QUOTE_STATUS_STYLES[request.status as keyof typeof QUOTE_STATUS_STYLES] ?? "bg-slate-100 text-slate-700";

  const confirmedProviderName =
    request.customer_quote_provider_name ?? assignedProvider?.company_name ?? "the assigned provider";
  const priceTypeLabel = request.customer_quote_price_type
    ? PRICE_TYPE_LABELS[request.customer_quote_price_type as keyof typeof PRICE_TYPE_LABELS]
    : null;
  const acceptedPriceLabel = `${formatMoney(request.customer_quote_price)}${
    priceTypeLabel ? ` (${priceTypeLabel})` : ""
  }`;
  const acceptanceDateLabel = request.customer_response_at
    ? new Date(request.customer_response_at).toLocaleDateString()
    : "—";
  const providerConfirmationMessage = `Subject: Customer Accepted Your Cleaning Quote

Hello ${confirmedProviderName},

The customer has accepted your cleaning quote.

Customer: ${request.full_name}
Service: ${request.cleaning_type}
City: ${request.city}
Accepted Price: ${acceptedPriceLabel}
Acceptance Date: ${acceptanceDateLabel}

Please contact Winsalot Corp to confirm the next steps and scheduling.

Thank you,
Winsalot Corp`;

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

  function handleSendToCustomer() {
    setError(null);
    setSendConfirmation(null);
    startTransition(async () => {
      try {
        await sendQuoteToCustomerAction(request.id, expiresInDays);
        setSendConfirmation("The quote email has been sent to the customer.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send the quote to the customer.");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusStyle}`}>
          {statusLabel}
        </span>
      </div>

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

      {/* Provider's submitted quote — private to Winsalot Corp, never shown to the customer */}
      {latestSubmission && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Provider&apos;s Submitted Price (Private)
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

      {/* Review, edit, and approve the customer-facing quote — approving alone never sends anything */}
      {latestSubmission && !isSent && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Customer-Facing Quote
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Review and edit what the customer will see. Nothing is sent until you click
            &quot;Send Quote to Customer&quot; below.
          </p>

          <form
            action={(formData) => runAction(() => approveCustomerQuoteAction(request.id, formData))}
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
                  Pricing unit
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
              <div className="sm:col-span-2">
                <label htmlFor="providerName" className={labelClasses}>
                  Provider name (shown to customer)
                </label>
                <input
                  id="providerName"
                  name="providerName"
                  defaultValue={request.customer_quote_provider_name ?? assignedProvider?.company_name ?? ""}
                  className={`${inputClasses} mt-1.5`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="summary" className={labelClasses}>
                Service description (shown to the customer)
              </label>
              <textarea
                id="summary"
                name="summary"
                rows={3}
                defaultValue={request.customer_quote_summary ?? ""}
                className={`${inputClasses} mt-1.5`}
              />
            </div>

            <div>
              <label htmlFor="notes" className={labelClasses}>
                Additional notes or terms (shown to the customer)
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={request.customer_quote_notes ?? ""}
                className={`${inputClasses} mt-1.5`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={isPending} className={buttonClasses}>
                {isApproved ? "Save Changes" : "Approve"}
              </button>
              {isApproved && (
                <span className="text-xs font-medium text-emerald-700">
                  Approved {request.customer_quote_approved_at && new Date(request.customer_quote_approved_at).toLocaleString()}
                </span>
              )}
            </div>
          </form>

          {isApproved && (
            <div className="mt-6 border-t border-slate-100 pt-6">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="expiresInDays" className={labelClasses}>
                    Expires in (days)
                  </label>
                  <input
                    id="expiresInDays"
                    type="number"
                    min={1}
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(Number(e.target.value) || 7)}
                    className={`${inputClasses} mt-1.5 w-28`}
                  />
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleSendToCustomer}
                  className={buttonClasses}
                >
                  Send Quote to Customer
                </button>
              </div>
              {sendConfirmation && (
                <p className="mt-2 text-sm text-emerald-700">{sendConfirmation}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Customer response — read-only once the quote has been sent */}
      {isSent && (
        <section
          className={`rounded-2xl border p-6 ${
            request.customer_response === "accepted"
              ? "border-emerald-200 bg-emerald-50"
              : request.customer_response === "declined"
                ? "border-rose-200 bg-rose-50"
                : "border-purple-200 bg-purple-50"
          }`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Customer Response
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Sent to customer</dt>
              <dd className="font-medium text-slate-900">
                {request.customer_quote_sent_at && new Date(request.customer_quote_sent_at).toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Status</dt>
              <dd className="font-medium text-slate-900">
                {request.customer_response
                  ? request.customer_response === "accepted"
                    ? "Accepted"
                    : "Declined"
                  : "Awaiting customer response"}
              </dd>
            </div>
            {request.customer_response_at && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Responded</dt>
                <dd className="font-medium text-slate-900">
                  {new Date(request.customer_response_at).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
          {request.customer_response_comments && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-slate-500">Customer comments</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-900">
                {request.customer_response_comments}
              </p>
            </div>
          )}

          {request.customer_response === "accepted" && (
            <div className="mt-4 border-t border-emerald-200 pt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                Accepted Quote Details
              </h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Customer name</dt>
                  <dd className="text-right font-medium text-slate-900">{request.full_name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Provider name</dt>
                  <dd className="text-right font-medium text-slate-900">{confirmedProviderName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Service requested</dt>
                  <dd className="text-right font-medium text-slate-900">{request.cleaning_type}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">City</dt>
                  <dd className="text-right font-medium text-slate-900">{request.city}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Accepted price</dt>
                  <dd className="text-right font-medium text-slate-900">{acceptedPriceLabel}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Acceptance date</dt>
                  <dd className="text-right font-medium text-slate-900">{acceptanceDateLabel}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Status</dt>
                  <dd className="text-right font-medium text-slate-900">Customer Accepted</dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => copyText(providerConfirmationMessage, "Provider confirmation message")}
                className={`${secondaryButtonClasses} mt-4`}
              >
                Copy Provider Confirmation
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
