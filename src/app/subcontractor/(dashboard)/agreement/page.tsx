import { requireCrmSubcontractor } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { renderSubcontractorAgreementTemplate, formatCompensationArrangement } from "@/lib/crm-subcontractor-agreement";
import type {
  SubcontractorAgreementRow,
  SubcontractorAgreementTemplateRow,
  SubcontractorProfileRow,
} from "@/lib/crm-subcontractor-types";
import { signSubcontractorAgreementAction } from "@/lib/crm-subcontractor-actions";
import AgreementSignClient from "./AgreementSignClient";

export default async function SubcontractorAgreementPage() {
  const crmUser = await requireCrmSubcontractor();
  const subcontractorId = crmUser.subcontractor_id as string;
  const supabase = await createSupabaseServerClient();

  const [{ data: subcontractor }, { data: latestAgreement }, { data: assignment }] = await Promise.all([
    supabase.from("crm_subcontractors").select("*").eq("id", subcontractorId).maybeSingle(),
    supabase
      .from("crm_subcontractor_agreements")
      .select("*")
      .eq("subcontractor_id", subcontractorId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("crm_subcontractor_client_assignments")
      .select("crm_clients(company_name)")
      .eq("subcontractor_id", subcontractorId)
      .is("unassigned_at", null)
      .maybeSingle(),
  ]);

  if (!subcontractor) {
    return <p className="text-sm text-rose-700">Your subcontractor profile could not be found. Contact your admin.</p>;
  }

  const profile = subcontractor as SubcontractorProfileRow;
  const agreement = latestAgreement as SubcontractorAgreementRow | null;
  const clientRow = assignment?.crm_clients as unknown as { company_name: string } | null;

  if (agreement) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Independent Contractor Agreement</h1>
            <p className="mt-1 text-sm text-emerald-700">
              Signed · Version {agreement.version.toFixed(1)} · {new Date(agreement.accepted_at).toLocaleDateString()}
            </p>
          </div>
          <a
            href="/subcontractor/agreement/pdf"
            className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Download PDF
          </a>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">Contractor</dt>
              <dd className="font-medium text-slate-800">{agreement.contractor_name_typed}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Business Name</dt>
              <dd className="font-medium text-slate-800">{agreement.business_name_snapshot ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Country</dt>
              <dd className="font-medium text-slate-800">{agreement.country_snapshot ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Email</dt>
              <dd className="font-medium text-slate-800">{agreement.email_snapshot ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Start Date</dt>
              <dd className="font-medium text-slate-800">{agreement.start_date_snapshot ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Assigned Client</dt>
              <dd className="font-medium text-slate-800">{agreement.assigned_client_snapshot ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4">
          {agreement.rendered_content.map((section) => (
            <div key={section.key} className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
              <h2 className="text-sm font-bold text-slate-900">{section.title}</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{section.body}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { data: template } = await supabase
    .from("crm_subcontractor_agreement_templates")
    .select("*")
    .eq("is_current", true)
    .maybeSingle();

  if (!template) {
    return <p className="text-sm text-rose-700">No agreement template is currently available. Contact your admin.</p>;
  }

  const renderedContent = renderSubcontractorAgreementTemplate(template as SubcontractorAgreementTemplateRow, {
    currency: profile.currency,
    payType: profile.pay_type,
    payRate: profile.pay_rate,
    startDate: profile.start_date,
  });

  return (
    <AgreementSignClient
      profile={profile}
      assignedClientName={clientRow?.company_name ?? null}
      compensationArrangement={formatCompensationArrangement({
        payType: profile.pay_type,
        payRate: profile.pay_rate,
        currency: profile.currency,
      })}
      version={(template as SubcontractorAgreementTemplateRow).version}
      sections={renderedContent}
      signAction={signSubcontractorAgreementAction}
    />
  );
}
