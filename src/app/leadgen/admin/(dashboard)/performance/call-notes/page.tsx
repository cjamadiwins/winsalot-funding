import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
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
import { updateCallLogClientVisibleNoteAction } from "./actions";

type SearchParams = Promise<{
  agent?: string;
  outcome?: string;
  client?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
}>;
type AgentRow = { id: string; full_name: string; email: string };
type ClientRow = { id: string; name: string };
type LeadgenCallLogRecord = Omit<CallLogRow, "businessClient"> & {
  client_id: string | null;
  leadgen_clients: { name: string } | null;
};

export default async function LeadgenAdminCallLogPage({ searchParams }: { searchParams: SearchParams }) {
  await requireLeadgenAdmin();
  const rawParams = await searchParams;
  const params = parseCallLogListParams(rawParams);
  const admin = getSupabaseAdmin();

  let query = admin
    .from("leadgen_call_logs")
    .select(
      "id, created_at, agent_id, business_name, phone, outcome, notes, client_visible_note, client_id, leadgen_clients(name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (params.agent !== "all") query = query.eq("agent_id", params.agent);
  if (isCallLogOutcome(params.outcome)) query = query.eq("outcome", params.outcome);
  if (params.client !== "all") query = query.eq("client_id", params.client);
  if (params.search) query = query.or(callLogSearchOrFilter(params.search));
  const { gte, lte } = callLogDateRangeBounds(params.from, params.to);
  if (gte) query = query.gte("created_at", gte);
  if (lte) query = query.lte("created_at", lte);

  const [rangeStart, rangeEnd] = callLogRangeFor(params.page, params.pageSize);
  query = query.range(rangeStart, rangeEnd);

  const [{ data: logs, error, count }, { data: agents }, { data: clients }] = await Promise.all([
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
      exportBaseHref="/leadgen/admin/performance/call-notes/export"
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
      businessClientFilter={{
        options: ((clients ?? []) as ClientRow[]).map((client) => ({ id: client.id, name: client.name })),
        selected: params.client,
      }}
      clientVisibleNote={{ updateAction: updateCallLogClientVisibleNoteAction }}
      errorMessage={error?.message}
    />
  );
}
