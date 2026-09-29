import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import AgentCallLogClient from "@/components/call-log/AgentCallLogClient";
import type { CallLogRow } from "@/lib/call-log";
import { getAgentAssignedClientIds } from "@/lib/leadgen-campaign-assignment";
import { createLeadgenCallLogAction } from "./actions";

type LeadgenCallLogRecord = Omit<CallLogRow, "businessClient"> & {
  client_id: string | null;
  leadgen_clients: { name: string } | null;
};

export default async function LeadgenAgentCallLogPage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: clients }] = await Promise.all([
    supabase
      .from("leadgen_call_logs")
      .select("id, created_at, agent_id, business_name, phone, outcome, notes, client_visible_note, client_id, leadgen_clients(name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("leadgen_clients").select("id, name").eq("active", true).order("name"),
  ]);

  // Manual calls can only be logged for clients Admin assigned to this agent
  // (agents with no assignments yet keep the full list, as before).
  const assignedClientIds = await getAgentAssignedClientIds(agent.id);
  const clientOptions = (clients ?? []).filter((c) => assignedClientIds.length === 0 || assignedClientIds.includes(c.id));

  const records: CallLogRow[] = ((data ?? []) as unknown as LeadgenCallLogRecord[]).map(
    ({ client_id: _client_id, leadgen_clients, ...rest }) => ({
      ...rest,
      businessClient: leadgen_clients?.name ?? "Unknown client",
    })
  );

  return (
    <AgentCallLogClient
      crmLabel="Lead Generation CRM"
      records={records}
      createAction={createLeadgenCallLogAction}
      businessClientField={{ mode: "select", options: clientOptions.map((c) => ({ id: c.id, name: c.name })) }}
    />
  );
}
