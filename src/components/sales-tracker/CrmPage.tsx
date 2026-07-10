"use client";

import { Suspense, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  getLeads,
  getServerLeadsSnapshot,
  subscribeToLeads,
  updateLeadStatus,
  deleteLead,
  isFollowUpDue,
  formatCurrency,
  LEAD_STATUSES,
  type LeadStatus,
} from "@/lib/leads";
import AddedBanner from "./AddedBanner";

const STATUS_COLORS: Record<LeadStatus, string> = {
  "New Lead": "text-[var(--color-ink)]",
  Contacted: "text-[var(--color-accent-soft-text)]",
  Interested: "text-[var(--color-green-soft-text)]",
  "Proposal Sent": "text-[var(--color-orange)]",
  "Follow-Up": "text-[var(--color-orange)]",
  Won: "text-[var(--color-green-soft-text)] font-bold",
  Lost: "text-red-600",
};

export default function CrmPage() {
  const leads = useSyncExternalStore(subscribeToLeads, getLeads, getServerLeadsSnapshot);
  const [search, setSearch] = useState("");

  const totalLeads = leads.length;
  const interested = leads.filter((l) => l.status === "Interested").length;
  const won = leads.filter((l) => l.status === "Won").length;
  const followUpsDue = leads.filter(isFollowUpDue).length;
  const pipelineValue = leads
    .filter((l) => l.status !== "Lost")
    .reduce((sum, l) => sum + (Number(l.dealValue) || 0), 0);

  const stats = [
    { label: "Total Leads", value: String(totalLeads) },
    { label: "Interested", value: String(interested) },
    { label: "Won", value: String(won) },
    { label: "Follow-ups Due", value: String(followUpsDue) },
    { label: "Total Pipeline Value", value: formatCurrency(pipelineValue) },
  ];

  const query = search.trim().toLowerCase();
  const filtered = query
    ? leads.filter(
        (l) =>
          l.businessName.toLowerCase().includes(query) ||
          l.contactName.toLowerCase().includes(query) ||
          l.phone.toLowerCase().includes(query)
      )
    : leads;
  const sorted = [...filtered].reverse();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-bold text-[var(--color-ink-strong)]">
            Sales Tracker
          </h1>
          <p className="mt-1 text-[14.5px] text-[var(--color-text-muted)]">
            A quick snapshot of your sales pipeline.
          </p>
        </div>
        <Link
          href="/sales-tracker/add-lead"
          className="whitespace-nowrap rounded-full bg-[var(--color-accent)] px-5 py-[11px] text-[14.5px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          + Add Lead
        </Link>
      </div>

      <Suspense fallback={null}>
        <AddedBanner />
      </Suspense>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5"
          >
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              {stat.label}
            </div>
            <div className="mt-2 font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company, contact, or phone..."
          className="w-full max-w-sm rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-[10px] text-[14px]"
        />
      </div>

      {totalLeads === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No leads yet.{" "}
          <Link
            href="/sales-tracker/add-lead"
            className="font-semibold text-[var(--color-accent)]"
          >
            Add your first lead
          </Link>{" "}
          to get started.
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No leads match &ldquo;{search}&rdquo;.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-[var(--color-surface-warm)] text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Follow-up Date</th>
                <th className="px-4 py-3">Deal Value</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((lead) => (
                <tr
                  key={lead.id}
                  className={`border-t border-[var(--color-border-soft)] ${
                    isFollowUpDue(lead) ? "bg-[var(--color-accent-soft)]/40" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium">{lead.businessName}</td>
                  <td className="px-4 py-3">{lead.contactName}</td>
                  <td className="px-4 py-3">{lead.phone}</td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.status}
                      onChange={(e) => {
                        updateLeadStatus(lead.id, e.target.value as LeadStatus);
                      }}
                      className={`rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2 py-1.5 text-[12.5px] font-semibold ${STATUS_COLORS[lead.status]}`}
                    >
                      {LEAD_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">{lead.followUpDate}</td>
                  <td className="px-4 py-3">{formatCurrency(lead.dealValue)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete lead "${lead.businessName}"?`)) {
                          deleteLead(lead.id);
                        }
                      }}
                      className="rounded-full border border-red-300 px-3 py-1 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-600 hover:text-white"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
