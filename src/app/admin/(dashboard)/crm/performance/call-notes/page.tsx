import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import AdminCallLogReport, { type AdminCallLogEntry } from "@/components/call-log/AdminCallLogReport";
import { isCallLogOutcome, type CallLogRow } from "@/lib/call-log";

type SearchParams = Promise<{ agent?: string; outcome?: string }>;
type AgentRow = { id: string; full_name: string; email: string };
type CrmCallLogRecord = Omit<CallLogRow, "businessClient"> & { business_client_name: string };

export default async function GrowthAdminCallLogPage({ searchParams }: { searchParams: SearchParams }) {
  await requireCrmAdmin();
  const params = await searchParams;
  const admin = getSupabaseAdmin();

  let query = admin
    .from("crm_call_logs")
    .select("id, created_at, agent_id, business_name, phone, outcome, notes, business_client_name")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (params.agent && params.agent !== "all") query = query.eq("agent_id", params.agent);
  if (params.outcome && isCallLogOutcome(params.outcome)) query = query.eq("outcome", params.outcome);

  const [{ data: logs, error }, { data: agents }] = await Promise.all([
    query,
    admin.from("crm_users").select("id, full_name, email").eq("role", "agent").order("full_name"),
  ]);

  const agentRows = (agents ?? []) as AgentRow[];
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent.full_name || agent.email]));
  const entries: AdminCallLogEntry[] = ((logs ?? []) as CrmCallLogRecord[]).map(({ business_client_name, ...log }) => ({
    ...log,
    businessClient: business_client_name,
    agentName: agentById.get(log.agent_id) ?? "Unknown agent",
  }));

  return (
    <AdminCallLogReport
      title="Growth CRM Call Logs"
      backHref="/admin/crm/performance"
      entries={entries}
      agents={agentRows.map((agent) => ({ id: agent.id, name: agent.full_name || agent.email }))}
      selectedAgent={params.agent ?? "all"}
      selectedOutcome={params.outcome ?? "all"}
      errorMessage={error?.message}
    />
  );
}
