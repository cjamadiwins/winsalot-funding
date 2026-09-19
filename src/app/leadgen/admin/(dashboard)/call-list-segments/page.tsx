import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listSegments } from "@/lib/call-list-segments";
import CallListSegmentsClient from "@/components/crm-call-list/CallListSegmentsClient";
import { syncSegmentNowAction } from "./actions";

export default async function CallListSegmentsPage() {
  await requireLeadgenAdmin();

  const admin = getSupabaseAdmin();
  const [segments, agentsResult] = await Promise.all([
    listSegments("lead_generation"),
    admin.from("leadgen_users").select("id, full_name").eq("role", "agent").eq("active", true).order("full_name"),
  ]);

  const segmentIds = segments.map((s) => s.id);
  const campaignIds = [...new Set(segments.map((s) => s.leadgen_campaign_id).filter((id): id is string => !!id))];

  const [{ data: agentLinks }, { data: campaigns }] = await Promise.all([
    segmentIds.length
      ? admin.from("call_list_segment_agents").select("segment_id, agent_id").in("segment_id", segmentIds)
      : Promise.resolve({ data: [] as { segment_id: string; agent_id: string }[] }),
    campaignIds.length
      ? admin.from("leadgen_campaigns").select("id, name, client_id").in("id", campaignIds)
      : Promise.resolve({ data: [] as { id: string; name: string; client_id: string }[] }),
  ]);

  const clientIds = [...new Set((campaigns ?? []).map((c) => c.client_id))];
  const { data: clients } = clientIds.length
    ? await admin.from("leadgen_clients").select("id, name").in("id", clientIds)
    : { data: [] as { id: string; name: string }[] };

  const clientNameById = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const campaignLabelById = new Map(
    ((campaigns ?? []) as { id: string; name: string; client_id: string }[]).map((c) => [
      c.id,
      `${clientNameById.get(c.client_id) ?? "Unknown Client"} — ${c.name}`,
    ])
  );

  const agentNameById = new Map(((agentsResult.data ?? []) as { id: string; full_name: string }[]).map((a) => [a.id, a.full_name]));
  const agentIdsBySegment = new Map<string, string[]>();
  for (const link of agentLinks ?? []) {
    const list = agentIdsBySegment.get(link.segment_id) ?? [];
    list.push(link.agent_id);
    agentIdsBySegment.set(link.segment_id, list);
  }

  const rows = segments.map((segment) => ({
    segment,
    serviceLabel: (segment.leadgen_campaign_id && campaignLabelById.get(segment.leadgen_campaign_id)) || "—",
    agentNames: (agentIdsBySegment.get(segment.id) ?? []).map((id) => agentNameById.get(id) ?? "Unknown"),
  }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Call List Segments</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Admin-only. Connect a Google Sheet as the editable master call list for a named segment — new rows sync
            into this CRM, but every call, note, and outcome stays here. Agents work entirely inside the CRM.
          </p>
        </div>
        <Link
          href="/leadgen/admin/call-list-segments/new"
          className="whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          New Segment
        </Link>
      </div>

      <div className="mt-6">
        <CallListSegmentsClient basePath="/leadgen/admin/call-list-segments" rows={rows} syncNowAction={syncSegmentNowAction} />
      </div>
    </div>
  );
}
