import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmUserRow } from "@/lib/crm-types";
import AgentsClient from "./AgentsClient";
import type { AgentOnboardingAdminRow, CrmAgentOnboardingRow } from "@/lib/crm-onboarding-types";

export default async function AdminCrmAgentsPage() {
  const currentAdmin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: agents, error: agentsError }, { data: onboarding }, { data: modules }, { data: progress }] = await Promise.all([
    supabase.from("crm_users").select("*").order("created_at", { ascending: false }),
    supabase.from("crm_agent_onboarding").select("*"),
    supabase.from("crm_training_modules").select("id, current_version").eq("is_active", true).eq("is_required", true),
    supabase.from("crm_training_progress").select("user_id, module_id, module_version, completed_at"),
  ]);

  const requiredModules = modules ?? [];
  const onboardingRows = ((onboarding ?? []) as CrmAgentOnboardingRow[]).map((row) => ({
    ...row,
    total_required: requiredModules.length,
    completed_required: requiredModules.filter((module) => progress?.some((item) =>
      item.user_id === row.agent_id && item.module_id === module.id &&
      item.module_version === module.current_version && item.completed_at
    )).length,
  })) as AgentOnboardingAdminRow[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">CRM Agents</h1>
      <p className="mt-1 text-sm text-slate-500">
        Add calling agents and manage who has access to the CRM.
      </p>

      {agentsError && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load agents: {agentsError.message}
        </p>
      )}

      {!agentsError && (
        <div className="mt-6">
          <AgentsClient agents={(agents ?? []) as CrmUserRow[]} onboardingRows={onboardingRows} currentUserId={currentAdmin.id} />
        </div>
      )}
    </div>
  );
}
