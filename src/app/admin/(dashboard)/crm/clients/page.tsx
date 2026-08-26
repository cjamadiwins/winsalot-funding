import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchClientList } from "@/lib/crm-clients-data";
import type { CrmUserRow } from "@/lib/crm-types";
import AdminClientsClient from "@/components/crm-clients/AdminClientsClient";
import { createClientAction, archiveClientAction, reactivateClientAction, deleteClientAction } from "./actions";

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; service?: string; agent?: string }>;
}) {
  await requireCrmAdmin();
  const { search, status, service, agent } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: clients, error }, { data: agents }] = await Promise.all([
    fetchClientList(supabase, { search, status, service, assignedAgentId: agent }),
    supabase.from("crm_users").select("*").eq("role", "agent").order("full_name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
      <p className="mt-1 text-sm text-slate-500">
        Winsalot Corp&apos;s signed client accounts - manage profiles, service details, assigned agents, and status. Admin-only.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load clients: {error}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <AdminClientsClient
            clients={clients}
            agents={((agents ?? []) as CrmUserRow[]).map((a) => ({ id: a.id, full_name: a.full_name, email: a.email }))}
            createAction={createClientAction}
            archiveAction={archiveClientAction}
            reactivateAction={reactivateClientAction}
            deleteAction={deleteClientAction}
            initialFilters={{ search: search ?? "", status: status ?? "", service: service ?? "", agent: agent ?? "" }}
          />
        </div>
      )}
    </div>
  );
}
