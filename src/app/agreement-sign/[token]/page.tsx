import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveAgreementToken } from "@/lib/crm-agreement-tokens";
import { renderAgreementTemplate, AGREEMENT_SERVICE_TYPE_LABELS, type CrmAgreementTemplateRow, type CrmClientAgreementRow } from "@/lib/crm-agreement-types";
import { recordAgreementOpenedAction } from "./actions";
import AgreementSignClient from "./AgreementSignClient";

export const metadata: Metadata = {
  title: "Winsalot Corp Service Agreement",
  description: "Review and sign your Winsalot Corp service agreement.",
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function AgreementSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveAgreementToken(token);

  if (!resolved.ok) {
    return <ErrorScreen message={resolved.error} />;
  }

  const admin = getSupabaseAdmin();
  const { data: agreement } = await admin.from("crm_client_agreements").select("*").eq("id", resolved.agreementId).maybeSingle();
  if (!agreement) return <ErrorScreen message="This agreement could not be found." />;

  const { data: template } = await admin.from("crm_agreement_templates").select("*").eq("id", agreement.template_id).maybeSingle();
  if (!template) return <ErrorScreen message="This agreement's template could not be found." />;

  if (agreement.status === "signed") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">This agreement has already been signed</h1>
        <p className="mt-3 text-slate-600">
          Signed by {agreement.signer_full_name} on {formatDate(agreement.accepted_at)}. A copy was emailed at that time.
        </p>
      </div>
    );
  }

  if (agreement.status !== "sent") {
    return <ErrorScreen message="This agreement is not currently available to sign." />;
  }

  await recordAgreementOpenedAction(token);

  const sections = renderAgreementTemplate(template as Pick<CrmAgreementTemplateRow, "content">, agreement as CrmClientAgreementRow);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Winsalot Corp</h1>
        <p className="text-sm text-slate-500">Empowering Businesses, One Solution at a Time.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Client Service Agreement</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-500">Client</dt>
            <dd className="text-slate-900">{agreement.legal_business_name}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Service Type</dt>
            <dd className="text-slate-900">{AGREEMENT_SERVICE_TYPE_LABELS[agreement.service_type as keyof typeof AGREEMENT_SERVICE_TYPE_LABELS]}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Monthly Fee</dt>
            <dd className="text-slate-900">${Number(agreement.monthly_fee).toLocaleString()}</dd>
          </div>
          {agreement.setup_fee ? (
            <div>
              <dt className="font-semibold text-slate-500">Setup Fee</dt>
              <dd className="text-slate-900">${Number(agreement.setup_fee).toLocaleString()}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-6 space-y-5">
          {sections.map((section) => (
            <div key={section.key}>
              <h3 className="text-[15px] font-bold text-slate-900">{section.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{section.body}</p>
            </div>
          ))}
        </div>
      </div>

      <AgreementSignClient token={token} agreementVersion={agreement.version} />
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Unable to load this agreement</h1>
      <p className="mt-3 text-slate-600">{message}</p>
    </div>
  );
}
