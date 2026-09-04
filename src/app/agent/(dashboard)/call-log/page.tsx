import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import AgentCallLogClient from "@/components/call-log/AgentCallLogClient";
import type { CallLogClientOption, CallLogRow } from "@/lib/call-log";
import { createGrowthCallLogAction } from "./actions";

type RpcClientRow = { id: string; company_name: string };

export default async function GrowthAgentCallLogPage() {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();
  const [{ data: logData }, { data: clientData }] = await Promise.all([
    supabase
      .from("crm_call_logs")
      .select("id, created_at, agent_id, client_id, business_name, phone, outcome, notes")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.rpc("crm_agent_call_log_clients"),
  ]);

  const clients: CallLogClientOption[] = ((clientData ?? []) as RpcClientRow[]).map((client) => ({
    id: client.id,
    name: client.company_name,
  }));
  const clientNameById = new Map(clients.map((client) => [client.id, client.name]));
  const records = ((logData ?? []) as CallLogRow[]).map((record) => ({
    ...record,
    client_name: record.client_id ? clientNameById.get(record.client_id) ?? null : null,
  }));

  return (
    <AgentCallLogClient
      crmLabel="Growth CRM"
      records={records}
      clients={clients}
      defaultClientId={clients[0]?.id ?? ""}
      createAction={createGrowthCallLogAction}
    />
  );
}
