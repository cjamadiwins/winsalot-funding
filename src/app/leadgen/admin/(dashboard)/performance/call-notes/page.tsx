import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import AdminCallLogReport, { type AdminCallLogEntry } from "@/components/call-log/AdminCallLogReport";
import { isCallLogOutcome, type CallLogRow } from "@/lib/call-log";

type SearchParams = Promise<{ agent?: string; client?: string; outcome?: string }>;
type AgentRow = { id: string; full_name: string; email: string };
type ClientRow = { id: string; name: string };

export default async function LeadgenAdminCallLogPage({ searchParams }: { searchParams: SearchParams }) {
  await requireLeadgenAdmin();
  const params = await searchParams;
  const admin = getSupabaseAdmin();

  let query = admin
    .from("leadgen_call_logs")
    .select("id, created_at, agent_id, client_id, business_name, phone, outcome, notes")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (params.agent && params.agent !== "all") query = query.eq("agent_id", params.agent);
  if (params.client && params.client !== "all") query = query.eq("client_id", params.client);
  if (params.outcome && isCallLogOutcome(params.outcome)) query = query.eq("outcome", params.outcome);

  const [{ data: logs, error }, { data: agents }, { data: clients }] = await Promise.all([
    query,
    admin.from("leadgen_users").select("id, full_name, email").eq("role", "agent").order("full_name"),
    admin.from("leadgen_clients").select("id, name").order("name"),
  ]);

  const agentRows = (agents ?? []) as AgentRow[];
  const clientRows = (clients ?? []) as ClientRow[];
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent.full_name || agent.email]));
  const clientById = new Map(clientRows.map((client) => [client.id, client.name]));
  const entries: AdminCallLogEntry[] = ((logs ?? []) as CallLogRow[]).map((log) => ({
    ...log,
    agentName: agentById.get(log.agent_id) ?? "Unknown agent",
    client_name: log.client_id ? clientById.get(log.client_id) ?? "Unknown client" : null,
  }));

  return (
    <AdminCallLogReport
      title="Lead Generation Call Logs"
      backHref="/leadgen/admin/performance"
      entries={entries}
      agents={agentRows.map((agent) => ({ id: agent.id, name: agent.full_name || agent.email }))}
      clients={clientRows}
      selectedAgent={params.agent ?? "all"}
      selectedClient={params.client ?? "all"}
      selectedOutcome={params.outcome ?? "all"}
      errorMessage={error?.message}
    />
  );
}
