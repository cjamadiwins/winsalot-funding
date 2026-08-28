"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { InvoiceDetail } from "@/lib/crm-invoices-data";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES, effectiveInvoiceStatus, canPermanentlyDeleteInvoice, canPermanentlyDeleteTestInvoice } from "@/lib/crm-invoices-types";
import { CLIENT_CURRENCIES, CLIENT_CURRENCY_LABELS, formatCurrency, PAYMENT_METHOD_LABELS, canPermanentlyDeleteTestPayment } from "@/lib/crm-clients-types";
import LineItemsEditor, { type LineItemDraft } from "./LineItemsEditor";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import type { InvoiceEmailPreview } from "@/app/admin/(dashboard)/crm/invoices/actions";
import type { CrmInvoiceEmailType } from "@/lib/send-crm-invoice-email";

type ActionResult = { error?: string; invoiceId?: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function InvoiceDetailClient({
  detail,
  updateAction,
  duplicateAction,
  previewEmailAction,
  sendAction,
  recordPaymentAction,
  reversePaymentAction,
  markPaidAction,
  markPartiallyPaidAction,
  cancelAction,
  archiveAction,
  deleteAction,
  deleteTestInvoiceAction,
  deleteTestPaymentAction,
  sendReceiptAction,
}: {
  detail: InvoiceDetail;
  updateAction: (invoiceId: string, formData: FormData) => Promise<ActionResult>;
  duplicateAction: (invoiceId: string) => Promise<ActionResult>;
  previewEmailAction: (invoiceId: string, emailType: CrmInvoiceEmailType) => Promise<{ preview?: InvoiceEmailPreview; error?: string }>;
  sendAction: (invoiceId: string, emailType: "invoice_sent" | "invoice_reminder", confirmed: boolean, to: string, subject: string, message: string) => Promise<ActionResult>;
  recordPaymentAction: (invoiceId: string, formData: FormData) => Promise<ActionResult>;
  reversePaymentAction: (invoiceId: string, paymentId: string, reason: string) => Promise<ActionResult>;
  markPaidAction: (invoiceId: string) => Promise<ActionResult>;
  markPartiallyPaidAction: (invoiceId: string, formData: FormData) => Promise<ActionResult>;
  cancelAction: (invoiceId: string, reason: string) => Promise<ActionResult>;
  archiveAction: (invoiceId: string) => Promise<ActionResult>;
  deleteAction: (invoiceId: string) => Promise<ActionResult>;
  deleteTestInvoiceAction: (invoiceId: string, confirmationText: string) => Promise<ActionResult>;
  deleteTestPaymentAction: (paymentId: string, confirmationText: string) => Promise<ActionResult>;
  sendReceiptAction: (invoiceId: string, to: string, subject: string, message: string) => Promise<ActionResult>;
}) {
  const { invoice, client, lineItems, payments, audit } = detail;
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEdit = invoice.status !== "Cancelled" && invoice.status !== "Archived";
  // Lazily seeded from ?edit=1 (set by the invoice list's Manage menu's
  // "Edit Invoice" item) so this page opens straight into the editor -
  // read once on mount, not re-synced on every searchParams change.
  const [editing, setEditing] = useState(() => canEdit && searchParams.get("edit") === "1");
  const [draftItems, setDraftItems] = useState<LineItemDraft[]>(lineItems.map((li) => ({ description: li.description, quantity: li.quantity, unit_price: li.unit_price })));
  const [previewModal, setPreviewModal] = useState<{ emailType: CrmInvoiceEmailType; to: string; subject: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDeletePayment, setConfirmingDeletePayment] = useState<string | null>(null);

  const effStatus = effectiveInvoiceStatus(invoice);
  const isTestInvoice = canPermanentlyDeleteTestInvoice(invoice);
  const canDelete = isTestInvoice || canPermanentlyDeleteInvoice(invoice);
  const hasPayment = payments.some((p) => !p.reversed_at);

  function runAction(action: () => Promise<ActionResult>, onSuccess?: (result: ActionResult) => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.(result);
      router.refresh();
    });
  }

  function handleUpdate(formData: FormData) {
    formData.set("line_items", JSON.stringify(draftItems.filter((li) => li.description.trim())));
    runAction(() => updateAction(invoice.id, formData), () => setEditing(false));
  }

  async function openPreview(emailType: CrmInvoiceEmailType) {
    setError(null);
    const result = await previewEmailAction(invoice.id, emailType);
    if (result.error || !result.preview) {
      setError(result.error ?? "Failed to build the email preview.");
      return;
    }
    setPreviewModal({ emailType, to: result.preview.to, subject: result.preview.subject, message: result.preview.message });
  }

  function confirmSend() {
    if (!previewModal) return;
    const { emailType, to, subject, message } = previewModal;
    if (emailType === "invoice_receipt") {
      runAction(() => sendReceiptAction(invoice.id, to, subject, message), () => setPreviewModal(null));
      return;
    }
    const isFirstSend = emailType === "invoice_sent" && !invoice.first_sent_at;
    runAction(() => sendAction(invoice.id, emailType, isFirstSend, to, subject, message), () => setPreviewModal(null));
  }

  function handleCancel() {
    const reason = window.prompt("Reason for cancelling this invoice:");
    if (reason === null) return;
    runAction(() => cancelAction(invoice.id, reason));
  }

  function handleArchive() {
    if (!window.confirm("Archive this invoice? It will remain in the system for historical record-keeping.")) return;
    runAction(() => archiveAction(invoice.id));
  }

  function handleDelete() {
    if (!canDelete) {
      window.alert("Only a Draft or Cancelled invoice with no payment history can be permanently deleted. Sent, Partially Paid, and Paid invoices are financial records.");
      return;
    }
    setConfirmingDelete(true);
  }

  function confirmDeleteInvoice() {
    runAction(
      () => (isTestInvoice ? deleteTestInvoiceAction(invoice.id, "DELETE") : deleteAction(invoice.id)),
      () => router.push("/admin/crm/invoices?deleted=1")
    );
  }

  function handleDeleteTestPayment(paymentId: string) {
    setConfirmingDeletePayment(paymentId);
  }

  function confirmDeleteTestPayment() {
    if (!confirmingDeletePayment) return;
    runAction(() => deleteTestPaymentAction(confirmingDeletePayment, "DELETE"), () => setConfirmingDeletePayment(null));
  }

  function handleMarkPartiallyPaid() {
    const amountStr = window.prompt(`Enter the amount to record as partially paid (balance due: ${formatCurrency(invoice.balance, invoice.currency)}):`);
    if (amountStr === null) return;
    const fd = new FormData();
    fd.set("amount", amountStr);
    runAction(() => markPartiallyPaidAction(invoice.id, fd));
  }

  function handleReversePayment(paymentId: string) {
    const reason = window.prompt("Reason for reversing this payment:");
    if (reason === null) return;
    runAction(() => reversePaymentAction(invoice.id, paymentId, reason));
  }

  return (
    <div>
      <Link href="/admin/crm/invoices" className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
        ← Back to Invoices
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{invoice.invoice_number}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${INVOICE_STATUS_STYLES[effStatus]}`}>{INVOICE_STATUS_LABELS[effStatus]}</span>
            {invoice.is_free_invoice && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-800">Free Invoice</span>
            )}
            {isTestInvoice && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10.5px] font-semibold text-amber-800">Test Data</span>
            )}
            {client && (
              <Link href={`/admin/crm/clients/${client.id}`} className="text-sm text-sky-600 hover:underline">
                {client.company_name}
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/crm/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Download PDF
          </a>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              runAction(
                () => duplicateAction(invoice.id),
                (result) => {
                  if (result.invoiceId) router.push(`/admin/crm/invoices/${result.invoiceId}`);
                }
              )
            }
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Duplicate
          </button>
          {canEdit && (
            <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {editing ? "Cancel Edit" : "Edit"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {/* Workflow actions */}
      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <button type="button" disabled={isPending} onClick={() => openPreview("invoice_sent")} className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
            {invoice.first_sent_at ? "Resend Invoice" : "Send Invoice"}
          </button>
          {invoice.first_sent_at && (
            <button type="button" disabled={isPending} onClick={() => openPreview("invoice_reminder")} className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50">
              Send Payment Reminder
            </button>
          )}
          {invoice.status !== "Draft" && Number(invoice.balance) > 0 && (
            <>
              <button type="button" disabled={isPending} onClick={() => runAction(() => markPaidAction(invoice.id))} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                Mark as Paid
              </button>
              <button type="button" disabled={isPending} onClick={handleMarkPartiallyPaid} className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-200 disabled:opacity-50">
                Mark Partially Paid
              </button>
            </>
          )}
          {hasPayment && (
            <button type="button" disabled={isPending} onClick={() => openPreview("invoice_receipt")} className="rounded-full bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-200 disabled:opacity-50">
              Send Payment Receipt
            </button>
          )}
          {invoice.status !== "Paid" && (
            <button type="button" disabled={isPending} onClick={handleCancel} className="rounded-full bg-rose-100 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-200 disabled:opacity-50">
              Cancel Invoice
            </button>
          )}
          <button type="button" disabled={isPending} onClick={handleArchive} className="rounded-full bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50">
            Archive
          </button>
        </div>
      )}
      {!canEdit && invoice.status !== "Archived" && (
        <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <button type="button" disabled={isPending} onClick={handleArchive} className="rounded-full bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50">
            Archive
          </button>
        </div>
      )}
      {canDelete && (
        <div className="mt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={handleDelete}
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            Delete Invoice
          </button>
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDeleteModal
          title="Permanently Delete Invoice"
          recordLabel="Invoice #"
          recordNumber={invoice.invoice_number}
          clientName={client?.company_name ?? "Unknown client"}
          amountLabel={formatCurrency(invoice.total, invoice.currency)}
          warning={isTestInvoice ? "This invoice is identified as test data - deleting it also permanently removes its test payments, line items, and activity records." : undefined}
          isPending={isPending}
          onConfirm={confirmDeleteInvoice}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {/* Editor / view */}
      {editing ? (
        <form action={handleUpdate} className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Billing Contact Name</span>
              <input type="text" name="billing_contact_name" defaultValue={invoice.billing_contact_name ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Billing Address</span>
              <input type="text" name="billing_address" defaultValue={invoice.billing_address ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Currency</span>
              <select name="currency" defaultValue={invoice.currency} className={inputClass}>
                {CLIENT_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CLIENT_CURRENCY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Issue Date</span>
              <input type="date" name="issue_date" defaultValue={invoice.issue_date} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Due Date</span>
              <input type="date" name="due_date" defaultValue={invoice.due_date ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Tax Rate (%)</span>
              <input type="number" step="0.01" min="0" name="tax_rate" defaultValue={invoice.tax_rate} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Discount Amount</span>
              <input type="number" step="0.01" min="0" name="discount_amount" defaultValue={invoice.discount_amount} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Service Period Start</span>
              <input type="date" name="service_period_start" defaultValue={invoice.service_period_start ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Service Period End</span>
              <input type="date" name="service_period_end" defaultValue={invoice.service_period_end ?? ""} className={inputClass} />
            </label>
          </div>

          <div className="mt-4">
            <span className="text-[12px] font-medium text-slate-600">Line Items</span>
            <LineItemsEditor items={draftItems} onChange={setDraftItems} currency={invoice.currency} />
          </div>

          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" name="is_free_invoice" defaultChecked={invoice.is_free_invoice} className="h-4 w-4" />
            <span className="text-[12.5px] font-medium text-slate-600">This is a free invoice (no payment required)</span>
          </label>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Payment Instructions</span>
              <textarea name="payment_instructions" rows={2} defaultValue={invoice.payment_instructions ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Client-Facing Notes</span>
              <textarea name="client_facing_notes" rows={2} defaultValue={invoice.client_facing_notes ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[12px] font-medium text-slate-600">Internal Admin Notes</span>
              <textarea name="admin_notes" rows={2} defaultValue={invoice.admin_notes ?? ""} className={inputClass} />
            </label>
          </div>

          <div className="mt-4">
            <button type="submit" disabled={isPending} className="rounded-full bg-slate-700 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Issue Date</div>
              <div className="mt-1 text-sm">{formatDate(invoice.issue_date)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Due Date</div>
              <div className="mt-1 text-sm">{formatDate(invoice.due_date)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Billing Contact</div>
              <div className="mt-1 text-sm">{invoice.billing_contact_name || "-"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Billing Address</div>
              <div className="mt-1 text-sm">{invoice.billing_address || "-"}</div>
            </div>
          </div>

          <table className="mt-5 min-w-full divide-y divide-[var(--color-border)] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Rate</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {lineItems.map((li) => (
                <tr key={li.id}>
                  <td className="py-2">{li.description}</td>
                  <td className="py-2 text-right">{li.quantity}</td>
                  <td className="py-2 text-right">{formatCurrency(li.unit_price, invoice.currency)}</td>
                  <td className="py-2 text-right">{formatCurrency(li.line_total, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Subtotal</span>
                <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
              {Number(invoice.discount_amount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Discount</span>
                  <span>-{formatCurrency(invoice.discount_amount, invoice.currency)}</span>
                </div>
              )}
              {Number(invoice.tax_rate) > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Tax ({invoice.tax_rate}%)</span>
                  <span>{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-[var(--color-border)] pt-1 font-bold">
                <span>Total</span>
                <span>{formatCurrency(invoice.total, invoice.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Amount Paid</span>
                <span>{formatCurrency(invoice.amount_paid, invoice.currency)}</span>
              </div>
              <div className="flex justify-between font-bold text-amber-700">
                <span>Balance Due</span>
                <span>{formatCurrency(invoice.balance, invoice.currency)}</span>
              </div>
            </div>
          </div>

          {invoice.payment_instructions && (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Payment Instructions</div>
              <div className="mt-1 whitespace-pre-wrap text-sm">{invoice.payment_instructions}</div>
            </div>
          )}
          {invoice.client_facing_notes && (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Client-Facing Notes</div>
              <div className="mt-1 whitespace-pre-wrap text-sm">{invoice.client_facing_notes}</div>
            </div>
          )}
          {invoice.admin_notes && (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Internal Admin Notes</div>
              <div className="mt-1 whitespace-pre-wrap text-sm">{invoice.admin_notes}</div>
            </div>
          )}
          {invoice.cancel_reason && (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Cancelled: {invoice.cancel_reason}</p>
          )}
        </div>
      )}

      {/* Payments */}
      <section className="mt-8">
        <h2 className="text-base font-bold text-slate-900">Payments</h2>
        {invoice.status !== "Draft" && invoice.status !== "Cancelled" && invoice.status !== "Archived" && (
          <form action={(fd) => runAction(() => recordPaymentAction(invoice.id, fd))} className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-5">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Amount *</span>
              <input type="number" step="0.01" min="0.01" name="amount" required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Date</span>
              <input type="date" name="payment_date" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Method</span>
              <select name="payment_method" className={inputClass} defaultValue="">
                <option value="">-</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Reference #</span>
              <input type="text" name="reference_number" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">Notes</span>
              <input type="text" name="notes" className={inputClass} />
            </label>
            <div className="sm:col-span-5">
              <button type="submit" disabled={isPending} className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                Record Payment
              </button>
            </div>
          </form>
        )}
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
          <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Recorded By</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                    No payments recorded yet.
                  </td>
                </tr>
              )}
              {payments.map((p) => (
                <tr key={p.id} className={p.reversed_at ? "opacity-50" : ""}>
                  <td className="px-4 py-3">{formatDate(p.payment_date)}</td>
                  <td className="px-4 py-3 font-medium">
                    {formatCurrency(p.amount, p.currency)}
                    {p.reversed_at && <span className="ml-1 text-xs text-rose-600">(reversed)</span>}
                  </td>
                  <td className="px-4 py-3">{p.payment_method ? PAYMENT_METHOD_LABELS[p.payment_method] : "-"}</td>
                  <td className="px-4 py-3">{p.reference_number || "-"}</td>
                  <td className="px-4 py-3">{p.recorded_by_name}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {!p.reversed_at && (
                        <button type="button" disabled={isPending} onClick={() => handleReversePayment(p.id)} className="text-[12px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50">
                          Reverse
                        </button>
                      )}
                      {canPermanentlyDeleteTestPayment(p) && (
                        <button type="button" disabled={isPending} onClick={() => handleDeleteTestPayment(p.id)} className="text-[12px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50">
                          Delete test payment
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {confirmingDeletePayment && (
        <ConfirmDeleteModal
          title="Permanently Delete Payment"
          recordLabel="Payment"
          recordNumber={payments.find((p) => p.id === confirmingDeletePayment)?.reference_number || "Test payment"}
          clientName={client?.company_name ?? "Unknown client"}
          amountLabel={formatCurrency(payments.find((p) => p.id === confirmingDeletePayment)?.amount ?? 0, invoice.currency)}
          warning="This payment is identified as test data."
          isPending={isPending}
          onConfirm={confirmDeleteTestPayment}
          onCancel={() => setConfirmingDeletePayment(null)}
        />
      )}

      {/* Audit trail */}
      <section className="mt-8 mb-8">
        <h2 className="text-base font-bold text-slate-900">Activity History</h2>
        <div className="mt-3 space-y-2">
          {audit.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No activity recorded yet.</p>}
          {audit.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--crm-surface)] px-4 py-2.5 text-sm">
              <span className="text-[var(--color-text-muted)]">{new Date(entry.occurred_at).toLocaleString()}</span> — {entry.action.replace(/_/g, " ")} by {entry.performed_by_name}
              {entry.details && <span className="text-[var(--color-text-muted)]"> ({entry.details})</span>}
            </div>
          ))}
        </div>
      </section>

      {/* Preview-and-edit-before-send modal */}
      {previewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              {previewModal.emailType === "invoice_receipt"
                ? "Send Payment Receipt"
                : previewModal.emailType === "invoice_reminder"
                  ? "Send Payment Reminder"
                  : invoice.first_sent_at
                    ? "Resend Invoice"
                    : "Send Invoice"}
            </h3>
            <p className="mt-1 text-[12.5px] text-slate-500">Review and edit the recipient, subject, and message below before sending.</p>

            <div className="mt-3 space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-slate-600">To</span>
                <input
                  type="email"
                  value={previewModal.to}
                  onChange={(e) => setPreviewModal((m) => (m ? { ...m, to: e.target.value } : m))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-slate-600">Subject</span>
                <input
                  type="text"
                  value={previewModal.subject}
                  onChange={(e) => setPreviewModal((m) => (m ? { ...m, subject: e.target.value } : m))}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-slate-600">Message</span>
                <textarea
                  value={previewModal.message}
                  onChange={(e) => setPreviewModal((m) => (m ? { ...m, message: e.target.value } : m))}
                  rows={14}
                  className={`${inputClass} font-mono text-[12.5px] leading-relaxed`}
                />
              </label>
            </div>

            {previewModal.emailType !== "invoice_receipt" && (
              <div className="mt-3">
                <div className="text-[12px] font-medium text-slate-600">Attached PDF Preview</div>
                <iframe src={`/admin/crm/invoices/${invoice.id}/pdf`} className="mt-1 h-96 w-full rounded-lg border border-slate-200" title="Invoice PDF preview" />
              </div>
            )}

            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setPreviewModal(null)} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" disabled={isPending} onClick={confirmSend} className="rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
                {isPending ? "Sending…" : "Confirm & Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
