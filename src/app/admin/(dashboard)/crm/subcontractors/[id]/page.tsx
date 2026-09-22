import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import {
  deriveSubcontractorOnboardingChecklist,
  onboardingProgressSummary,
  requiredTrainingComplete,
  isReferralPartner,
  type SubcontractorAgreementRow,
  type SubcontractorAuditLogRow,
  type SubcontractorClientAssignmentRow,
  type SubcontractorPermissionsRow,
  type SubcontractorProfileRow,
  type SubcontractorTrainingModuleRow,
  type SubcontractorTrainingProgressRow,
  type SubcontractorReferralRevenueRow,
  type SubcontractorLendingReferralRow,
} from "@/lib/crm-subcontractor-types";
import {
  changeSubcontractorClientAssignmentAction,
  grantSubcontractorCrmAccessAction,
  revokeSubcontractorCrmAccessAction,
  setSubcontractorStatusAction,
  setSubcontractorTrainingRequiredOverrideAction,
  updateSubcontractorPermissionsAction,
  updateSubcontractorProfileAction,
  updateReferralPartnerProfileAction,
  linkReferralPartnerToOpportunityAction,
  unlinkReferralPartnerFromOpportunityAction,
  linkReferralPartnerToClientAction,
  unlinkReferralPartnerFromClientAction,
  recordReferralRevenuePeriodAction,
  recordReferralRevenueCollectedAction,
  markReferralRevenueCommissionPaidAction,
  recordLendingReferralAction,
  recordLendingReferralCommissionReceivedAction,
  markLendingReferralCommissionPaidAction,
  saveReferralPartnerOverviewEmailDraftAction,
  resetReferralPartnerOverviewEmailDraftAction,
  sendReferralPartnerOverviewEmailAction,
} from "@/lib/crm-subcontractor-actions";
import SubcontractorDetailClient from "./SubcontractorDetailClient";
import ReferralPartnerDetailClient from "./ReferralPartnerDetailClient";

export default async function AdminSubcontractorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: subcontractor } = await supabase.from("crm_subcontractors").select("*").eq("id", id).maybeSingle();
  if (!subcontractor) notFound();
  const subcontractorRow = subcontractor as SubcontractorProfileRow;

  if (isReferralPartner(subcontractorRow)) {
    const [
      { data: linkedOpportunities },
      { data: linkedClients },
      { data: unlinkedOpportunities },
      { data: unlinkedClients },
      { data: revenueRows },
      { data: lendingRows },
      { data: auditLog },
    ] = await Promise.all([
      supabase.from("crm_opportunities").select("id, business_name, stage").eq("referral_partner_id", id).order("business_name"),
      supabase.from("crm_clients").select("id, company_name, status").eq("referral_partner_id", id).order("company_name"),
      supabase.from("crm_opportunities").select("id, business_name").is("referral_partner_id", null).order("business_name").limit(200),
      supabase.from("crm_clients").select("id, company_name").is("referral_partner_id", null).order("company_name"),
      supabase.from("crm_subcontractor_referral_revenue").select("*").eq("subcontractor_id", id).order("period_start", { ascending: false }),
      supabase.from("crm_subcontractor_lending_referrals").select("*").eq("subcontractor_id", id).order("created_at", { ascending: false }),
      supabase.from("crm_subcontractor_audit_log").select("*").eq("subcontractor_id", id).order("created_at", { ascending: false }),
    ]);

    return (
      <ReferralPartnerDetailClient
        partner={subcontractorRow}
        linkedOpportunities={(linkedOpportunities ?? []) as { id: string; business_name: string; stage: string }[]}
        linkedClients={(linkedClients ?? []) as { id: string; company_name: string; status: string }[]}
        unlinkedOpportunities={(unlinkedOpportunities ?? []) as { id: string; business_name: string }[]}
        unlinkedClients={(unlinkedClients ?? []) as { id: string; company_name: string }[]}
        revenueRows={(revenueRows ?? []) as SubcontractorReferralRevenueRow[]}
        lendingRows={(lendingRows ?? []) as SubcontractorLendingReferralRow[]}
        auditLog={(auditLog ?? []) as SubcontractorAuditLogRow[]}
        updateProfileAction={updateReferralPartnerProfileAction}
        setStatusAction={setSubcontractorStatusAction}
        linkOpportunityAction={linkReferralPartnerToOpportunityAction}
        unlinkOpportunityAction={unlinkReferralPartnerFromOpportunityAction}
        linkClientAction={linkReferralPartnerToClientAction}
        unlinkClientAction={unlinkReferralPartnerFromClientAction}
        recordRevenuePeriodAction={recordReferralRevenuePeriodAction}
        recordRevenueCollectedAction={recordReferralRevenueCollectedAction}
        markRevenueCommissionPaidAction={markReferralRevenueCommissionPaidAction}
        recordLendingReferralAction={recordLendingReferralAction}
        recordLendingCommissionReceivedAction={recordLendingReferralCommissionReceivedAction}
        markLendingCommissionPaidAction={markLendingReferralCommissionPaidAction}
        saveOverviewEmailDraftAction={saveReferralPartnerOverviewEmailDraftAction}
        resetOverviewEmailDraftAction={resetReferralPartnerOverviewEmailDraftAction}
        sendOverviewEmailAction={sendReferralPartnerOverviewEmailAction}
      />
    );
  }

  const [
    { data: assignment },
    { data: agreements },
    { data: modules },
    { data: progress },
    { data: permissions },
    { data: clients },
    { data: login },
    { data: auditLog },
  ] = await Promise.all([
    supabase.from("crm_subcontractor_client_assignments").select("*, crm_clients(company_name)").eq("subcontractor_id", id).is("unassigned_at", null).maybeSingle(),
    supabase.from("crm_subcontractor_agreements").select("*").eq("subcontractor_id", id).order("accepted_at", { ascending: false }),
    supabase.from("crm_subcontractor_training_modules").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("crm_subcontractor_training_progress").select("*").eq("subcontractor_id", id),
    supabase.from("crm_subcontractor_permissions").select("*").eq("subcontractor_id", id).maybeSingle(),
    supabase.from("crm_clients").select("id, company_name").order("company_name"),
    supabase.from("crm_users").select("id, active").eq("subcontractor_id", id).maybeSingle(),
    supabase.from("crm_subcontractor_audit_log").select("*").eq("subcontractor_id", id).order("created_at", { ascending: false }),
  ]);

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
