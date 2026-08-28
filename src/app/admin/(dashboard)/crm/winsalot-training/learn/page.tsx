import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchActiveAssignedModules, fetchOwnProgressByModuleId } from "@/lib/crm-training-data";
import AgentTrainingDashboardClient from "@/components/crm-training/AgentTrainingDashboardClient";

// "Administrators should be able to... read the training as a learner"
// and "Track their own completion progress if they choose to complete
// the training" - the exact same active-module set and progress model an
// agent gets, just reached from the admin nav and reusing the identical
// dashboard component so it's genuinely "exactly as an agent sees it."
export default async function AdminTrainingLearnPage() {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: modules, error: modulesError }, { data: progressByModuleId, error: progressError }] = await Promise.all([
    fetchActiveAssignedModules(supabase),
    fetchOwnProgressByModuleId(supabase, admin.id),
  ]);

  const error = modulesError ?? progressError;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Training</h1>
      <p className="mt-1 text-sm text-slate-500">This is exactly what an agent sees on their own Training dashboard.</p>

      {error && <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Failed to load training: {error}</p>}

      {!error && (
        <div className="mt-6">
          <AgentTrainingDashboardClient
            modules={modules}
            progressByModuleId={Object.fromEntries(progressByModuleId)}
            basePath="/admin/crm/winsalot-training/learn"
          />
        </div>
      )}
    </div>
  );
}
