import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import { fetchActiveAssignedModules, fetchOwnProgressByModuleId } from "@/lib/crm-training-data";
import AgentTrainingDashboardClient from "@/components/crm-training/AgentTrainingDashboardClient";

// The generic Winsalot Corp. curriculum - "View all active modules
// assigned to them" / "See their overall progress percentage." RLS
// (crm_training_modules_agent_select_assigned, crm_training_progress_
// self_select) already scopes both queries to exactly this agent, so
// there is nothing further to filter here.
export default async function AgentWinsalotTrainingPage() {
  const user = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const [{ data: modules, error: modulesError }, { data: progressByModuleId, error: progressError }] = await Promise.all([
    fetchActiveAssignedModules(supabase),
    fetchOwnProgressByModuleId(supabase, user.id),
  ]);

  const error = modulesError ?? progressError;

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-[var(--color-ink-strong)]">Winsalot Training</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        The generic Winsalot Corp. training curriculum for contacting businesses on Winsalot&apos;s behalf.
      </p>

      {error && <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Failed to load training: {error}</p>}

      {!error && (
        <div className="mt-6">
          <AgentTrainingDashboardClient
            modules={modules}
            progressByModuleId={Object.fromEntries(progressByModuleId)}
            basePath="/agent/winsalot-training"
          />
        </div>
      )}
    </div>
  );
}
