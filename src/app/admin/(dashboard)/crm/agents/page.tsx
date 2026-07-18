import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmUserRow } from "@/lib/crm-types";
import AgentsClient from "./AgentsClient";

export default async function AdminCrmAgentsPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: agents, error: agentsError }, { data: leadCounts, error: countsError }] =
    await Promise.all([
      supabase.from("crm_users").select("*").order("created_at", { ascending: false }),
      supabase.from("crm_leads").select("assigned_agent_id"),
    ]);

  const counts: Record<string, number> = {};
  for (const row of leadCounts ?? []) {
    if (!row.assigned_agent_id) continue;
    counts[row.assigned_agent_id] = (counts[row.assigned_agent_id] ?? 0) + 1;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">CRM Agents</h1>
      <p className="mt-1 text-sm text-slate-500">
        Add calling agents and manage who has access to the CRM.
      </p>

      {(agentsError || countsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load agents: {(agentsError ?? countsError)?.message}
        </p>
      )}

      {!agentsError && !countsError && (
        <div className="mt-6">
          <AgentsClient agents={(agents ?? []) as CrmUserRow[]} leadCounts={counts} />
        </div>
      )}
    </div>
  );
}
