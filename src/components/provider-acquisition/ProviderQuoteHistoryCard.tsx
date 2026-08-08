"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ProviderQuoteHistoryRow } from "@/lib/provider-quote-history";

type CleaningProviderOption = { id: string; company_name: string };

// Quote History (brief "QUOTE HISTORY") - reads across the pre-existing,
// separate private quote-assignment system (cleaning_providers/
// quote_requests) once an administrator has linked the two records.
export default function ProviderQuoteHistoryCard({
  quoteHistory,
  cleaningProviderId,
  cleaningProviders,
  isAdmin,
  onLink,
}: {
  quoteHistory: ProviderQuoteHistoryRow[];
  cleaningProviderId: string | null;
  cleaningProviders: CleaningProviderOption[];
  isAdmin: boolean;
  onLink?: (cleaningProviderId: string | null) => Promise<{ error?: string } | void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runLink(value: string) {
    if (!onLink) return;
    setError(null);
    startTransition(async () => {
      const result = await onLink(value || null);
      if (result && "error" in result && result.error) setError(result.error);
    });
  }

  return (
    <section id="quote-history" className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Quote History</h2>
        {isAdmin && onLink && (
          <select
            value={cleaningProviderId ?? ""}
            disabled={isPending}
            onChange={(e) => runLink(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="">Not linked to quote system</option>
            {cleaningProviders.map((cp) => (
              <option key={cp.id} value={cp.id}>
                {cp.company_name}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <p className="mt-2 text-[13px] text-rose-600">{error}</p>}

      {!cleaningProviderId ? (
        <p className="mt-3 text-[13.5px] text-slate-500">
          This provider isn&apos;t linked to the quote-assignment system yet
          {isAdmin ? " — link it above to show quote history." : "."}
        </p>
      ) : quoteHistory.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-slate-500">No quote opportunities yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3">Requested</th>
                <th className="py-2 pr-3">Quote Sent</th>
                <th className="py-2 pr-3">Value</th>
                <th className="py-2 pr-3">Final Status</th>
                {isAdmin && <th className="py-2 pr-3" />}
              </tr>
            </thead>
            <tbody>
              {quoteHistory.map((q) => (
                <tr key={q.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-900">
                    {q.customerName} <span className="text-slate-400">({q.city})</span>
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{new Date(q.quoteRequestDate).toLocaleDateString()}</td>
                  <td className="py-2 pr-3 text-slate-600">
                    {q.quoteSentAt ? new Date(q.quoteSentAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">
                    {q.quoteValue !== null ? `$${q.quoteValue.toLocaleString()}` : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                        q.accepted
                          ? "bg-emerald-100 text-emerald-800"
                          : q.declined || q.expired
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {q.finalStatus}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="py-2 pr-3 text-right">
                      <Link href={`/admin/requests/${q.id}`} className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
                        Open Quote
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
