"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import StatusBadge from "./StatusBadge";

export type EmailTrackingStatus = {
  value: string;
  label: string;
  className: string;
};

export type EmailTrackingDetail = {
  label: string;
  value: string;
};

export type EmailTrackingRecord = {
  id: string;
  sentAt: string;
  entityLabel: string | null;
  entityHref: string | null;
  entityEmptyLabel: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  status: EmailTrackingStatus;
  // Extra fields shown only in the expandable "View Details" panel - full
  // subject, sender/agent, Resend id, delivered/opened/clicked time,
  // failure or bounce reason, etc. Callers decide which fields apply to
  // their own tracking table, so this stays a plain label/value list
  // instead of a fixed shape.
  details: EmailTrackingDetail[];
};

// Shared, presentation-only Email Tracking table for both the Growth CRM
// (/admin/crm/emails) and the Lead Generation CRM (/leadgen/admin/emails).
// Deliberately knows nothing about crm_lead_emails vs leadgen_emails, RLS,
// or auth - each page fetches its own data and normalizes it into
// EmailTrackingRecord[] before handing it here, keeping the two CRMs'
// data-access code uncoupled while giving admins the same look and
// behavior in both places.
//
// Renders a fixed-width, non-scrolling table on md+ screens (Delivery
// Status is always one of the visible columns, never behind a horizontal
// scrollbar) and stacked cards below md. Full details (Resend id,
// timestamps, bounce/failure reason, ...) live behind a "View Details"
// toggle rather than in the main row, which is what keeps the row width
// bounded regardless of how long a subject or address gets.
export default function EmailTrackingTable({
  records,
  emptyMessage = "No tracked emails yet.",
}: {
  records: EmailTrackingRecord[];
  emptyMessage?: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const statusOptions = useMemo(() => {
    const seen = new Map<string, EmailTrackingStatus>();
    for (const record of records) {
      if (!seen.has(record.status.value)) seen.set(record.status.value, record.status);
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((record) => {
      if (statusFilter !== "all" && record.status.value !== statusFilter) return false;
      if (!q) return true;
      const haystack = [record.entityLabel, record.recipientEmail, record.recipientName, record.subject]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [records, query, statusFilter]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (records.length === 0) {
    return <p className="text-[13.5px] text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, or subject"
            className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 outline-none focus:border-sky-400"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-slate-400">
          {filtered.length} of {records.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13.5px] text-slate-500">No emails match your search.</p>
      ) : (
        <>
          {/* Desktop / tablet: fixed-width table, never wider than its
              container - long values truncate with an ellipsis instead of
              forcing horizontal scroll, so Delivery Status stays visible. */}
          <div className="hidden md:block">
            <table className="w-full table-fixed border-collapse text-left text-[13px]">
              <colgroup>
                <col className="w-[13%]" />
                <col className="w-[19%]" />
                <col className="w-[19%]" />
                <col className="w-[27%]" />
                <col className="w-[13%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                  <th className="py-2 pr-3">Sent</th>
                  <th className="py-2 pr-3">Lead / Business</th>
                  <th className="py-2 pr-3">Recipient</th>
                  <th className="py-2 pr-3">Subject</th>
                  <th className="py-2 pr-3">Delivery Status</th>
                  <th className="py-2 pr-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => {
                  const isOpen = expanded.has(record.id);
                  return (
                    <Fragment key={record.id}>
                      <tr className="border-b border-slate-100 align-top">
                        <td className="truncate py-2.5 pr-3 text-slate-600">{new Date(record.sentAt).toLocaleString()}</td>
                        <td className="truncate py-2.5 pr-3">
                          {record.entityLabel && record.entityHref ? (
                            <Link href={record.entityHref} className="truncate font-medium text-sky-600 hover:text-sky-700" title={record.entityLabel}>
                              {record.entityLabel}
                            </Link>
                          ) : record.entityLabel ? (
                            <span className="text-slate-700">{record.entityLabel}</span>
                          ) : (
                            <span className="text-slate-500">{record.entityEmptyLabel}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          {record.recipientName && (
                            <div className="truncate font-medium text-slate-700" title={record.recipientName}>
                              {record.recipientName}
                            </div>
                          )}
                          <div className="truncate text-slate-500" title={record.recipientEmail}>
                            {record.recipientEmail}
                          </div>
                        </td>
                        <td className="truncate py-2.5 pr-3 text-slate-700" title={record.subject}>
                          {record.subject}
                        </td>
                        <td className="py-2.5 pr-3">
                          <StatusBadge label={record.status.label} className={record.status.className} />
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(record.id)}
                            aria-expanded={isOpen}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700"
                          >
                            {isOpen ? "Hide" : "View"}
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-slate-100 bg-slate-50/70">
                          <td colSpan={6} className="px-3 py-4">
                            <DetailsGrid details={record.details} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: one stacked card per email instead of a sideways-
              scrolling table. */}
          <div className="space-y-3 md:hidden">
            {filtered.map((record) => {
              const isOpen = expanded.has(record.id);
              return (
                <div key={record.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {record.entityLabel && record.entityHref ? (
                        <Link href={record.entityHref} className="block truncate font-semibold text-sky-600 hover:text-sky-700">
                          {record.entityLabel}
                        </Link>
                      ) : (
                        <span className="block truncate font-semibold text-slate-700">{record.entityLabel ?? record.entityEmptyLabel}</span>
                      )}
                      <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{new Date(record.sentAt).toLocaleString()}</p>
                    </div>
                    <StatusBadge label={record.status.label} className={record.status.className} />
                  </div>

                  <div className="mt-3 space-y-1 text-[13px]">
                    {record.recipientName && <p className="truncate font-medium text-slate-700">{record.recipientName}</p>}
                    <p className="truncate text-slate-500">{record.recipientEmail}</p>
                    <p className="truncate text-slate-700" title={record.subject}>
                      {record.subject}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpanded(record.id)}
                    aria-expanded={isOpen}
                    className="mt-3 inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700"
                  >
                    {isOpen ? "Hide details" : "View details"}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <DetailsGrid details={record.details} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function DetailsGrid({ details }: { details: EmailTrackingDetail[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {details.map((detail) => (
        <div key={detail.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase text-slate-400">{detail.label}</dt>
          <dd className="mt-0.5 break-words text-[13px] text-slate-700">{detail.value}</dd>
        </div>
      ))}
    </dl>
  );
}
