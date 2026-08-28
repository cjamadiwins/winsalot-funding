import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchAgentProgressList } from "@/lib/crm-training-data";
import AdminTrainingProgressListClient from "@/components/crm-training/AdminTrainingProgressListClient";

// "View each agent's overall progress." One row per active agent -
// admin-only (requireCrmAdmin + crm_training_progress_admin_all RLS).
export default async function AdminTrainingProgressPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agents, error } = await fetchAgentProgressList(supabase);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Agent Training Progress</h1>
      <p className="mt-1 text-sm text-slate-500">Required-module completion for every active agent.</p>

      {error && <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Failed to load progress: {error}</p>}

      {!error && (
        <div className="mt-6">
          <AdminTrainingProgressListClient agents={agents} />
        </div>
      )}
    </div>
  );
}
