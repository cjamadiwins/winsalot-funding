"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_STYLES,
  formatCad,
  formatInvoiceDate,
  type InvoiceStatus,
  type ProviderInvoiceWithRelations,
} from "@/lib/provider-invoice-types";

const inputClass = "rounded-[10px] border border-slate-300 bg-white px-3.5 py-2.5 text-[13.5px] text-slate-900";

type PaymentStatusFilter = "all" | "unpaid" | "partially_paid" | "fully_paid";

function paymentStatusOf(invoice: ProviderInvoiceWithRelations): PaymentStatusFilter {
  if (invoice.amount_paid <= 0) return "unpaid";
  if (invoice.amount_paid >= invoice.total) return "fully_paid";
  return "partially_paid";
}

export default function InvoicesDashboardClient({
  invoices,
  providers,
}: {
  invoices: (ProviderInvoiceWithRelations & { providerName: string })[];
  providers: { id: string; company_name: string }[];
}) {
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatusFilter>("all");
  const [invoiceDateFrom, setInvoiceDateFrom] = useState("");
  const [invoiceDateTo, setInvoiceDateTo] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (providerFilter !== "all" && invoice.cleaning_provider_id !== providerFilter) return false;
      if (statusFilter !== "all" && invoice.status !== statusFilter) return false;
      if (paymentStatusFilter !== "all" && paymentStatusOf(invoice) !== paymentStatusFilter) return false;
      if (invoiceDateFrom && invoice.invoice_date < invoiceDateFrom) return false;
      if (invoiceDateTo && invoice.invoice_date > invoiceDateTo) return false;
      if (dueDateFrom && invoice.due_date < dueDateFrom) return false;
      if (dueDateTo && invoice.due_date > dueDateTo) return false;
      if (query && !invoice.invoice_number.toLowerCase().includes(query) && !invoice.providerName.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [invoices, providerFilter, statusFilter, paymentStatusFilter, invoiceDateFrom, invoiceDateTo, dueDateFrom, dueDateTo, search]);

  const summary = useMemo(() => {
    const active = filtered.filter((i) => i.status !== "cancelled");
    return {
      totalInvoiced: active.reduce((s, i) => s + i.total, 0),
      totalPaid: active.reduce((s, i) => s + i.amount_paid, 0),
      outstanding: active.reduce((s, i) => s + Math.max(0, i.balance), 0),
      overdue: active.filter((i) => i.status === "overdue").reduce((s, i) => s + Math.max(0, i.balance), 0),
      paidCount: filtered.filter((i) => i.status === "paid").length,
      unpaidCount: active.filter((i) => i.balance > 0 && i.status !== "draft").length,
    };
  }, [filtered]);

  const cards: { label: string; value: string; emphasis?: string }[] = [
    { label: "Total Invoiced", value: formatCad(summary.totalInvoiced) },
    { label: "Payments Received", value: formatCad(summary.totalPaid), emphasis: "text-emerald-700" },
    { label: "Outstanding", value: formatCad(summary.outstanding), emphasis: summary.outstanding > 0 ? "text-amber-700" : undefined },
    { label: "Overdue", value: formatCad(summary.overdue), emphasis: summary.overdue > 0 ? "text-rose-700" : undefined },
    { label: "Paid Invoices", value: String(summary.paidCount) },
    { label: "Unpaid Invoices", value: String(summary.unpaidCount) },
  ];

  return (
    <div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
            <div className={`mt-1 text-[16px] font-bold ${card.emphasis ?? "text-slate-900"}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice # or provider..."
          className={`${inputClass} w-full max-w-xs`}
        />
        <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className={inputClass}>
          <option value="all">All providers</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.company_name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "all")} className={inputClass}>
          <option value="all">All statuses</option>
          {INVOICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {INVOICE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value as PaymentStatusFilter)} className={inputClass}>
          <option value="all">All payment statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="fully_paid">Fully Paid</option>
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600">
          Invoice date
          <input type="date" value={invoiceDateFrom} onChange={(e) => setInvoiceDateFrom(e.target.value)} className={inputClass} />
          <span>to</span>
          <input type="date" value={invoiceDateTo} onChange={(e) => setInvoiceDateTo(e.target.value)} className={inputClass} />
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600">
          Due date
          <input type="date" value={dueDateFrom} onChange={(e) => setDueDateFrom(e.target.value)} className={inputClass} />
          <span>to</span>
          <input type="date" value={dueDateTo} onChange={(e) => setDueDateTo(e.target.value)} className={inputClass} />
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">No invoices match your filters.</p>
        ) : (
          <table className="w-full min-w-[880px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="p-3">Invoice #</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Invoice Date</th>
                <th className="p-3">Due Date</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Paid</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3">Status</th>
                <th className="p-3">Provider Profile</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((invoice) => (
                <tr key={invoice.id} className="border-b border-slate-100">
                  <td className="p-3 font-semibold text-slate-900">{invoice.invoice_number}</td>
                  <td className="p-3 text-slate-700">{invoice.providerName}</td>
                  <td className="p-3 text-slate-600">{formatInvoiceDate(invoice.invoice_date)}</td>
                  <td className="p-3 text-slate-600">{formatInvoiceDate(invoice.due_date)}</td>
                  <td className="p-3 text-right font-medium text-slate-900">{formatCad(invoice.total)}</td>
                  <td className="p-3 text-right text-slate-600">{formatCad(invoice.amount_paid)}</td>
                  <td className="p-3 text-right font-medium text-slate-900">{formatCad(invoice.balance)}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${INVOICE_STATUS_STYLES[invoice.status]}`}>
                      {INVOICE_STATUS_LABELS[invoice.status]}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/providers/${invoice.cleaning_provider_id}#invoices`} className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
                      Open Provider →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
