import { notFound } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { CrmClientAgreementRow, CrmIntakeConfigRow, CrmIntakeSubmissionRow, CrmIntakeSubmissionEditRow } from "@/lib/crm-agreement-types";
import IntakeBuilderClient from "./IntakeBuilderClient";

export default async function AdminIntakeBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: config } = await supabase.from("crm_intake_configs").select("*").eq("id", id).maybeSingle();
  if (!config) notFound();

  const [{ data: agreement }, { data: submission }] = await Promise.all([
    supabase.from("crm_client_agreements").select("*").eq("id", config.agreement_id).maybeSingle(),
    supabase.from("crm_intake_submissions").select("*").eq("intake_config_id", id).maybeSingle(),
  ]);

  if (!agreement) notFound();

  const { data: edits } = submission
    ? await supabase.from("crm_intake_submission_edits").select("*").eq("submission_id", submission.id).order("created_at", { ascending: false })
    : { data: [] };

  return (
    <IntakeBuilderClient
      config={config as CrmIntakeConfigRow}
      agreement={agreement as CrmClientAgreementRow}
      submission={(submission as CrmIntakeSubmissionRow) ?? null}
      edits={(edits ?? []) as CrmIntakeSubmissionEditRow[]}
    />
  );
}
