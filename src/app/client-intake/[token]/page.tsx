import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveIntakeToken } from "@/lib/crm-agreement-tokens";
import { agreedTargetLabel, AGREED_TARGET_NOTICE, AGREEMENT_SERVICE_TYPE_LABELS, type CrmClientAgreementRow, type CrmIntakeQuestion } from "@/lib/crm-agreement-types";
import { recordIntakeOpenedAction } from "./actions";
import ClientIntakeFormClient from "./ClientIntakeFormClient";

export const metadata: Metadata = {
  title: "Winsalot Corp Client Intake Form",
  description: "Complete your Winsalot Corp client intake form.",
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function ClientIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveIntakeToken(token);
  if (!resolved.ok) return <ErrorScreen message={resolved.error} />;

  const admin = getSupabaseAdmin();
  const { data: config } = await admin.from("crm_intake_configs").select("*").eq("id", resolved.intakeConfigId).maybeSingle();
  if (!config) return <ErrorScreen message="This intake form could not be found." />;

  const { data: existingSubmission } = await admin.from("crm_intake_submissions").select("id").eq("intake_config_id", config.id).maybeSingle();
  if (existingSubmission) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">This intake form has already been submitted</h1>
        <p className="mt-3 text-slate-600">Thank you - Winsalot Corp has already received your information.</p>
      </div>
    );
  }

  const { data: agreement } = await admin.from("crm_client_agreements").select("*").eq("id", config.agreement_id).maybeSingle();
  if (!agreement) return <ErrorScreen message="The agreement linked to this intake form could not be found." />;

  await recordIntakeOpenedAction(token);

  const typedAgreement = agreement as CrmClientAgreementRow;
  const questions = (config.questions ?? []) as CrmIntakeQuestion[];

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Winsalot Corp Client Intake Form</h1>
        <p className="text-sm text-slate-500">Empowering Businesses, One Solution at a Time.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-[15px] font-bold text-slate-900">Your Agreement Details</h2>
        <p className="mt-1 text-[13px] text-slate-500">These fields are set by your signed agreement and cannot be changed here.</p>

        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <LockedField label="Legal Business Name" value={typedAgreement.legal_business_name} />
          <LockedField label="Contact Person" value={typedAgreement.contact_person} />
          <LockedField label="Business Email" value={typedAgreement.business_email} />
          <LockedField label="Service Type" value={AGREEMENT_SERVICE_TYPE_LABELS[typedAgreement.service_type]} />
          <LockedField label="Agreement Start Date" value={formatDate(typedAgreement.campaign_start_date)} />
          <LockedField label="Agreement Term" value={typedAgreement.initial_term || "-"} />
        </div>

        <div className="mt-4">
          <span className="text-[13px] font-semibold text-slate-500">{agreedTargetLabel(typedAgreement.service_type)}</span>
          <p className="mt-1 text-lg font-bold text-slate-900">{typedAgreement.monthly_target}</p>
          <p className="mt-1 text-[12.5px] text-slate-500">{AGREED_TARGET_NOTICE}</p>
        </div>
      </div>

      <ClientIntakeFormClient token={token} questions={questions} campaignStartDate={typedAgreement.campaign_start_date} />
    </div>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[12.5px] font-semibold text-slate-500">{label}</span>
      <p className="mt-0.5 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{value}</p>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Unable to load this intake form</h1>
      <p className="mt-3 text-slate-600">{message}</p>
    </div>
  );
}
