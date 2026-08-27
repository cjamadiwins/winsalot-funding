import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmUserRow } from "@/lib/crm-types";
import AgentsClient from "./AgentsClient";

export default async function AdminCrmAgentsPage() {
  const currentAdmin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: agents, error: agentsError } = await supabase
    .from("crm_users")
    .select("*")
    .order("created_at", { ascending: false });

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
          <AgentsClient agents={(agents ?? []) as CrmUserRow[]} currentUserId={currentAdmin.id} />
        </div>
      )}
    </div>
  );
}
