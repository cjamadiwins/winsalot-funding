"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_STYLES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  formatCad,
  formatInvoiceDate,
  type InvoiceStatus,
  type ProviderFinancialSummary,
  type ProviderInvoiceWithRelations,
  type ProviderPaymentRow,
} from "@/lib/provider-invoice-types";

const inputClass =
  "w-full rounded-[10px] border border-slate-300 bg-white px-3.5 py-2.5 text-[14px] text-slate-900";

type ActionResult = { error?: string; requiresOverpayConfirmation?: boolean; invoiceId?: string };

export type ProviderInvoicesActions = {
  createInvoice: (providerId: string, formData: FormData) => Promise<ActionResult>;
  updateInvoice: (invoiceId: string, providerId: string, formData: FormData) => Promise<ActionResult>;
  markSent: (invoiceId: string, providerId: string) => Promise<ActionResult>;
  cancelInvoice: (invoiceId: string, providerId: string, formData: FormData) => Promise<ActionResult>;
  recordPayment: (invoiceId: string, providerId: string, formData: FormData) => Promise<ActionResult>;
  correctPayment: (paymentId: string, invoiceId: string, providerId: string, formData: FormData) => Promise<ActionResult>;
  reversePayment: (paymentId: string, invoiceId: string, providerId: string, formData: FormData) => Promise<ActionResult>;
  getReceiptUrl: (attachmentPath: string) => Promise<{ url: string | null }>;
};

type LineItemDraft = { description: string; quantity: string; unit_price: string };

function emptyLineItem(): LineItemDraft {
  return { description: "", quantity: "1", unit_price: "0" };
}

function lastPaymentDate(invoice: ProviderInvoiceWithRelations): string | null {
  const dates = invoice.payments.filter((p) => !p.reversed_at).map((p) => p.payment_date);
  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? null;
}

// Provider Profile's "Invoices & Payments" section (brief section 1-7) -
// admin-only (see AdminOperationalProviderDetailClient, the only caller);
// never rendered for the agent-facing provider profile at all.
export default function ProviderInvoicesSection({
  providerId,
  summary,
  invoices,
  actions,
}: {
  providerId: string;
  summary: ProviderFinancialSummary;
  invoices: ProviderInvoiceWithRelations[];
  actions: ProviderInvoicesActions;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");

  function runAction(fn: () => Promise<ActionResult>, onSuccess?: (result: ActionResult) => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else onSuccess?.(result);
    });
  }

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return invoices.filter((invoice) => {
      if (statusFilter !== "all" && invoice.status !== statusFilter) return false;
      if (!query) return true;
      return (
        invoice.invoice_number.toLowerCase().includes(query) ||
        (invoice.description ?? "").toLowerCase().includes(query)
      );
    });
  }, [invoices, query, statusFilter]);

  const detailInvoice = detailInvoiceId ? invoices.find((i) => i.id === detailInvoiceId) ?? null : null;

  return (
    <section id="invoices" className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Invoices &amp; Payments</h2>
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-sky-700"
        >
          + Create Invoice
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <FinancialSummaryCards summary={summary} />

      <div className="mt-5 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by invoice number or description..."
          className="w-full max-w-xs rounded-[10px] border border-slate-300 bg-white px-3.5 py-2.5 text-[13.5px]"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "all")}
          className="rounded-[10px] border border-slate-300 bg-white px-3.5 py-2.5 text-[13.5px]"
        >
          <option value="all">All statuses</option>
          {INVOICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {INVOICE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-[13.5px] text-slate-500">
            {invoices.length === 0 ? "No invoices yet for this provider." : "No invoices match your search/filter."}
          </p>
        ) : (
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Invoice #</th>
                <th className="py-2 pr-3">Invoice Date</th>
                <th className="py-2 pr-3">Due Date</th>
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3 text-right">Paid</th>
                <th className="py-2 pr-3 text-right">Balance</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Last Payment</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((invoice) => {
                const lastPayment = lastPaymentDate(invoice);
                return (
                  <tr key={invoice.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">{invoice.invoice_number}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{formatInvoiceDate(invoice.invoice_date)}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{formatInvoiceDate(invoice.due_date)}</td>
                    <td className="py-2.5 pr-3 max-w-[180px] truncate text-slate-600">{invoice.description || "—"}</td>
                    <td className="py-2.5 pr-3 text-right font-medium text-slate-900">{formatCad(invoice.total)}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-600">{formatCad(invoice.amount_paid)}</td>
                    <td className="py-2.5 pr-3 text-right font-medium text-slate-900">{formatCad(invoice.balance)}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${INVOICE_STATUS_STYLES[invoice.status]}`}>
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{lastPayment ? formatInvoiceDate(lastPayment) : "—"}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-2.5">
                        <button type="button" onClick={() => setDetailInvoiceId(invoice.id)} className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
                          View
                        </button>
                        {invoice.status === "draft" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => runAction(() => actions.markSent(invoice.id, providerId))}
                            className="text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800"
                          >
                            Mark Sent
                          </button>
                        )}
                        {invoice.status !== "cancelled" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              const reason = prompt(`Reason for cancelling invoice ${invoice.invoice_number}?`);
                              if (reason && reason.trim()) {
                                const formData = new FormData();
                                formData.set("reason", reason.trim());
                                runAction(() => actions.cancelInvoice(invoice.id, providerId, formData));
                              }
                            }}
                            className="text-[12.5px] font-semibold text-rose-600 hover:text-rose-700"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreateForm && (
        <InvoiceFormModal
          title="Create Invoice"
          providerId={providerId}
          isPending={isPending}
          onClose={() => setShowCreateForm(false)}
          onSubmit={(formData) =>
            new Promise<ActionResult>((resolve) => {
              runAction(
                () => actions.createInvoice(providerId, formData),
                (result) => {
                  setShowCreateForm(false);
                  resolve(result);
                }
              );
            })
          }
        />
      )}

      {detailInvoice && (
        <InvoiceDetailModal
          invoice={detailInvoice}
          providerId={providerId}
          actions={actions}
          isPending={isPending}
          runAction={runAction}
          onClose={() => setDetailInvoiceId(null)}
        />
      )}
    </section>
  );
}

function FinancialSummaryCards({ summary }: { summary: ProviderFinancialSummary }) {
  const stats: { label: string; value: string; emphasis?: string }[] = [
    { label: "Total Invoiced", value: formatCad(summary.totalInvoiced) },
    { label: "Total Payments Received", value: formatCad(summary.totalPaid), emphasis: "text-emerald-700" },
    { label: "Outstanding Balance", value: formatCad(summary.outstandingBalance), emphasis: summary.outstandingBalance > 0 ? "text-amber-700" : undefined },
    { label: "Overdue Balance", value: formatCad(summary.overdueBalance), emphasis: summary.overdueBalance > 0 ? "text-rose-700" : undefined },
    { label: "Unpaid Invoices", value: String(summary.unpaidInvoiceCount) },
    { label: "Last Payment Date", value: summary.lastPaymentDate ? formatInvoiceDate(summary.lastPaymentDate) : "No payments yet" },
  ];
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{stat.label}</div>
          <div className={`mt-1 text-[15px] font-bold ${stat.emphasis ?? "text-slate-900"}`}>{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

function LineItemsEditor({
  items,
  setItems,
}: {
  items: LineItemDraft[];
  setItems: (items: LineItemDraft[]) => void;
}) {
  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    return sum + qty * price;
  }, 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-600">Line Items</span>
        <button
          type="button"
          onClick={() => setItems([...items, emptyLineItem()])}
          className="text-[12.5px] font-semibold text-sky-600"
        >
          + Add Line Item
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {items.map((item, index) => (
          <div key={index} className="grid grid-cols-[1fr_70px_90px_auto] items-center gap-2">
            <input
              placeholder="Description"
              required
              value={item.description}
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...next[index], description: e.target.value };
                setItems(next);
              }}
              className={inputClass}
            />
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Qty"
              required
              value={item.quantity}
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...next[index], quantity: e.target.value };
                setItems(next);
              }}
              className={inputClass}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Unit Price"
              required
              value={item.unit_price}
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...next[index], unit_price: e.target.value };
                setItems(next);
              }}
              className={inputClass}
            />
            <button
              type="button"
              disabled={items.length === 1}
              onClick={() => setItems(items.filter((_, i) => i !== index))}
              className="text-[12.5px] font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-right text-[13px] font-semibold text-slate-700">Subtotal: {formatCad(subtotal)}</p>
    </div>
  );
}

function InvoiceFormModal({
  title,
  providerId,
  invoice,
  isPending,
  onClose,
  onSubmit,
}: {
  title: string;
  providerId: string;
  invoice?: ProviderInvoiceWithRelations;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
}) {
  const [items, setItems] = useState<LineItemDraft[]>(
    invoice && invoice.lineItems.length > 0
      ? invoice.lineItems.map((li) => ({ description: li.description, quantity: String(li.quantity), unit_price: String(li.unit_price) }))
      : [emptyLineItem()]
  );
  const [discount, setDiscount] = useState(invoice ? String(invoice.discount_amount) : "0");
  const [tax, setTax] = useState(invoice ? String(invoice.tax_amount) : "0");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
  const total = subtotal - (Number(discount) || 0) + (Number(tax) || 0);

  async function handleSubmit(formData: FormData) {
    formData.set(
      "line_items",
      JSON.stringify(items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })))
    );
    setSubmitting(true);
    setFormError(null);
    const result = await onSubmit(formData);
    setSubmitting(false);
    if (result.error) setFormError(result.error);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <form action={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Invoice Date</span>
              <input type="date" name="invoice_date" defaultValue={invoice?.invoice_date ?? today} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Payment Due Date</span>
              <input type="date" name="due_date" required defaultValue={invoice?.due_date} className={inputClass} />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Description / Service Period</span>
            <input name="description" defaultValue={invoice?.description ?? ""} placeholder="e.g. Referral fees — June 2026" className={inputClass} />
          </label>

          <LineItemsEditor items={items} setItems={setItems} />

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Discount (CA$, optional)</span>
              <input type="number" min="0" step="0.01" name="discount_amount" value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Tax (CA$, optional)</span>
              <input type="number" min="0" step="0.01" name="tax_amount" value={tax} onChange={(e) => setTax(e.target.value)} className={inputClass} />
            </label>
          </div>

          <p className="text-right text-[15px] font-bold text-slate-900">Invoice Total: {formatCad(total)}</p>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Internal Administrative Notes</span>
            <textarea name="internal_notes" defaultValue={invoice?.internal_notes ?? ""} className={`${inputClass} min-h-[60px] resize-y`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Payment Instructions</span>
            <textarea name="payment_instructions" defaultValue={invoice?.payment_instructions ?? ""} className={`${inputClass} min-h-[60px] resize-y`} />
          </label>

          {!invoice && (
            <label className="flex items-center gap-2 text-[13.5px] text-slate-700">
              <input type="checkbox" name="mark_as_sent" value="true" />
              Mark as Sent immediately (skip Draft)
            </label>
          )}

          {formError && <p className="text-[13px] font-medium text-rose-600">{formError}</p>}

          <div className="flex flex-wrap gap-3 pt-1">
            <button type="submit" disabled={submitting || isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Saving…" : invoice ? "Save Changes" : "Create Invoice"}
            </button>
            <button type="button" onClick={onClose} disabled={submitting} className="text-[13.5px] font-semibold text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          </div>
          <input type="hidden" name="provider_id" value={providerId} />
        </form>
      </div>
    </div>
  );
}

function InvoiceDetailModal({
  invoice,
  providerId,
  actions,
  isPending,
  runAction,
  onClose,
}: {
  invoice: ProviderInvoiceWithRelations;
  providerId: string;
  actions: ProviderInvoicesActions;
  isPending: boolean;
  runAction: (fn: () => Promise<ActionResult>, onSuccess?: (result: ActionResult) => void) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [overpayPending, setOverpayPending] = useState<FormData | null>(null);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string | null>>({});

  if (editing) {
    return (
      <InvoiceFormModal
        title={`Edit ${invoice.invoice_number}`}
        providerId={providerId}
        invoice={invoice}
        isPending={isPending}
        onClose={() => setEditing(false)}
        onSubmit={(formData) =>
          new Promise<ActionResult>((resolve) => {
            runAction(
              () => actions.updateInvoice(invoice.id, providerId, formData),
              (result) => {
                setEditing(false);
                resolve(result);
              }
            );
          })
        }
      />
    );
  }

  async function handleRecordPayment(formData: FormData) {
    const result = await new Promise<ActionResult>((resolve) => {
      runAction(
        () => actions.recordPayment(invoice.id, providerId, formData),
        (r) => resolve(r)
      );
    });
    return result;
  }

  async function loadReceiptUrl(payment: ProviderPaymentRow) {
    if (!payment.attachment_path || receiptUrls[payment.id] !== undefined) return;
    const result = await actions.getReceiptUrl(payment.attachment_path);
    setReceiptUrls((prev) => ({ ...prev, [payment.id]: result.url }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Invoice ${invoice.invoice_number}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
      >
        <div id="printable-invoice">
          <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
            <div>
              <h2 className="text-[19px] font-bold text-slate-900">Invoice {invoice.invoice_number}</h2>
              <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${INVOICE_STATUS_STYLES[invoice.status]}`}>
                {INVOICE_STATUS_LABELS[invoice.status]}
              </span>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
              ✕
            </button>
          </div>

          <div className="mt-4 hidden print:block">
            <h1 className="text-xl font-bold">Invoice {invoice.invoice_number}</h1>
            <p className="text-sm">Status: {INVOICE_STATUS_LABELS[invoice.status]}</p>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-[13.5px] sm:grid-cols-3">
            <Row label="Invoice Date" value={formatInvoiceDate(invoice.invoice_date)} />
            <Row label="Due Date" value={formatInvoiceDate(invoice.due_date)} />
            <Row label="Description" value={invoice.description || "—"} />
          </dl>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2 pr-3 text-right">Unit Price</th>
                  <th className="py-2 pr-3 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{item.description}</td>
                    <td className="py-2 pr-3 text-right">{item.quantity}</td>
                    <td className="py-2 pr-3 text-right">{formatCad(item.unit_price)}</td>
                    <td className="py-2 pr-3 text-right font-medium">{formatCad(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 ml-auto max-w-xs space-y-1 text-[13.5px]">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatCad(invoice.subtotal)}</span></div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>-{formatCad(invoice.discount_amount)}</span></div>
            )}
            {invoice.tax_amount > 0 && (
              <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{formatCad(invoice.tax_amount)}</span></div>
            )}
            <div className="flex justify-between font-bold text-slate-900"><span>Total</span><span>{formatCad(invoice.total)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Amount Paid</span><span>{formatCad(invoice.amount_paid)}</span></div>
            <div className="flex justify-between font-bold text-slate-900"><span>Balance</span><span>{formatCad(invoice.balance)}</span></div>
          </div>

          {invoice.payment_instructions && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]">
              <div className="font-semibold text-slate-600">Payment Instructions</div>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{invoice.payment_instructions}</p>
            </div>
          )}
          {invoice.internal_notes && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px] print:hidden">
              <div className="font-semibold text-slate-600">Internal Administrative Notes</div>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{invoice.internal_notes}</p>
            </div>
          )}
          {invoice.status === "cancelled" && invoice.cancel_reason && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700 print:hidden">
              Cancelled: {invoice.cancel_reason}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5 print:hidden">
          {invoice.status !== "cancelled" && (
            <button type="button" onClick={() => setEditing(true)} className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-400">
              Edit
            </button>
          )}
          {invoice.status === "draft" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => runAction(() => actions.markSent(invoice.id, providerId))}
              className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-emerald-700 hover:border-emerald-300"
            >
              Mark as Sent
            </button>
          )}
          {invoice.status !== "cancelled" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setShowPaymentForm((v) => !v)}
              className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-400"
            >
              {showPaymentForm ? "Cancel Payment" : "Record Payment"}
            </button>
          )}
          <button type="button" onClick={() => window.print()} className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-400">
            Print / Download
          </button>
          {invoice.status !== "cancelled" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                const reason = prompt(`Reason for cancelling invoice ${invoice.invoice_number}?`);
                if (reason && reason.trim()) {
                  const formData = new FormData();
                  formData.set("reason", reason.trim());
                  runAction(() => actions.cancelInvoice(invoice.id, providerId, formData));
                }
              }}
              className="rounded-full border border-rose-300 px-4 py-2 text-[13px] font-semibold text-rose-700 hover:border-rose-400"
            >
              Cancel Invoice
            </button>
          )}
        </div>

        {showPaymentForm && (
          <RecordPaymentForm
            isPending={isPending}
            overpayPending={overpayPending}
            onSubmit={async (formData) => {
              const result = await handleRecordPayment(formData);
              if (result.requiresOverpayConfirmation) {
                setOverpayPending(formData);
                return result;
              }
              if (!result.error) {
                setShowPaymentForm(false);
                setOverpayPending(null);
              }
              return result;
            }}
            onConfirmOverpay={async () => {
              if (!overpayPending) return {};
              overpayPending.set("allow_overpayment", "true");
              const result = await handleRecordPayment(overpayPending);
              if (!result.error) {
                setShowPaymentForm(false);
                setOverpayPending(null);
              }
              return result;
            }}
          />
        )}

        <div className="mt-6 print:hidden">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Payment History</h3>
          {invoice.payments.length === 0 ? (
            <p className="mt-2 text-[13.5px] text-slate-500">No payments recorded yet.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2 pr-3">Method</th>
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2 pr-3">Notes</th>
                    <th className="py-2 pr-3">Recorded By</th>
                    <th className="py-2 pr-3">Recorded At</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((payment) => (
                    <Fragment key={payment.id}>
                      <tr className={`border-b border-slate-100 ${payment.reversed_at ? "opacity-50" : ""}`}>
                        <td className="py-2 pr-3">{formatInvoiceDate(payment.payment_date)}</td>
                        <td className="py-2 pr-3 text-right font-medium">{formatCad(payment.amount)}</td>
                        <td className="py-2 pr-3">{PAYMENT_METHOD_LABELS[payment.payment_method]}</td>
                        <td className="py-2 pr-3">{payment.reference_number || "—"}</td>
                        <td className="py-2 pr-3 max-w-[140px] truncate">{payment.notes || "—"}</td>
                        <td className="py-2 pr-3">{payment.recorded_by_name}</td>
                        <td className="py-2 pr-3">{new Date(payment.created_at).toLocaleString()}</td>
                        <td className="py-2 pr-3">
                          {payment.reversed_at ? (
                            <span className="text-[11.5px] font-semibold text-rose-600">Reversed</span>
                          ) : (
                            <div className="flex gap-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  loadReceiptUrl(payment);
                                  setCorrectingId(correctingId === payment.id ? null : payment.id);
                                }}
                                className="text-[12px] font-semibold text-sky-600 hover:text-sky-700"
                              >
                                {correctingId === payment.id ? "Close" : "Correct"}
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => {
                                  if (!confirm(`Reverse this ${formatCad(payment.amount)} payment? This cannot be undone.`)) return;
                                  const reason = prompt("Reason for reversing this payment?");
                                  if (!reason || !reason.trim()) return;
                                  const formData = new FormData();
                                  formData.set("reason", reason.trim());
                                  runAction(() => actions.reversePayment(payment.id, invoice.id, providerId, formData));
                                }}
                                className="text-[12px] font-semibold text-rose-600 hover:text-rose-700"
                              >
                                Reverse
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {correctingId === payment.id && (
                        <tr>
                          <td colSpan={8} className="bg-slate-50 px-3 py-3">
                            {payment.attachment_path && (
                              <p className="mb-2 text-[12.5px]">
                                Receipt:{" "}
                                {receiptUrls[payment.id] ? (
                                  <a href={receiptUrls[payment.id]!} target="_blank" rel="noreferrer" className="font-semibold text-sky-600">
                                    View attachment
                                  </a>
                                ) : (
                                  "Loading…"
                                )}
                              </p>
                            )}
                            <CorrectPaymentForm
                              payment={payment}
                              isPending={isPending}
                              onSubmit={(formData) =>
                                new Promise<ActionResult>((resolve) => {
                                  runAction(
                                    () => actions.correctPayment(payment.id, invoice.id, providerId, formData),
                                    (result) => {
                                      if (!result.error) setCorrectingId(null);
                                      resolve(result);
                                    }
                                  );
                                })
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordPaymentForm({
  isPending,
  overpayPending,
  onSubmit,
  onConfirmOverpay,
}: {
  isPending: boolean;
  overpayPending: FormData | null;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onConfirmOverpay: () => Promise<ActionResult>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setFormError(null);
    const result = await onSubmit(formData);
    setSubmitting(false);
    if (result.error) setFormError(result.error);
  }

  return (
    <form action={handleSubmit} className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4 print:hidden">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-600">Payment Date</span>
          <input type="date" name="payment_date" defaultValue={today} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-600">Amount Received</span>
          <input type="number" name="amount" min="0.01" step="0.01" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-600">Payment Method</span>
          <select name="payment_method" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select…
            </option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-600">Transaction / Reference Number</span>
          <input name="reference_number" className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Notes</span>
        <textarea name="notes" className={`${inputClass} min-h-[50px] resize-y`} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Receipt Attachment (optional)</span>
        <input type="file" name="attachment" className="text-[13px]" />
      </label>

      {formError && <p className="text-[13px] font-medium text-rose-600">{formError}</p>}
      {overpayPending && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800">
          <p>This payment exceeds the remaining balance.</p>
          <button
            type="button"
            disabled={submitting || isPending}
            onClick={async () => {
              setSubmitting(true);
              const result = await onConfirmOverpay();
              setSubmitting(false);
              if (result.error) setFormError(result.error);
            }}
            className="mt-2 rounded-full bg-amber-600 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-amber-700"
          >
            Confirm Overpayment
          </button>
        </div>
      )}

      <button type="submit" disabled={submitting || isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
        {submitting ? "Saving…" : "Save Payment"}
      </button>
    </form>
  );
}

function CorrectPaymentForm({
  payment,
  isPending,
  onSubmit,
}: {
  payment: ProviderPaymentRow;
  isPending: boolean;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [overpayConfirm, setOverpayConfirm] = useState(false);

  async function handleSubmit(formData: FormData) {
    if (overpayConfirm) formData.set("allow_overpayment", "true");
    setSubmitting(true);
    setFormError(null);
    const result = await onSubmit(formData);
    setSubmitting(false);
    if (result.requiresOverpayConfirmation) {
      setOverpayConfirm(true);
      setFormError(result.error ?? null);
      return;
    }
    if (result.error) setFormError(result.error);
  }

  return (
    <form action={handleSubmit} className="space-y-2.5">
      <p className="text-[12.5px] font-semibold text-slate-600">Correct this payment</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <input type="date" name="payment_date" defaultValue={payment.payment_date} className={inputClass} />
        <input type="number" name="amount" min="0.01" step="0.01" defaultValue={payment.amount} required className={inputClass} />
        <select name="payment_method" defaultValue={payment.payment_method} className={inputClass}>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </option>
          ))}
        </select>
        <input name="reference_number" defaultValue={payment.reference_number ?? ""} className={inputClass} />
      </div>
      <textarea name="notes" defaultValue={payment.notes ?? ""} className={`${inputClass} min-h-[45px] resize-y`} />
      <input name="reason" required placeholder="Reason for this correction (required)" className={inputClass} />
      {formError && <p className="text-[12.5px] font-medium text-rose-600">{formError}</p>}
      {overpayConfirm && (
        <p className="text-[12.5px] text-amber-700">Submitting again will confirm this as an intentional overpayment.</p>
      )}
      <button type="submit" disabled={submitting || isPending} className="rounded-full bg-slate-800 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-slate-700">
        {submitting ? "Saving…" : overpayConfirm ? "Confirm & Save" : "Save Correction"}
      </button>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value}</dd>
    </div>
  );
}
