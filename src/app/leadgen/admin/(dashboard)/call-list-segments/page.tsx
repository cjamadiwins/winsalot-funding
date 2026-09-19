import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listSegments } from "@/lib/call-list-segments";
import CallListSegmentsClient from "@/components/crm-call-list/CallListSegmentsClient";

export default async function LeadgenCallListSegmentsPage() {
  await requireLeadgenAdmin();

  const admin = getSupabaseAdmin();
  const [segments, agentsResult, campaignsResult] = await Promise.all([
    listSegments("lead_generation"),
    admin.from("leadgen_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name"),
    admin.from("leadgen_campaigns").select("id, name, client_id"),
  ]);

  const clientIds = [...new Set(((campaignsResult.data ?? []) as { id: string; name: string; client_id: string }[]).map((c) => c.client_id))];
  const { data: clients } = clientIds.length
    ? await admin.from("leadgen_clients").select("id, name").in("id", clientIds)
    : { data: [] as { id: string; name: string }[] };
  const clientNameById = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const campaignLabelById = new Map(
    ((campaignsResult.data ?? []) as { id: string; name: string; client_id: string }[]).map((c) => [
      c.id,
      `${clientNameById.get(c.client_id) ?? "Unknown client"} — ${c.name}`,
    ])
  );

  const segmentIds = segments.map((s) => s.id);
  const [{ data: agentLinks }, { data: leadCounts }] = await Promise.all([
    segmentIds.length
      ? admin.from("call_list_segment_agents").select("segment_id, agent_id").in("segment_id", segmentIds)
      : Promise.resolve({ data: [] as { segment_id: string; agent_id: string }[] }),
    segmentIds.length
      ? admin.from("call_list_leads").select("segment_id").in("segment_id", segmentIds)
      : Promise.resolve({ data: [] as { segment_id: string }[] }),
  ]);

  const agentNameById = new Map(((agentsResult.data ?? []) as { id: string; full_name: string }[]).map((a) => [a.id, a.full_name]));
  const agentIdsBySegment = new Map<string, string[]>();
  for (const link of agentLinks ?? []) {
    const list = agentIdsBySegment.get(link.segment_id) ?? [];
    list.push(link.agent_id);
    agentIdsBySegment.set(link.segment_id, list);
  }
  const leadCountBySegment = new Map<string, number>();
  for (const row of leadCounts ?? []) {
    leadCountBySegment.set(row.segment_id, (leadCountBySegment.get(row.segment_id) ?? 0) + 1);
  }

  const rows = segments.map((segment) => ({
    segment,
    serviceLabel: segment.campaign_name || campaignLabelById.get(segment.leadgen_campaign_id ?? "") || "—",
    agentNames: (agentIdsBySegment.get(segment.id) ?? []).map((id) => agentNameById.get(id) ?? "Unknown"),
    leadCount: leadCountBySegment.get(segment.id) ?? 0,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Call List Segments</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Admin-only. Upload a CSV/XLSX export (e.g. from LeadSwift), clean it inside the CRM, then deploy it to
            agents — every call, note, and outcome feeds the existing Call Logs.
          </p>
        </div>
        <Link
          href="/leadgen/admin/call-list-segments/new"
          className="whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Upload Call List
        </Link>
      </div>

      <div className="mt-6">
        <CallListSegmentsClient basePath="/leadgen/admin/call-list-segments" rows={rows} />
      </div>
    </div>
  );
}
