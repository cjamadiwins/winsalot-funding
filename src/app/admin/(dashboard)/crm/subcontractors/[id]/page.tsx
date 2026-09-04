import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import {
  deriveSubcontractorOnboardingChecklist,
  onboardingProgressSummary,
  requiredTrainingComplete,
  type SubcontractorAgreementRow,
  type SubcontractorAuditLogRow,
  type SubcontractorClientAssignmentRow,
  type SubcontractorPermissionsRow,
  type SubcontractorProfileRow,
  type SubcontractorTrainingModuleRow,
  type SubcontractorTrainingProgressRow,
} from "@/lib/crm-subcontractor-types";
import {
  changeSubcontractorClientAssignmentAction,
  grantSubcontractorCrmAccessAction,
  revokeSubcontractorCrmAccessAction,
  setSubcontractorStatusAction,
  setSubcontractorTrainingRequiredOverrideAction,
  updateSubcontractorPermissionsAction,
  updateSubcontractorProfileAction,
} from "@/lib/crm-subcontractor-actions";
import SubcontractorDetailClient from "./SubcontractorDetailClient";

export default async function AdminSubcontractorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [
    { data: subcontractor },
    { data: assignment },
    { data: agreements },
    { data: modules },
    { data: progress },
    { data: permissions },
    { data: clients },
    { data: login },
    { data: auditLog },
  ] = await Promise.all([
    supabase.from("crm_subcontractors").select("*").eq("id", id).maybeSingle(),
    supabase.from("crm_subcontractor_client_assignments").select("*, crm_clients(company_name)").eq("subcontractor_id", id).is("unassigned_at", null).maybeSingle(),
    supabase.from("crm_subcontractor_agreements").select("*").eq("subcontractor_id", id).order("accepted_at", { ascending: false }),
    supabase.from("crm_subcontractor_training_modules").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("crm_subcontractor_training_progress").select("*").eq("subcontractor_id", id),
    supabase.from("crm_subcontractor_permissions").select("*").eq("subcontractor_id", id).maybeSingle(),
    supabase.from("crm_clients").select("id, company_name").order("company_name"),
    supabase.from("crm_users").select("id, active").eq("subcontractor_id", id).maybeSingle(),
    supabase.from("crm_subcontractor_audit_log").select("*").eq("subcontractor_id", id).order("created_at", { ascending: false }),
  ]);

  if (!subcontractor) notFound();

  const subcontractorRow = subcontractor as SubcontractorProfileRow;
  const moduleRows = (modules ?? []) as SubcontractorTrainingModuleRow[];
  const progressRows = (progress ?? []) as SubcontractorTrainingProgressRow[];
  const progressByModuleId = new Map(progressRows.map((p) => [p.module_id, p]));
  const trainingComplete = requiredTrainingComplete(moduleRows, progressByModuleId);
  const agreementRows = (agreements ?? []) as SubcontractorAgreementRow[];
  const latestAgreement = agreementRows[0] ?? null;
  const assignmentRow = assignment as (SubcontractorClientAssignmentRow & { crm_clients: { company_name: string } | null }) | null;
  const loginRow = login as { id: string; active: boolean } | null;

  const checklist = deriveSubcontractorOnboardingChecklist({
    subcontractor: subcontractorRow,
    hasCurrentAgreement: Boolean(latestAgreement),
    hasCurrentAssignment: Boolean(assignmentRow),
    requiredModulesComplete: trainingComplete,
    crmAccessGranted: Boolean(loginRow?.active),
  });

  return (
    <SubcontractorDetailClient
      subcontractor={subcontractorRow}
      assignment={assignmentRow}
      agreements={agreementRows}
      trainingModules={moduleRows}
      trainingProgress={progressRows}
      permissions={permissions as SubcontractorPermissionsRow | null}
      clients={(clients ?? []).map((c) => ({ id: c.id, company_name: c.company_name }))}
      crmAccessGranted={Boolean(loginRow?.active)}
      auditLog={(auditLog ?? []) as SubcontractorAuditLogRow[]}
      checklist={checklist}
      progressSummary={onboardingProgressSummary(checklist)}
      updateProfileAction={updateSubcontractorProfileAction}
      setStatusAction={setSubcontractorStatusAction}
      changeAssignmentAction={changeSubcontractorClientAssignmentAction}
      updatePermissionsAction={updateSubcontractorPermissionsAction}
      grantCrmAccessAction={grantSubcontractorCrmAccessAction}
      revokeCrmAccessAction={revokeSubcontractorCrmAccessAction}
      setTrainingRequiredOverrideAction={setSubcontractorTrainingRequiredOverrideAction}
    />
  );
}
