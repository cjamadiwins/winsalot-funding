import { NextRequest, NextResponse } from "next/server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
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
type LeadgenCallLogRecord = Omit<CallLogRow, "businessClient"> & {
  client_id: string | null;
  leadgen_clients: { name: string } | null;
};

// Lead Generation CRM twin of
// src/app/admin/(dashboard)/crm/performance/call-notes/export/route.ts -
// same batched-fetch CSV export, plus the client_id filter and
// client_visible_note column that only exist on leadgen_call_logs.
const BATCH_SIZE = 1000;
const MAX_ROWS = 200_000;

export async function GET(request: NextRequest) {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const searchParams = request.nextUrl.searchParams;
  const scope = searchParams.get("scope") === "all" ? "all" : "filtered";
  const params = scope === "filtered" ? parseCallLogListParams(Object.fromEntries(searchParams.entries())) : null;

  const { data: agents } = await admin.from("leadgen_users").select("id, full_name, email").eq("role", "agent");
  const agentById = new Map(((agents ?? []) as AgentRow[]).map((agent) => [agent.id, agent.full_name || agent.email]));

  const rows: CallLogCsvRow[] = [];
  let offset = 0;

  while (offset < MAX_ROWS) {
    let query = admin
      .from("leadgen_call_logs")
      .select(
        "id, created_at, agent_id, business_name, phone, outcome, notes, client_visible_note, client_id, leadgen_clients(name)"
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (params) {
      if (params.agent !== "all") query = query.eq("agent_id", params.agent);
      if (isCallLogOutcome(params.outcome)) query = query.eq("outcome", params.outcome);
      if (params.client !== "all") query = query.eq("client_id", params.client);
      if (params.search) query = query.or(callLogSearchOrFilter(params.search));
      const { gte, lte } = callLogDateRangeBounds(params.from, params.to);
      if (gte) query = query.gte("created_at", gte);
      if (lte) query = query.lte("created_at", lte);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const batch = (data ?? []) as unknown as LeadgenCallLogRecord[];
    for (const record of batch) {
      rows.push({
        createdAt: record.created_at,
        agentName: agentById.get(record.agent_id) ?? "Unknown agent",
        businessName: record.business_name,
        businessClient: record.leadgen_clients?.name ?? "Unknown client",
        phone: record.phone,
        outcome: record.outcome,
        notes: record.notes,
        clientVisibleNote: record.client_visible_note,
      });
    }

    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return new NextResponse(buildCallLogsCsv(rows, { includeClientVisibleNote: true }), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${callLogExportFilename()}"`,
    },
  });
}
