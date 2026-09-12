import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import AdminCallLogReport, { type AdminCallLogEntry } from "@/components/call-log/AdminCallLogReport";
import {
  callLogDateRangeBounds,
  callLogRangeFor,
  callLogSearchOrFilter,
  isCallLogOutcome,
  parseCallLogListParams,
  type CallLogRow,
} from "@/lib/call-log";

type SearchParams = Promise<{
  agent?: string;
  outcome?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
}>;
type AgentRow = { id: string; full_name: string; email: string };
type CrmCallLogRecord = Omit<CallLogRow, "businessClient"> & { business_client_name: string };

export default async function GrowthAdminCallLogPage({ searchParams }: { searchParams: SearchParams }) {
  await requireCrmAdmin();
  const rawParams = await searchParams;
  const params = parseCallLogListParams(rawParams);
  const admin = getSupabaseAdmin();

  let query = admin
    .from("crm_call_logs")
    .select("id, created_at, agent_id, business_name, phone, outcome, notes, business_client_name", { count: "exact" })
    .order("created_at", { ascending: false });

  if (params.agent !== "all") query = query.eq("agent_id", params.agent);
  if (isCallLogOutcome(params.outcome)) query = query.eq("outcome", params.outcome);
  if (params.search) query = query.or(callLogSearchOrFilter(params.search));
  const { gte, lte } = callLogDateRangeBounds(params.from, params.to);
  if (gte) query = query.gte("created_at", gte);
  if (lte) query = query.lte("created_at", lte);

  const [rangeStart, rangeEnd] = callLogRangeFor(params.page, params.pageSize);
  query = query.range(rangeStart, rangeEnd);

  const [{ data: logs, error, count }, { data: agents }] = await Promise.all([
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
      exportBaseHref="/admin/crm/performance/call-notes/export"
      entries={entries}
      totalCount={count ?? entries.length}
      agents={agentRows.map((agent) => ({ id: agent.id, name: agent.full_name || agent.email }))}
      filters={{
        search: params.search,
        agent: params.agent,
        outcome: params.outcome,
        from: params.from,
        to: params.to,
        page: params.page,
        pageSize: params.pageSize,
      }}
      errorMessage={error?.message}
    />
  );
}
