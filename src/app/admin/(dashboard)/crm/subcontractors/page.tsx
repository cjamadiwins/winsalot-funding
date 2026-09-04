import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import {
  deriveSubcontractorOnboardingChecklist,
  onboardingProgressSummary,
  requiredTrainingComplete,
  SUBCONTRACTOR_STATUS_LABELS,
  SUBCONTRACTOR_STATUS_BADGE_CLASSES,
  type SubcontractorAgreementRow,
  type SubcontractorClientAssignmentRow,
  type SubcontractorPermissionsRow,
  type SubcontractorProfileRow,
  type SubcontractorTrainingModuleRow,
  type SubcontractorTrainingProgressRow,
} from "@/lib/crm-subcontractor-types";
import { createSubcontractorAction } from "@/lib/crm-subcontractor-actions";
import SubcontractorsListClient from "./SubcontractorsListClient";

export default async function AdminSubcontractorsPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [
    { data: subcontractors },
    { data: assignments },
    { data: agreements },
    { data: trainingModules },
    { data: trainingProgress },
    { data: permissions },
    { data: clients },
    { data: logins },
  ] = await Promise.all([
    supabase.from("crm_subcontractors").select("*").order("full_name"),
    supabase.from("crm_subcontractor_client_assignments").select("*, crm_clients(company_name)").is("unassigned_at", null),
    supabase.from("crm_subcontractor_agreements").select("*").order("accepted_at", { ascending: false }),
    supabase.from("crm_subcontractor_training_modules").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("crm_subcontractor_training_progress").select("*"),
    supabase.from("crm_subcontractor_permissions").select("*"),
    supabase.from("crm_clients").select("id, company_name").order("company_name"),
    supabase.from("crm_users").select("id, subcontractor_id, active").eq("role", "subcontractor"),
  ]);

  const subcontractorRows = (subcontractors ?? []) as SubcontractorProfileRow[];
  const assignmentRows = (assignments ?? []) as (SubcontractorClientAssignmentRow & { crm_clients: { company_name: string } | null })[];
  const agreementRows = (agreements ?? []) as SubcontractorAgreementRow[];
  const moduleRows = (trainingModules ?? []) as SubcontractorTrainingModuleRow[];
  const progressRows = (trainingProgress ?? []) as SubcontractorTrainingProgressRow[];
  const permissionRows = (permissions ?? []) as SubcontractorPermissionsRow[];
  const loginRows = (logins ?? []) as { id: string; subcontractor_id: string; active: boolean }[];

  const rows = subcontractorRows.map((sub) => {
    const assignment = assignmentRows.find((a) => a.subcontractor_id === sub.id);
    const latestAgreement = agreementRows.find((a) => a.subcontractor_id === sub.id);
    const progressByModuleId = new Map(
      progressRows.filter((p) => p.subcontractor_id === sub.id).map((p) => [p.module_id, p])
    );
    const trainingComplete = requiredTrainingComplete(moduleRows, progressByModuleId);
    const permission = permissionRows.find((p) => p.subcontractor_id === sub.id);
    const login = loginRows.find((l) => l.subcontractor_id === sub.id);

    const checklist = deriveSubcontractorOnboardingChecklist({
      subcontractor: sub,
      hasCurrentAgreement: Boolean(latestAgreement),
      hasCurrentAssignment: Boolean(assignment),
      requiredModulesComplete: trainingComplete,
      crmAccessGranted: Boolean(login?.active),
    });

    return {
      subcontractor: sub,
      clientName: assignment?.crm_clients?.company_name ?? null,
      agreementSigned: Boolean(latestAgreement),
      trainingComplete,
      paymentSetupComplete: Boolean(sub.currency && sub.pay_type),
      crmAccessGranted: Boolean(login?.active),
      crmAccess: permission?.crm_access ?? "no_access",
      progressSummary: onboardingProgressSummary(checklist),
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Subcontractors</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage independent contractors separately from Growth CRM employees/agents - onboarding, the Independent
        Contractor Agreement, training, CRM access, and client assignment. Payroll payments live in{" "}
        <a href="/admin/crm/payroll" className="font-semibold text-sky-600 hover:text-sky-700">
          Payroll
        </a>
        .
      </p>

      <SubcontractorsListClient
        rows={rows}
        clients={(clients ?? []).map((c) => ({ id: c.id, company_name: c.company_name }))}
        createSubcontractorAction={createSubcontractorAction}
      />

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
        {Object.entries(SUBCONTRACTOR_STATUS_LABELS).map(([status, label]) => (
          <span key={status} className={`rounded-full px-2.5 py-1 font-semibold ${SUBCONTRACTOR_STATUS_BADGE_CLASSES[status as keyof typeof SUBCONTRACTOR_STATUS_BADGE_CLASSES]}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
