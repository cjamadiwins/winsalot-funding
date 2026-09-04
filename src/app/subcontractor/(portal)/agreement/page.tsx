import { requireGrowthSubcontractor } from "@/lib/subcontractor-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { SubcontractorAgreementRow } from "@/lib/subcontractor-payroll";
import { acceptSubcontractorAgreementAction } from "../actions";
import AgreementAcceptanceForm from "./AgreementAcceptanceForm";

export default async function Page() {
  const subcontractor = await requireGrowthSubcontractor(); const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("crm_subcontractor_agreements").select("*").eq("subcontractor_id", subcontractor.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const agreement = data as SubcontractorAgreementRow | null;
  if (!agreement) return <div><h1 className="text-2xl font-bold">Agreement</h1><p className="mt-4 rounded-xl border bg-white p-5 text-slate-600">Your agreement has not been issued yet. Please contact Winsalot Corp.</p></div>;
  return <div><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Independent Contractor Agreement</h1><p className="mt-1 text-sm text-slate-500">Version {agreement.version} · <span className="capitalize">{agreement.status}</span></p></div><a href="/subcontractor/agreement/pdf" className="rounded-full border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-700">Download PDF</a></div><div className="mt-6 whitespace-pre-wrap rounded-2xl border bg-white p-6 text-sm leading-7 text-slate-700">{agreement.agreement_text}</div>{agreement.status === "sent" ? <AgreementAcceptanceForm agreementId={agreement.id} action={acceptSubcontractorAgreementAction} /> : <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800"><p className="font-bold">Agreement signed</p><p className="text-sm">Signed by {agreement.signer_full_name} on {agreement.accepted_at ? new Date(agreement.accepted_at).toLocaleString("en-CA") : "-"}.</p></div>}</div>;
}
