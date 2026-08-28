import { notFound } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { renderAgreementTemplate, type CrmAgreementTemplateRow, type CrmClientAgreementRow, type CrmPilotResultsRow } from "@/lib/crm-agreement-types";
import AgreementDetailClient from "./AgreementDetailClient";

export default async function AdminAgreementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ recordInvoice?: string }>;
}) {
  await requireCrmAdmin();
  const { id } = await params;
  const { recordInvoice } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase.from("crm_client_agreements").select("*").eq("id", id).maybeSingle();
  if (!agreement) notFound();

  const [{ data: template }, { data: events }, { data: intakeConfig }, { data: submission }, { data: invoice }, { data: pilotResults }] = await Promise.all([
    supabase.from("crm_agreement_templates").select("*").eq("id", agreement.template_id).maybeSingle(),
    supabase.from("crm_agreement_events").select("*").eq("agreement_id", id).order("occurred_at", { ascending: true }),
    supabase.from("crm_intake_configs").select("id, status").eq("agreement_id", id).maybeSingle(),
    supabase.from("crm_intake_submissions").select("id").eq("agreement_id", id).maybeSingle(),
    supabase.from("crm_agreement_invoices").select("*").eq("agreement_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("crm_pilot_results").select("*").eq("agreement_id", id).maybeSingle(),
  ]);

  if (!template) notFound();

  const sections = renderAgreementTemplate(template as Pick<CrmAgreementTemplateRow, "content">, agreement as CrmClientAgreementRow);

  return (
    <AgreementDetailClient
      agreement={agreement as CrmClientAgreementRow}
      sections={sections}
      events={events ?? []}
      intakeConfigId={intakeConfig?.id ?? null}
      hasSubmission={Boolean(submission)}
      invoice={invoice ?? null}
      openRecordInvoice={recordInvoice === "1"}
      pilotResults={(pilotResults as CrmPilotResultsRow) ?? null}
    />
  );
}
