"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CrmInvoiceWithClient, InvoiceStatus } from "@/lib/crm-invoices-types";
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES, effectiveInvoiceStatus } from "@/lib/crm-invoices-types";
import type { InvoiceDashboardSummary } from "@/lib/crm-invoices-data";
import { formatCurrency } from "@/lib/crm-clients-types";
import LineItemsEditor, { type LineItemDraft } from "./LineItemsEditor";

type ActionResult = { error?: string; invoiceId?: string };
type ClientOption = { id: string; company_name: string; email: string | null; billing_address: string | null; currency: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminInvoicesClient({
  invoices,
  summary,
  clients,
  createAction,
  initialFilters,
  autoOpenCreateForClientId,
}: {
  invoices: CrmInvoiceWithClient[];
  summary: InvoiceDashboardSummary;
  clients: ClientOption[];
  createAction: (formData: FormData) => Promise<ActionResult>;
  initialFilters: { search: string; status: string; client: string };
  autoOpenCreateForClientId?: string;
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(!!autoOpenCreateForClientId);
  const [selectedClientId, setSelectedClientId] = useState(autoOpenCreateForClientId ?? "");
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  function handleCreate(formData: FormData) {
    formData.set("line_items", JSON.stringify(lineItems.filter((li) => li.description.trim())));
    setError(null);
    startTransition(async () => {
      const result = await createAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.invoiceId) router.push(`/admin/crm/invoices/${result.invoiceId}`);
    });
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-muted)]">Invoiced This Month</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(summary.totalInvoicedThisMonth, "USD")}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-muted)]">Collected This Month</div>
          <div className="mt-1 text-lg font-bold text-emerald-600">{formatCurrency(summary.totalCollectedThisMonth, "USD")}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-muted)]">Outstanding Balance</div>
          <div className="mt-1 text-lg font-bold text-amber-600">{formatCurrency(summary.outstandingBalance, "USD")}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-muted)]">Overdue Invoices</div>
          <div className="mt-1 text-lg font-bold text-rose-600">{summary.overdueCount}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-muted)]">Recent Payments</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{summary.recentPayments.length}</div>
        </div>
      </div>

      {summary.recentPayments.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Recent Payments</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {summary.recentPayments.slice(0, 5).map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>
                  {p.crm_clients?.company_name ?? "Unknown client"} — {formatDate(p.payment_date)}
                </span>
                <span className="font-medium">{formatCurrency(p.amount, p.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form method="get" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Search Invoice #</label>
          <input type="text" name="search" defaultValue={initialFilters.search} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Status</label>
          <select name="status" defaultValue={initialFilters.status} className={inputClass}>
            <option value="">All statuses</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INVOICE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-slate-600">Client</label>
          <select name="client" defaultValue={initialFilters.client} className={inputClass}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-3">
          <button type="submit" className="rounded-full bg-slate-700 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Apply Filters
          </button>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="ml-auto rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            {showCreate ? "Close" : "+ New Invoice"}
          </button>
        </div>
      </form>

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {showCreate && (
        <form action={handleCreate} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Client *</span>
              <select name="client_id" required value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className={inputClass}>
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Billing Contact Name</span>
              <input type="text" name="billing_contact_name" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Billing Address</span>
              <input type="text" name="billing_address" defaultValue={selectedClient?.billing_address ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Issue Date</span>
              <input type="date" name="issue_date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Due Date</span>
              <input type="date" name="due_date" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Currency</span>
              <input type="text" name="currency" defaultValue={selectedClient?.currency ?? "USD"} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Service Period Start</span>
              <input type="date" name="service_period_start" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Service Period End</span>
              <input type="date" name="service_period_end" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Tax Rate (%)</span>
              <input type="number" step="0.01" min="0" name="tax_rate" defaultValue={0} className={inputClass} />
              <span className="text-[11px] text-slate-500">Never assumed automatically - set the rate yourself if tax applies.</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Discount Amount</span>
              <input type="number" step="0.01" min="0" name="discount_amount" defaultValue={0} className={inputClass} />
            </label>
          </div>

          <div className="mt-4">
            <span className="text-[12px] font-medium text-slate-600">Line Items</span>
            <LineItemsEditor items={lineItems} onChange={setLineItems} currency={selectedClient?.currency ?? "USD"} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Payment Instructions</span>
              <textarea name="payment_instructions" rows={2} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Client-Facing Notes</span>
              <textarea name="client_facing_notes" rows={2} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[12px] font-medium text-slate-600">Internal Admin Notes</span>
              <textarea name="admin_notes" rows={2} className={inputClass} />
            </label>
          </div>

          <div className="mt-4">
            <button type="submit" disabled={isPending} className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {isPending ? "Creating…" : "Save as Draft"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
        <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Issue Date</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                  No invoices match these filters.
                </td>
              </tr>
            )}
            {invoices.map((inv) => {
              const effStatus: InvoiceStatus = effectiveInvoiceStatus(inv);
              return (
                <tr key={inv.id}>
                  <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">
                    <Link href={`/admin/crm/invoices/${inv.id}`} className="hover:underline">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{inv.crm_clients?.company_name ?? "-"}</td>
                  <td className="px-4 py-3">{formatDate(inv.issue_date)}</td>
                  <td className="px-4 py-3">{formatDate(inv.due_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${INVOICE_STATUS_STYLES[effStatus]}`}>
                      {INVOICE_STATUS_LABELS[effStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatCurrency(inv.total, inv.currency)}</td>
                  <td className="px-4 py-3">{formatCurrency(inv.balance, inv.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
