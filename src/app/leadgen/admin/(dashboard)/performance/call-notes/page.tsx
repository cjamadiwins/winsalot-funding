import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import AdminCallLogReport, { type AdminCallLogEntry } from "@/components/call-log/AdminCallLogReport";
import { isCallLogOutcome, type CallLogRow } from "@/lib/call-log";
import { updateCallLogClientVisibleNoteAction } from "./actions";

type SearchParams = Promise<{ agent?: string; outcome?: string; client?: string }>;
type AgentRow = { id: string; full_name: string; email: string };
type ClientRow = { id: string; name: string };
type LeadgenCallLogRecord = Omit<CallLogRow, "businessClient"> & {
  client_id: string | null;
  leadgen_clients: { name: string } | null;
};

export default async function LeadgenAdminCallLogPage({ searchParams }: { searchParams: SearchParams }) {
  await requireLeadgenAdmin();
  const params = await searchParams;
  const admin = getSupabaseAdmin();

  let query = admin
    .from("leadgen_call_logs")
    .select("id, created_at, agent_id, business_name, phone, outcome, notes, client_visible_note, client_id, leadgen_clients(name)")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (params.agent && params.agent !== "all") query = query.eq("agent_id", params.agent);
  if (params.outcome && isCallLogOutcome(params.outcome)) query = query.eq("outcome", params.outcome);
  if (params.client && params.client !== "all") query = query.eq("client_id", params.client);

  const [{ data: logs, error }, { data: agents }, { data: clients }] = await Promise.all([
    query,
    admin.from("leadgen_users").select("id, full_name, email").eq("role", "agent").order("full_name"),
    admin.from("leadgen_clients").select("id, name").order("name"),
  ]);

  const agentRows = (agents ?? []) as AgentRow[];
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent.full_name || agent.email]));
  const entries: AdminCallLogEntry[] = ((logs ?? []) as unknown as LeadgenCallLogRecord[]).map(
    ({ client_id: _client_id, leadgen_clients, ...log }) => ({
      ...log,
      businessClient: leadgen_clients?.name ?? "Unknown client",
      agentName: agentById.get(log.agent_id) ?? "Unknown agent",
    })
  );

  return (
    <AdminCallLogReport
      title="Lead Generation Call Logs"
      backHref="/leadgen/admin/performance"
      entries={entries}
      agents={agentRows.map((agent) => ({ id: agent.id, name: agent.full_name || agent.email }))}
      selectedAgent={params.agent ?? "all"}
      selectedOutcome={params.outcome ?? "all"}
      businessClientFilter={{
        options: ((clients ?? []) as ClientRow[]).map((client) => ({ id: client.id, name: client.name })),
        selected: params.client ?? "all",
      }}
      clientVisibleNote={{ updateAction: updateCallLogClientVisibleNoteAction }}
      errorMessage={error?.message}
    />
  );
}
