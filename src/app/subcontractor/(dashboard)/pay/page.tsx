import { requireCrmSubcontractor } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  SUBCONTRACTOR_PAYMENT_STATUS_BADGE_CLASSES,
  SUBCONTRACTOR_PAYMENT_STATUS_LABELS,
  type SubcontractorPaymentRecordRow,
  type SubcontractorProfileRow,
} from "@/lib/crm-subcontractor-types";
import { formatSubcontractorCurrency, SUBCONTRACTOR_PAY_TYPE_LABELS } from "@/lib/subcontractor-payroll";

export default async function SubcontractorPayPage() {
  const crmUser = await requireCrmSubcontractor();
  const subcontractorId = crmUser.subcontractor_id as string;
  const supabase = await createSupabaseServerClient();

  const [{ data: subcontractor }, { data: payments }] = await Promise.all([
    supabase.from("crm_subcontractors").select("*").eq("id", subcontractorId).maybeSingle(),
    supabase
      .from("crm_subcontractor_payments")
      .select("*")
      .eq("subcontractor_id", subcontractorId)
      .order("period_start", { ascending: false }),
  ]);

  const profile = subcontractor as SubcontractorProfileRow | null;
  const records = (payments ?? []) as SubcontractorPaymentRecordRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Pay</h1>
        {profile && (
          <p className="mt-1 text-sm text-slate-500">
            {SUBCONTRACTOR_PAY_TYPE_LABELS[profile.pay_type]} · {formatSubcontractorCurrency(profile.pay_rate, profile.currency)}
          </p>
        )}
      </div>

      {records.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6 text-center text-sm text-slate-500">
          No payment records yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Pay Period</th>
                <th className="px-4 py-3">Gross</th>
                <th className="px-4 py-3">Adjustments</th>
                <th className="px-4 py-3">Deductions</th>
                <th className="px-4 py-3">Net Pay</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payment Date</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((record) => (
                <tr key={record.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {record.period_start} – {record.period_end}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatSubcontractorCurrency(record.gross_pay, record.currency_snapshot)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatSubcontractorCurrency(record.adjustments, record.currency_snapshot)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatSubcontractorCurrency(record.deductions, record.currency_snapshot)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{formatSubcontractorCurrency(record.net_pay, record.currency_snapshot)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${SUBCONTRACTOR_PAYMENT_STATUS_BADGE_CLASSES[record.status]}`}>
                      {SUBCONTRACTOR_PAYMENT_STATUS_LABELS[record.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{record.payment_date ?? "—"}</td>
                  <td className="max-w-xs whitespace-pre-wrap px-4 py-3 text-slate-600">{record.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
