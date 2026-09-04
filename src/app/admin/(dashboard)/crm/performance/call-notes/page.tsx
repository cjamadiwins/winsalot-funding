import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import AdminCallLogReport, { type AdminCallLogEntry } from "@/components/call-log/AdminCallLogReport";
import { isCallLogOutcome, type CallLogRow } from "@/lib/call-log";

type SearchParams = Promise<{ agent?: string; outcome?: string }>;
type AgentRow = { id: string; full_name: string; email: string };
type CrmCallLogRecord = Omit<CallLogRow, "businessClient"> & { business_client_name: string };
type SubcontractorCallLogRecord = Omit<CrmCallLogRecord, "agent_id"> & { subcontractor_id: string };

export default async function GrowthAdminCallLogPage({ searchParams }: { searchParams: SearchParams }) {
  await requireCrmAdmin();
  const params = await searchParams;
  const admin = getSupabaseAdmin();

  let query = admin
    .from("crm_call_logs")
    .select("id, created_at, agent_id, business_name, phone, outcome, notes, business_client_name")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (params.outcome && isCallLogOutcome(params.outcome)) query = query.eq("outcome", params.outcome);

  let subcontractorQuery = admin
    .from("crm_subcontractor_call_logs")
    .select("id, created_at, subcontractor_id, business_name, phone, outcome, notes, business_client_name")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (params.outcome && isCallLogOutcome(params.outcome)) subcontractorQuery = subcontractorQuery.eq("outcome", params.outcome);

  const [{ data: logs, error }, { data: agents }, { data: subcontractorLogs, error: subcontractorError }, { data: subcontractors }] = await Promise.all([
    query,
    admin.from("crm_users").select("id, full_name, email").eq("role", "agent").order("full_name"),
    subcontractorQuery,
    admin.from("crm_subcontractors").select("id, full_name, email").order("full_name"),
  ]);

  const agentRows = (agents ?? []) as AgentRow[];
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent.full_name || agent.email]));
  const employeeEntries: AdminCallLogEntry[] = ((logs ?? []) as CrmCallLogRecord[]).map(({ business_client_name, ...log }) => ({
    ...log,
    businessClient: business_client_name,
    agentName: agentById.get(log.agent_id) ?? "Unknown agent",
  }));
  const subcontractorRows = (subcontractors ?? []) as AgentRow[];
  const subcontractorById = new Map(subcontractorRows.map((person) => [person.id, person.full_name || person.email]));
  const contractorEntries: AdminCallLogEntry[] = ((subcontractorLogs ?? []) as SubcontractorCallLogRecord[]).map(({ business_client_name, subcontractor_id, ...log }) => ({
    ...log,
    agent_id: subcontractor_id,
    businessClient: business_client_name,
    agentName: `${subcontractorById.get(subcontractor_id) ?? "Unknown subcontractor"} (Subcontractor)`,
  }));
  const selected = params.agent ?? "all";
  const entries = [...employeeEntries, ...contractorEntries]
    .filter((entry) => selected === "all" || entry.agent_id === selected)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const people = [
    ...agentRows.map((agent) => ({ id: agent.id, name: agent.full_name || agent.email })),
    ...subcontractorRows.map((person) => ({ id: person.id, name: `${person.full_name || person.email} (Subcontractor)` })),
  ];

  return (
    <AdminCallLogReport
      title="Growth CRM Call Logs"
      backHref="/admin/crm/performance"
      entries={entries}
      agents={people}
      selectedAgent={selected}
      selectedOutcome={params.outcome ?? "all"}
      errorMessage={error?.message ?? subcontractorError?.message}
    />
  );
}
