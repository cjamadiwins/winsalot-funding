"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ClientListRow } from "@/lib/crm-clients-data";
import {
  CLIENT_CURRENCIES,
  CLIENT_CURRENCY_LABELS,
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_STYLES,
  DEFAULT_CLIENT_CURRENCY,
  formatCurrency,
} from "@/lib/crm-clients-types";

type ActionResult = { error?: string; clientId?: string };
type AgentOption = { id: string; full_name: string; email: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";

export default function AdminClientsClient({
  clients,
  agents,
  createAction,
  archiveAction,
  reactivateAction,
  deleteAction,
  initialFilters,
}: {
  clients: ClientListRow[];
  agents: AgentOption[];
  createAction: (formData: FormData) => Promise<ActionResult>;
  archiveAction: (clientId: string) => Promise<ActionResult>;
  reactivateAction: (clientId: string) => Promise<ActionResult>;
  deleteAction: (clientId: string) => Promise<ActionResult>;
  initialFilters: { search: string; status: string; service: string; agent: string };
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    });
  }

  function handleArchive(c: ClientListRow) {
    if (!window.confirm(`Archive ${c.company_name}? Their invoices, payments, appointments, and agent assignments are all preserved - reactivating later restores their current status (${c.status}).`)) return;
    runAction(() => archiveAction(c.id));
  }

  function handleReactivate(c: ClientListRow) {
    runAction(() => reactivateAction(c.id));
  }

  function handleDelete(c: ClientListRow) {
    if (!window.confirm(`Permanently delete ${c.company_name}? This cannot be undone. This is only allowed when the client has no related appointments, invoices, payments, or agent assignments - if any exist, archive instead.`)) return;
    runAction(() => deleteAction(c.id));
  }

  return (
    <div>
      <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Search</label>
          <input type="text" name="search" defaultValue={initialFilters.search} placeholder="Company, contact, or email" className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Status</label>
          <select name="status" defaultValue={initialFilters.status} className={inputClass}>
            <option value="">All statuses</option>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CLIENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Service</label>
          <input type="text" name="service" defaultValue={initialFilters.service} placeholder="e.g. Lead generation" className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Assigned Agent</label>
          <select name="agent" defaultValue={initialFilters.agent} className={inputClass}>
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name || a.email}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4 flex gap-3">
          <button type="submit" className="rounded-full bg-slate-700 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Apply Filters
          </button>
          <Link href="/admin/crm/clients" className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Clear
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="ml-auto rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            {showCreate ? "Close" : "+ New Client"}
          </button>
        </div>
      </form>

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {showCreate && (
        <form
          action={(fd) => runAction(() => createAction(fd), () => setShowCreate(false))}
          className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Company Name *</span>
            <input type="text" name="company_name" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Primary Contact</span>
            <input type="text" name="primary_contact_name" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Email</span>
            <input type="email" name="email" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Phone</span>
            <input type="text" name="phone" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Website</span>
            <input type="text" name="website" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Service / Package</span>
            <input type="text" name="service" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Monthly Price</span>
            <input type="number" step="0.01" min="0" name="monthly_price" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Currency</span>
            <select name="currency" defaultValue={DEFAULT_CLIENT_CURRENCY} className={inputClass}>
              {CLIENT_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CLIENT_CURRENCY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Status</span>
            <select name="status" defaultValue="Prospect" className={inputClass}>
              {CLIENT_STATUSES.filter((s) => s !== "Archived").map((s) => (
                <option key={s} value={s}>
                  {CLIENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Start Date</span>
            <input type="date" name="start_date" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Renewal / End Date</span>
            <input type="date" name="renewal_date" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-3">
            <span className="text-[12px] font-medium text-slate-600">Billing Address</span>
            <input type="text" name="billing_address" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-3">
            <span className="text-[12px] font-medium text-slate-600">Internal Admin Notes</span>
            <textarea name="internal_notes" rows={2} className={inputClass} />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={isPending} className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {isPending ? "Creating…" : "Create Client"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
        <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned Agents</th>
              <th className="px-4 py-3">Invoices</th>
              <th className="px-4 py-3">Outstanding</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                  No clients match these filters.
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">
                  <Link href={`/admin/crm/clients/${c.id}`} className="hover:underline">
                    {c.company_name}
                  </Link>
                  {c.primary_contact_name && <div className="text-xs text-[var(--color-text-muted)]">{c.primary_contact_name}</div>}
                </td>
                <td className="px-4 py-3">{c.service || "-"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${CLIENT_STATUS_STYLES[c.status]}`}>
                    {CLIENT_STATUS_LABELS[c.status]}
                  </span>
                </td>
                <td className="px-4 py-3">{c.assignedAgentNames.length > 0 ? c.assignedAgentNames.join(", ") : "-"}</td>
                <td className="px-4 py-3">{c.invoiceCount}</td>
                <td className="px-4 py-3">{c.outstandingBalance > 0 ? formatCurrency(c.outstandingBalance, c.currency) : "-"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link href={`/admin/crm/clients/${c.id}`} className="text-[12px] font-semibold text-sky-600 hover:text-sky-700">
                      View / Edit
                    </Link>
                    {c.status === "Archived" ? (
                      <button type="button" disabled={isPending} onClick={() => handleReactivate(c)} className="text-[12px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                        Reactivate
                      </button>
                    ) : (
                      <button type="button" disabled={isPending} onClick={() => handleArchive(c)} className="text-[12px] font-semibold text-amber-600 hover:text-amber-700 disabled:opacity-50">
                        Archive
                      </button>
                    )}
                    <button type="button" disabled={isPending} onClick={() => handleDelete(c)} className="text-[12px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
