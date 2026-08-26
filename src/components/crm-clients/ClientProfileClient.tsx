"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ClientDetail } from "@/lib/crm-clients-data";
import {
  CLIENT_CURRENCIES,
  CLIENT_CURRENCY_LABELS,
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_STYLES,
  clientHasRelatedRecords,
  describeClientRelatedRecords,
  formatCurrency,
  PAYMENT_METHOD_LABELS,
  type ClientRelatedCounts,
} from "@/lib/crm-clients-types";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES, effectiveInvoiceStatus } from "@/lib/crm-invoices-types";

type ActionResult = { error?: string; clientId?: string };
type AgentOption = { id: string; full_name: string; email: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function ClientProfileClient({
  detail,
  relatedCounts,
  agents,
  updateAction,
  archiveAction,
  reactivateAction,
  deleteAction,
  assignAgentAction,
  unassignAgentAction,
  recordAppointmentAction,
  deleteAppointmentAction,
  recordPaymentAction,
}: {
  detail: ClientDetail;
  relatedCounts: ClientRelatedCounts;
  agents: AgentOption[];
  updateAction: (clientId: string, formData: FormData) => Promise<ActionResult>;
  archiveAction: (clientId: string) => Promise<ActionResult>;
  reactivateAction: (clientId: string) => Promise<ActionResult>;
  deleteAction: (clientId: string) => Promise<ActionResult>;
  assignAgentAction: (clientId: string, formData: FormData) => Promise<ActionResult>;
  unassignAgentAction: (clientId: string, agentId: string) => Promise<ActionResult>;
  recordAppointmentAction: (clientId: string, formData: FormData) => Promise<ActionResult>;
  deleteAppointmentAction: (clientId: string, appointmentId: string) => Promise<ActionResult>;
  recordPaymentAction: (clientId: string, formData: FormData) => Promise<ActionResult>;
}) {
  const { client, assignedAgents, appointments, invoices, payments, activities } = detail;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
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
      router.refresh();
    });
  }

  function handleArchive() {
    if (!window.confirm(`Archive ${client.company_name}? Their invoices, payments, appointments, and agent assignments are all preserved - reactivating later restores their current status (${client.status}).`)) return;
    runAction(() => archiveAction(client.id));
  }

  function handleDelete() {
    if (clientHasRelatedRecords(relatedCounts)) {
      window.alert(
        `${client.company_name} has related records (${describeClientRelatedRecords(relatedCounts)}) and cannot be permanently deleted. Archive it instead to preserve this history.`
      );
      return;
    }
    if (!window.confirm(`Permanently delete ${client.company_name}? This cannot be undone.`)) return;
    runAction(() => deleteAction(client.id), () => router.push("/admin/crm/clients"));
  }

  const unassignedAgents = agents.filter((a) => !assignedAgents.some((aa) => aa.agent_id === a.id));
  const outstandingBalance = invoices
    .filter((inv) => inv.status !== "Cancelled" && inv.status !== "Archived" && inv.status !== "Draft")
    .reduce((sum, inv) => sum + Number(inv.balance), 0);
  const totalPaid = payments.filter((p) => !p.reversed_at).reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div>
      <Link href="/admin/crm/clients" className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
        ← Back to Clients
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{client.company_name}</h1>
          <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${CLIENT_STATUS_STYLES[client.status]}`}>
            {CLIENT_STATUS_LABELS[client.status]}
          </span>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {editing ? "Cancel Edit" : "Edit Info"}
          </button>
          {client.status === "Archived" ? (
            <button type="button" disabled={isPending} onClick={() => runAction(() => reactivateAction(client.id))} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              Reactivate
            </button>
          ) : (
            <button type="button" disabled={isPending} onClick={handleArchive} className="rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              Archive
            </button>
          )}
          <button type="button" disabled={isPending} onClick={handleDelete} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
            Delete
          </button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {editing ? (
        <form
          action={(fd) => runAction(() => updateAction(client.id, fd), () => setEditing(false))}
          className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Company Name *</span>
            <input type="text" name="company_name" required defaultValue={client.company_name} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Primary Contact</span>
            <input type="text" name="primary_contact_name" defaultValue={client.primary_contact_name ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Email</span>
            <input type="email" name="email" defaultValue={client.email ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Phone</span>
            <input type="text" name="phone" defaultValue={client.phone ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Website</span>
            <input type="text" name="website" defaultValue={client.website ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Service / Package</span>
            <input type="text" name="service" defaultValue={client.service ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Monthly Price</span>
            <input type="number" step="0.01" min="0" name="monthly_price" defaultValue={client.monthly_price ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Currency</span>
            <select name="currency" defaultValue={client.currency} className={inputClass}>
              {CLIENT_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CLIENT_CURRENCY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Status</span>
            <select name="status" defaultValue={client.status} className={inputClass}>
              {CLIENT_STATUSES.filter((s) => s !== "Archived" || client.status === "Archived").map((s) => (
                <option key={s} value={s}>
                  {CLIENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Start Date</span>
            <input type="date" name="start_date" defaultValue={client.start_date ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Renewal / End Date</span>
            <input type="date" name="renewal_date" defaultValue={client.renewal_date ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-3">
            <span className="text-[12px] font-medium text-slate-600">Billing Address</span>
            <input type="text" name="billing_address" defaultValue={client.billing_address ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-3">
            <span className="text-[12px] font-medium text-slate-600">Internal Admin Notes</span>
            <textarea name="internal_notes" rows={3} defaultValue={client.internal_notes ?? ""} className={inputClass} />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={isPending} className="rounded-full bg-slate-700 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-5 sm:grid-cols-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Primary Contact</div>
            <div className="mt-1 text-sm text-[var(--color-ink-strong)]">{client.primary_contact_name || "-"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Email</div>
            <div className="mt-1 text-sm text-[var(--color-ink-strong)]">{client.email || "-"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Phone</div>
            <div className="mt-1 text-sm text-[var(--color-ink-strong)]">{client.phone || "-"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Website</div>
            <div className="mt-1 text-sm text-[var(--color-ink-strong)]">{client.website || "-"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Service / Package</div>
            <div className="mt-1 text-sm text-[var(--color-ink-strong)]">{client.service || "-"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Monthly Price</div>
            <div className="mt-1 text-sm text-[var(--color-ink-strong)]">
              {client.monthly_price !== null ? formatCurrency(client.monthly_price, client.currency) : "-"}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Start Date</div>
            <div className="mt-1 text-sm text-[var(--color-ink-strong)]">{formatDate(client.start_date)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Renewal / End Date</div>
            <div className="mt-1 text-sm text-[var(--color-ink-strong)]">{formatDate(client.renewal_date)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Billing Address</div>
            <div className="mt-1 text-sm text-[var(--color-ink-strong)]">{client.billing_address || "-"}</div>
          </div>
          {client.internal_notes && (
            <div className="sm:col-span-3">
              <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Internal Admin Notes</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-ink-strong)]">{client.internal_notes}</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Outstanding Balance</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(outstandingBalance, client.currency)}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Total Paid to Date</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(totalPaid, client.currency)}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
          <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Appointments Delivered</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{appointments.length}</div>
        </div>
      </div>

      {/* Assigned Agents */}
      <section className="mt-8">
        <h2 className="text-base font-bold text-slate-900">Assigned Agents</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {assignedAgents.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No agents assigned yet.</p>}
          {assignedAgents.map((aa) => (
            <span key={aa.agent_id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
              {aa.crm_users?.full_name || aa.crm_users?.email}
              <button type="button" disabled={isPending} onClick={() => runAction(() => unassignAgentAction(client.id, aa.agent_id))} className="text-rose-500 hover:text-rose-700">
                ×
              </button>
            </span>
          ))}
        </div>
        {unassignedAgents.length > 0 && (
          <form action={(fd) => runAction(() => assignAgentAction(client.id, fd))} className="mt-3 flex gap-3">
            <select name="agent_id" className={inputClass} required>
              <option value="">Select an agent to assign…</option>
              {unassignedAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name || a.email}
                </option>
              ))}
            </select>
            <button type="submit" disabled={isPending} className="shrink-0 rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
              Assign
            </button>
          </form>
        )}
      </section>

      {/* Invoices */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Invoices</h2>
          <Link href={`/admin/crm/invoices?create=${client.id}`} className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
            + New Invoice
          </Link>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
          <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                    No invoices yet.
                  </td>
                </tr>
              )}
              {invoices.map((inv) => {
                const effStatus = effectiveInvoiceStatus(inv);
                return (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">
                      <Link href={`/admin/crm/invoices/${inv.id}`} className="hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{formatDate(inv.issue_date)}</td>
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
      </section>

      {/* Payments */}
      <section className="mt-8">
        <h2 className="text-base font-bold text-slate-900">Payment History</h2>
        <form action={(fd) => runAction(() => recordPaymentAction(client.id, fd))} className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-5">
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
            <input type="text" name="notes" className={inputClass} placeholder="No invoice - direct payment" />
          </label>
          <div className="sm:col-span-5">
            <button type="submit" disabled={isPending} className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              Record Payment
            </button>
          </div>
        </form>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
          <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Recorded By</th>
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
                  <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">
                    {formatCurrency(p.amount, p.currency)}
                    {p.reversed_at && <span className="ml-1 text-xs text-rose-600">(reversed)</span>}
                  </td>
                  <td className="px-4 py-3">{p.payment_method ? PAYMENT_METHOD_LABELS[p.payment_method] : "-"}</td>
                  <td className="px-4 py-3">{p.reference_number || "-"}</td>
                  <td className="px-4 py-3">{p.invoice_id ? "Linked" : "No invoice"}</td>
                  <td className="px-4 py-3">{p.recorded_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Appointments Delivered */}
      <section className="mt-8">
        <h2 className="text-base font-bold text-slate-900">Appointments Delivered</h2>
        <form action={(fd) => runAction(() => recordAppointmentAction(client.id, fd))} className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Date *</span>
            <input type="date" name="appointment_date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">Agent</span>
            <select name="agent_id" className={inputClass} defaultValue="">
              <option value="">-</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name || a.email}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[12px] font-medium text-slate-600">Notes</span>
            <input type="text" name="notes" className={inputClass} />
          </label>
          <div className="sm:col-span-4">
            <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
              Log Appointment
            </button>
          </div>
        </form>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
          <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {appointments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                    No appointments logged yet.
                  </td>
                </tr>
              )}
              {appointments.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">{formatDate(a.appointment_date)}</td>
                  <td className="px-4 py-3">{a.crm_users?.full_name || a.crm_users?.email || "-"}</td>
                  <td className="px-4 py-3">{a.notes || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        if (window.confirm("Remove this appointment record?")) runAction(() => deleteAppointmentAction(client.id, a.id));
                      }}
                      className="text-[12px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Activity History */}
      <section className="mt-8 mb-8">
        <h2 className="text-base font-bold text-slate-900">Activity History</h2>
        <div className="mt-3 space-y-2">
          {activities.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No activity recorded yet.</p>}
          {activities.map((act) => (
            <div key={act.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--crm-surface)] px-4 py-2.5 text-sm">
              <span className="text-[var(--color-text-muted)]">{new Date(act.occurred_at).toLocaleString()}</span> — {act.notes}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
