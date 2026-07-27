import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { CleaningProviderRow } from "@/lib/provider-types";
import ProvidersListAgentClient from "./ProvidersListAgentClient";

export default async function AgentProvidersPage() {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (cleaning_providers_agent_select_own) already scopes this to
  // providers assigned to the signed-in agent.
  const { data: providers, error } = await supabase.from("cleaning_providers").select("*").order("company_name");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Providers</h1>
      <p className="mt-1 text-sm text-slate-500">
        The operational Provider Profiles assigned to you - approved from Provider Acquisition or assigned by an
        administrator.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load providers: {error.message}
        </p>
      )}

      {!error && <ProvidersListAgentClient providers={(providers ?? []) as CleaningProviderRow[]} />}
    </div>
  );
}
