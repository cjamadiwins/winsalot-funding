import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchAllModulesForAdmin, fetchAgentProgressList } from "@/lib/crm-training-data";
import AdminTrainingDashboardClient from "@/components/crm-training/AdminTrainingDashboardClient";
import { reorderTrainingModulesAction, setModuleActiveAction, setModuleRequiredAction } from "./actions";

// Admin management home for the Generic Winsalot Training Portal - "Open
// and read every training module," create/edit/reorder/require/activate,
// plus links into the agent progress report and the admin's own learner
// view. This is deliberately a *separate* nav item/route tree from the
// existing /admin/crm/training ("Sales Training & Call Scripts" free-form
// reference library, migration 0018) - that feature is untouched.
export default async function AdminWinsalotTrainingPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: modules, error }, { data: agentProgress, error: progressError }] = await Promise.all([
    fetchAllModulesForAdmin(supabase),
    fetchAgentProgressList(supabase),
  ]);

  const avgCompletion =
    agentProgress.length === 0 ? 0 : Math.round(agentProgress.reduce((sum, a) => sum + a.percentComplete, 0) / agentProgress.length);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Winsalot Training</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage the generic Winsalot Corp. training curriculum - create and edit modules, control ordering, required/optional
        status, and publishing, and review every agent&apos;s progress.
      </p>

      {(error || progressError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load training data: {error ?? progressError}
        </p>
      )}

      {!error && !progressError && (
        <div className="mt-6">
          <AdminTrainingDashboardClient
            modules={modules}
            agentCount={agentProgress.length}
            avgCompletion={avgCompletion}
            reorderAction={reorderTrainingModulesAction}
            setActiveAction={setModuleActiveAction}
            setRequiredAction={setModuleRequiredAction}
          />
        </div>
      )}
    </div>
  );
}
