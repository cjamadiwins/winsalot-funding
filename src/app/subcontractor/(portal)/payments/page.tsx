import { requireGrowthSubcontractor } from "@/lib/subcontractor-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { formatSubcontractorCurrency, SUBCONTRACTOR_PAYMENT_STATUS_LABELS, type SubcontractorPaymentRow } from "@/lib/subcontractor-payroll";
import { formatDateShort } from "@/lib/payroll";

export default async function Page() {
  const subcontractor = await requireGrowthSubcontractor(); const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("crm_subcontractor_payments").select("*").eq("subcontractor_id", subcontractor.id).order("period_start", { ascending: false });
  const payments = (data ?? []) as SubcontractorPaymentRow[];
  return <div><h1 className="text-2xl font-bold">Payments</h1><p className="mt-1 text-sm text-slate-500">Read-only payment history in {subcontractor.currency}.</p><div className="mt-6 space-y-3">{payments.length === 0 ? <p className="rounded-2xl border bg-white p-6 text-slate-500">No payment records yet.</p> : payments.map((p) => <div key={p.id} className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{formatDateShort(p.period_start)} – {formatDateShort(p.period_end)}</p><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{SUBCONTRACTOR_PAYMENT_STATUS_LABELS[p.status]}</span></div><div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4"><div><span className="block text-xs text-slate-400">Gross</span>{formatSubcontractorCurrency(p.gross_pay, subcontractor.currency)}</div><div><span className="block text-xs text-slate-400">Adjustments</span>{formatSubcontractorCurrency(p.adjustments, subcontractor.currency)}</div><div><span className="block text-xs text-slate-400">Deductions</span>-{formatSubcontractorCurrency(p.deductions, subcontractor.currency)}</div><div className="font-bold"><span className="block text-xs font-normal text-slate-400">Net Pay</span>{formatSubcontractorCurrency(p.net_pay, subcontractor.currency)}</div></div>{p.notes && <p className="mt-3 text-sm text-slate-500">{p.notes}</p>}</div>)}</div></div>;
}
