import Link from "next/link";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listSegments } from "@/lib/call-list-segments";
import CallListSegmentsClient from "@/components/crm-call-list/CallListSegmentsClient";
import { syncSegmentNowAction } from "./actions";

export default async function CallListSegmentsPage() {
  await requireCrmAdmin();

  const admin = getSupabaseAdmin();
  const [segments, agentsResult] = await Promise.all([
    listSegments("growth"),
    admin.from("crm_users").select("id, full_name").eq("role", "agent").order("full_name"),
  ]);

  const segmentIds = segments.map((s) => s.id);
  const { data: agentLinks } = segmentIds.length
    ? await admin.from("call_list_segment_agents").select("segment_id, agent_id").in("segment_id", segmentIds)
    : { data: [] as { segment_id: string; agent_id: string }[] };

  const agentNameById = new Map(((agentsResult.data ?? []) as { id: string; full_name: string }[]).map((a) => [a.id, a.full_name]));
  const agentIdsBySegment = new Map<string, string[]>();
  for (const link of agentLinks ?? []) {
    const list = agentIdsBySegment.get(link.segment_id) ?? [];
    list.push(link.agent_id);
    agentIdsBySegment.set(link.segment_id, list);
  }

  const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
    lead_generation: "Lead Generation",
    business_financing: "Business Financing",
    both_services: "Lead Gen + Financing",
  };

  const rows = segments.map((segment) => ({
    segment,
    serviceLabel: OPPORTUNITY_TYPE_LABELS[segment.growth_opportunity_type ?? ""] ?? "—",
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
          href="/admin/crm/call-list-segments/new"
          className="whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          New Segment
        </Link>
      </div>

      <div className="mt-6">
        <CallListSegmentsClient basePath="/admin/crm/call-list-segments" rows={rows} syncNowAction={syncSegmentNowAction} />
      </div>
    </div>
  );
}
