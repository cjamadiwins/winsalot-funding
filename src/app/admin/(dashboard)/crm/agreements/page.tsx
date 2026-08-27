import Link from "next/link";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { CrmClientAgreementRow, CrmAgreementTemplateRow } from "@/lib/crm-agreement-types";
import NewAgreementForm from "./NewAgreementForm";
import ApproveTemplateButton from "./ApproveTemplateButton";

export default async function AdminCrmAgreementsPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: agreements }, { data: opportunities }, { data: clients }, { data: templates }] = await Promise.all([
    supabase.from("crm_client_agreements").select("*").order("created_at", { ascending: false }),
    supabase
      .from("crm_opportunities")
      .select("id, business_name, contact_name, email, stage")
      .order("stage", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("crm_clients").select("id, company_name, primary_contact_name, email").order("company_name", { ascending: true }),
    supabase.from("crm_agreement_templates").select("*").order("version", { ascending: false }),
  ]);

  const agreementRows = (agreements ?? []) as CrmClientAgreementRow[];
  const agreementedOpportunityIds = new Set(agreementRows.map((a) => a.opportunity_id).filter(Boolean));
  const availableOpportunities = (opportunities ?? []).filter((o) => !agreementedOpportunityIds.has(o.id));
  const latestTemplate = (templates ?? [])[0] as CrmAgreementTemplateRow | undefined;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Client Agreements</h1>
      <p className="mt-1 text-sm text-slate-500">Create and manage client service agreements. Not visible to agents.</p>

      {latestTemplate && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            latestTemplate.legal_status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"
          }`}
        >
          Agreement template v{latestTemplate.version}:{" "}
          {latestTemplate.legal_status === "approved" ? "Approved" : "Draft — Pending Legal Review"}
          {latestTemplate.legal_status !== "approved" && <ApproveTemplateButton templateId={latestTemplate.id} />}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <h2 className="text-base font-bold text-slate-900">Start Onboarding</h2>
        <NewAgreementForm
          opportunities={availableOpportunities.map((o) => ({ id: o.id, label: `${o.business_name} (${o.email ?? "no email"}) — ${o.stage}` }))}
          clients={(clients ?? []).map((c) => ({ id: c.id, label: `${c.company_name} (${c.email ?? "no email"})` }))}
        />
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Business Name</th>
              <th className="px-4 py-3">Service Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {agreementRows.map((agreement) => (
              <tr key={agreement.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{agreement.legal_business_name}</td>
                <td className="px-4 py-3 text-slate-600">{agreement.service_type}</td>
                <td className="px-4 py-3 text-slate-600 capitalize">{agreement.status}</td>
                <td className="px-4 py-3 text-slate-600">{agreement.version}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/crm/agreements/${agreement.id}`} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {agreementRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No agreements yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
