import Link from "next/link";
import { requireGrowthSubcontractor } from "@/lib/subcontractor-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { formatSubcontractorCurrency } from "@/lib/subcontractor-payroll";

export default async function Page() {
  const subcontractor = await requireGrowthSubcontractor();
  const supabase = await createSupabaseServerClient();
  const [{ data: agreement }, { data: payments }, { count: calls }] = await Promise.all([
    supabase.from("crm_subcontractor_agreements").select("id, status").eq("subcontractor_id", subcontractor.id).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("crm_subcontractor_payments").select("net_pay, status").eq("subcontractor_id", subcontractor.id).order("period_start", { ascending: false }),
    supabase.from("crm_subcontractor_call_logs").select("id", { count: "exact", head: true }).eq("subcontractor_id", subcontractor.id),
  ]);
  const paid = (payments ?? []).filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.net_pay), 0);
  return <div><h1 className="text-2xl font-bold text-slate-900">Welcome, {subcontractor.full_name}</h1><p className="mt-1 text-sm text-slate-500">Your subcontractor workspace for Winsalot Corp.</p>{agreement?.status !== "signed" && <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold text-amber-900">Agreement signature required</h2><p className="mt-1 text-sm text-amber-800">Review and sign your agreement before beginning assigned work.</p><Link href="/subcontractor/agreement" className="mt-3 inline-flex rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white">Review Agreement</Link></div>}<div className="mt-6 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border bg-white p-5"><p className="text-xs font-semibold uppercase text-slate-500">Agreement</p><p className="mt-2 text-xl font-bold capitalize">{agreement?.status ?? "Not issued"}</p></div><div className="rounded-2xl border bg-white p-5"><p className="text-xs font-semibold uppercase text-slate-500">Calls Logged</p><p className="mt-2 text-xl font-bold">{calls ?? 0}</p></div><div className="rounded-2xl border bg-white p-5"><p className="text-xs font-semibold uppercase text-slate-500">Paid to Date</p><p className="mt-2 text-xl font-bold">{formatSubcontractorCurrency(paid, subcontractor.currency)}</p></div></div></div>;
}
