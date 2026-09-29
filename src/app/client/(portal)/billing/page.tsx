import Link from "next/link";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { loadPortalReceipts } from "@/lib/crm-portal-billing";
import { formatReceiptDate } from "@/lib/crm-receipt";
import StatusBadge from "@/components/crm-ui/StatusBadge";

export default async function ClientPortalBillingPage() {
  const { client } = await requireLeadgenPortalClient();
  const receipts = await loadPortalReceipts(client.id);

  return (
    <div>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- existing static brand asset */}
        <img src="/winsalot-logo.png" alt="Winsalot Corp" className="h-10 w-10 object-contain" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing &amp; Payments</h1>
          <p className="text-sm text-slate-500">Payments received by Winsalot Corp for {client.name}.</p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Receipt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {receipts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No payments recorded yet.
                </td>
              </tr>
            )}
            {receipts.map((r) => (
              <tr key={r.paymentId}>
                <td className="px-4 py-3">{formatReceiptDate(r.paymentDate)}</td>
                <td className="px-4 py-3">
                  {r.description}
                  <div className="text-xs text-slate-500">{r.paymentTypeLabel}</div>
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">{r.amountLabel}</td>
                <td className="px-4 py-3">
                  <StatusBadge label="Paid" className="bg-emerald-100 text-emerald-800" />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/client/billing/${r.paymentId}`} className="font-medium text-sky-700 hover:underline">
                    {r.receiptNumber}
                  </Link>
                  {" · "}
                  <a href={`/client/billing/${r.paymentId}/pdf`} className="font-medium text-sky-700 hover:underline">
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
