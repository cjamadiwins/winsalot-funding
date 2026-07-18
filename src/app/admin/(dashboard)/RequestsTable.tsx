"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteQuoteRequestAction, deleteQuoteRequestsAction } from "./actions";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES, type QuoteRequestRow } from "@/lib/admin-types";

// Older rows may still carry the pre-workflow-update lowercase statuses;
// keep their labels/styles alongside the current QUOTE_STATUS_* maps so the
// list doesn't show a raw, unstyled string for historical requests.
const STATUS_LABELS: Record<string, string> = {
  ...QUOTE_STATUS_LABELS,
  new: "New",
  assigned: "Assigned",
  provider_quote_received: "Provider Quote Received",
  quote_approved: "Quote Approved",
};

const STATUS_STYLES: Record<string, string> = {
  ...QUOTE_STATUS_STYLES,
  new: "bg-slate-100 text-slate-700",
  assigned: "bg-amber-100 text-amber-800",
  provider_quote_received: "bg-sky-100 text-sky-800",
  quote_approved: "bg-emerald-100 text-emerald-800",
};

type RequestSummary = Pick<
  QuoteRequestRow,
  "id" | "created_at" | "full_name" | "city" | "cleaning_type" | "property_type" | "status"
>;

const SINGLE_DELETE_MESSAGE =
  "Are you sure you want to permanently delete this quote request? This cannot be undone.";

export default function RequestsTable({ requests }: { requests: RequestSummary[] }) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const allSelected = requests.length > 0 && selected.size === requests.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(requests.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleDeleteOne(id: string) {
    if (!confirm(SINGLE_DELETE_MESSAGE)) return;

    setError(null);
    startTransition(async () => {
      try {
        await deleteQuoteRequestAction(id);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete the request.");
      }
    });
  }

  function handleDeleteSelected() {
    const count = selected.size;
    if (count === 0) return;

    const message =
      count === 1
        ? SINGLE_DELETE_MESSAGE
        : `Are you sure you want to permanently delete these ${count} quote requests? This cannot be undone.`;
    if (!confirm(message)) return;

    setError(null);
    startTransition(async () => {
      try {
        await deleteQuoteRequestsAction(Array.from(selected));
        setSelected(new Set());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete the selected requests.");
      }
    });
  }

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {selected.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <span className="text-sm font-medium text-rose-700">{selected.size} selected</span>
          <button
            type="button"
            disabled={isPending}
            onClick={handleDeleteSelected}
            className="rounded-full bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete selected
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all requests"
                  className="rounded border-slate-300"
                />
              </th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Cleaning Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(request.id)}
                    onChange={() => toggleOne(request.id)}
                    aria-label={`Select ${request.full_name}`}
                    className="rounded border-slate-300"
                  />
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(request.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link href={`/admin/requests/${request.id}`} className="hover:text-sky-600">
                    {request.full_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{request.city}</td>
                <td className="px-4 py-3 text-slate-600">{request.cleaning_type}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_STYLES[request.status] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {STATUS_LABELS[request.status] ?? request.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDeleteOne(request.id)}
                    className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No quote requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
