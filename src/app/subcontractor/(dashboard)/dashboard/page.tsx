import Link from "next/link";
import { requireCrmSubcontractor } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  deriveSubcontractorOnboardingChecklist,
  onboardingProgressSummary,
  requiredTrainingComplete,
  SUBCONTRACTOR_STATUS_BADGE_CLASSES,
  SUBCONTRACTOR_STATUS_LABELS,
  type SubcontractorProfileRow,
  type SubcontractorTrainingModuleRow,
  type SubcontractorTrainingProgressRow,
} from "@/lib/crm-subcontractor-types";
import { formatSubcontractorCurrency, SUBCONTRACTOR_PAY_TYPE_LABELS } from "@/lib/subcontractor-payroll";

export default async function SubcontractorDashboardPage() {
  const crmUser = await requireCrmSubcontractor();
  const supabase = await createSupabaseServerClient();
  const subcontractorId = crmUser.subcontractor_id as string;

  const [{ data: subcontractor }, { data: assignment }, { data: agreement }, { data: modules }, { data: progress }] = await Promise.all([
    supabase.from("crm_subcontractors").select("*").eq("id", subcontractorId).maybeSingle(),
    supabase
      .from("crm_subcontractor_client_assignments")
      .select("*, crm_clients(company_name)")
      .eq("subcontractor_id", subcontractorId)
      .is("unassigned_at", null)
      .maybeSingle(),
    supabase
      .from("crm_subcontractor_agreements")
      .select("id, version, accepted_at")
      .eq("subcontractor_id", subcontractorId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("crm_subcontractor_training_modules").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("crm_subcontractor_training_progress").select("*").eq("subcontractor_id", subcontractorId),
  ]);

  if (!subcontractor) {
    return <p className="text-sm text-rose-700">Your subcontractor profile could not be found. Contact your admin.</p>;
  }

  const profile = subcontractor as SubcontractorProfileRow;
  const trainingModules = (modules ?? []) as SubcontractorTrainingModuleRow[];
  const trainingProgress = (progress ?? []) as SubcontractorTrainingProgressRow[];
  const progressByModuleId = new Map(trainingProgress.map((p) => [p.module_id, p]));
  const completedModules = trainingModules.filter((m) => progressByModuleId.get(m.id)?.status === "completed").length;

  const checklist = deriveSubcontractorOnboardingChecklist({
    subcontractor: profile,
    hasCurrentAgreement: Boolean(agreement),
    hasCurrentAssignment: Boolean(assignment),
    requiredModulesComplete: requiredTrainingComplete(trainingModules, progressByModuleId),
    crmAccessGranted: true,
  });

  const clientRow = assignment?.crm_clients as unknown as { company_name: string } | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome, {profile.full_name.split(" ")[0] || profile.full_name}</h1>
          <p className="mt-1 text-sm text-slate-500">{onboardingProgressSummary(checklist)}</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${SUBCONTRACTOR_STATUS_BADGE_CLASSES[profile.status]}`}>
          {SUBCONTRACTOR_STATUS_LABELS[profile.status]}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-sm font-bold text-slate-900">Current Assignment</h2>
          <p className="mt-2 text-sm text-slate-600">{clientRow?.company_name ?? "Not yet assigned"}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-sm font-bold text-slate-900">Onboarding</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {checklist.map((item) => (
              <li key={item.key} className="flex items-center gap-2">
                <span className={item.complete ? "text-emerald-600" : "text-slate-400"}>{item.complete ? "✓" : "○"}</span>
                <span className={item.complete ? "text-slate-700" : "text-slate-500"}>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-sm font-bold text-slate-900">Agreement</h2>
          {agreement ? (
            <p className="mt-2 text-sm text-emerald-700">
              Signed · Version {agreement.version.toFixed(1)} · {new Date(agreement.accepted_at).toLocaleDateString()}
            </p>
          ) : (
            <p className="mt-2 text-sm text-amber-700">Not yet signed</p>
          )}
          <Link href="/subcontractor/agreement" className="mt-3 inline-block text-xs font-semibold text-sky-600 hover:text-sky-700">
            {agreement ? "View Agreement" : "Review & Sign Agreement"}
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-sm font-bold text-slate-900">Training</h2>
          <p className="mt-2 text-sm text-slate-600">
            {completedModules} of {trainingModules.length} modules completed
          </p>
          <Link href="/subcontractor/training" className="mt-3 inline-block text-xs font-semibold text-sky-600 hover:text-sky-700">
            Go to Training
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-sm font-bold text-slate-900">CRM Access</h2>
          <p className="mt-2 text-sm text-emerald-700">Growth CRM access granted</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-sm font-bold text-slate-900">Payment Information</h2>
          <p className="mt-2 text-sm text-slate-600">
            {SUBCONTRACTOR_PAY_TYPE_LABELS[profile.pay_type]} · {formatSubcontractorCurrency(profile.pay_rate, profile.currency)}
          </p>
          <Link href="/subcontractor/pay" className="mt-3 inline-block text-xs font-semibold text-sky-600 hover:text-sky-700">
            View Payment History
          </Link>
        </div>
      </div>
    </div>
  );
}
