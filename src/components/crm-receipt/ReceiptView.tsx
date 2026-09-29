import { formatReceiptDate, type ReceiptData } from "@/lib/crm-receipt";

// Shared, client-facing receipt document used by the admin "View Receipt"
// page and the client portal. Uses the existing /winsalot-logo.png asset.
export default function ReceiptView({ receipt }: { receipt: ReceiptData }) {
  const paid = receipt.status === "PAID";
  return (
    <article className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-4 bg-[#1e3a8a] px-6 py-5 text-white">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- existing static brand asset, same as other CRM shells */}
          <img src="/winsalot-logo.png" alt="Winsalot Corp" className="h-11 w-11 rounded bg-white/10 object-contain" />
          <div>
            <div className="text-xl font-bold">Winsalot Corp</div>
            <div className="text-[11px] text-blue-100">Empowering Businesses, One Solution at a Time.</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold uppercase tracking-wide">Payment Receipt</div>
          <div className="text-[12px] text-blue-100">No. {receipt.receiptNumber}</div>
        </div>
      </header>

      <div className="px-6 py-6">
        <span className={`inline-block rounded px-3 py-1 text-xs font-bold text-white ${paid ? "bg-emerald-600" : "bg-rose-600"}`}>{receipt.status}</span>
        <dl className="mt-4 divide-y divide-slate-100 text-sm">
          <Row label="Receipt For" value={receipt.businessName} />
          {receipt.contactName && <Row label="Contact" value={receipt.contactName} />}
          <Row label="Amount Paid" value={receipt.amountLabel} strong />
          <Row label="Payment Date" value={formatReceiptDate(receipt.paymentDate)} />
          <Row label="Description" value={receipt.description} />
          <Row label="Payment Type" value={receipt.paymentTypeLabel} />
          {receipt.paymentMethodLabel && <Row label="Payment Method" value={receipt.paymentMethodLabel} />}
          {receipt.agreementNumber && <Row label="Agreement" value={receipt.agreementNumber} />}
        </dl>
        <p className="mt-6 text-[12.5px] text-slate-500">Thank you for your business. This receipt confirms payment was received by Winsalot Corp.</p>
      </div>
      <footer className="border-t border-slate-100 px-6 py-3 text-[11.5px] text-slate-500">
        Winsalot Corp · 647-300-1270 · info@winsalotcorp.com · winsalotcorp.com
      </footer>
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className={strong ? "text-base font-bold text-slate-900" : "font-medium text-slate-900"}>{value}</dd>
    </div>
  );
}
