import { NextRequest, NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  buildCallLogsCsv,
  callLogDateRangeBounds,
  callLogExportFilename,
  callLogSearchOrFilter,
  isCallLogOutcome,
  parseCallLogListParams,
  type CallLogCsvRow,
  type CallLogRow,
} from "@/lib/call-log";

export const runtime = "nodejs";

type AgentRow = { id: string; full_name: string; email: string };
type CrmCallLogRecord = Omit<CallLogRow, "businessClient"> & { business_client_name: string };

// Streams every Growth CRM call log matching the current list's filters (or
// every call log at all, for "Export All") as a spreadsheet-ready CSV -
// "Export Filtered" and "Export All Call Logs" on AdminCallLogReport both
// hit this route, only differing by ?scope=. Fetches in batches rather than
// one .select() so an export is never silently capped at PostgREST's
// default row limit as the table grows into the thousands.
const BATCH_SIZE = 1000;
const MAX_ROWS = 200_000;

export async function GET(request: NextRequest) {
  await requireCrmAdmin();
  const admin = getSupabaseAdmin();
  const searchParams = request.nextUrl.searchParams;
  const scope = searchParams.get("scope") === "all" ? "all" : "filtered";
  const params = scope === "filtered" ? parseCallLogListParams(Object.fromEntries(searchParams.entries())) : null;

  const { data: agents } = await admin.from("crm_users").select("id, full_name, email").eq("role", "agent");
  const agentById = new Map(((agents ?? []) as AgentRow[]).map((agent) => [agent.id, agent.full_name || agent.email]));

  const rows: CallLogCsvRow[] = [];
  let offset = 0;

  while (offset < MAX_ROWS) {
    let query = admin
      .from("crm_call_logs")
      .select("id, created_at, agent_id, business_name, phone, outcome, notes, business_client_name")
      .order("created_at", { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (params) {
      if (params.agent !== "all") query = query.eq("agent_id", params.agent);
      if (isCallLogOutcome(params.outcome)) query = query.eq("outcome", params.outcome);
      if (params.search) query = query.or(callLogSearchOrFilter(params.search));
      const { gte, lte } = callLogDateRangeBounds(params.from, params.to);
      if (gte) query = query.gte("created_at", gte);
      if (lte) query = query.lte("created_at", lte);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const batch = (data ?? []) as CrmCallLogRecord[];
    for (const record of batch) {
      rows.push({
        createdAt: record.created_at,
        agentName: agentById.get(record.agent_id) ?? "Unknown agent",
        businessName: record.business_name,
        businessClient: record.business_client_name,
        phone: record.phone,
        outcome: record.outcome,
        notes: record.notes,
      });
    }

    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return new NextResponse(buildCallLogsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${callLogExportFilename()}"`,
    },
  });
}
