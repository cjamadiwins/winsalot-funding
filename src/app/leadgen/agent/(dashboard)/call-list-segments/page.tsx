import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { emptyCallListProgress } from "@/lib/call-list-progress";
import { loadCallListProgress } from "@/lib/call-list-progress-data";
import { CallListCardFrame, CallListProgressSummary } from "@/components/crm-call-list/CallListProgressInfo";
import type { CallListSegmentRow } from "@/lib/call-list-types";

export default async function LeadgenAgentCallListSegmentsPage() {
  await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  // RLS (call_list_leads_leadgen_agent_select) is what actually enforces
  // "only segments assigned to me" - this query would simply return
  // nothing for anything else, session-scoped client, no service-role
  // client here. The error is checked explicitly (not just `data ?? []`)
  // because a real query failure here (e.g. a future RLS regression) must
  // never be indistinguishable from "genuinely nothing assigned yet".
  const { data: segments, error: segmentsError } = await supabase
    .from("call_list_segments")
    .select("*")
    .order("created_at", { ascending: false });
  const allRows = (segments ?? []) as CallListSegmentRow[];
  const admin = getSupabaseAdmin();
  const campaignIds = [...new Set(allRows.map((s) => s.leadgen_campaign_id).filter((id): id is string => !!id))];
  const { data: campaigns } = campaignIds.length
    ? await admin.from("leadgen_campaigns").select("id, client_id, status").in("id", campaignIds)
    : { data: [] as { id: string; client_id: string; status: string }[] };
  const clientIds = [...new Set((campaigns ?? []).map((c) => c.client_id))];
  const { data: activeClients } = clientIds.length
    ? await admin.from("leadgen_clients").select("id, name").in("id", clientIds).eq("active", true)
    : { data: [] as { id: string; name: string }[] };
  const activeIds = new Set((activeClients ?? []).map((c) => c.id));
  const clientNameById = new Map((activeClients ?? []).map((c) => [c.id, c.name]));
  const clientNameByCampaignId = new Map((campaigns ?? []).map((c) => [c.id, clientNameById.get(c.client_id) ?? null]));
  const activeCampaignIds = new Set((campaigns ?? []).filter((c) => c.status === "active" && activeIds.has(c.client_id)).map((c) => c.id));
  const rows = allRows.filter((segment) => segment.leadgen_campaign_id && activeCampaignIds.has(segment.leadgen_campaign_id));
  // A deployed list with no client/campaign at all is shown (blocked) rather
  // than silently hidden, so the agent knows to ask Admin instead of thinking
  // the list vanished. Lists on a merely paused campaign stay hidden as before.
  const unassignedRows = allRows.filter((segment) => segment.status !== "draft" && !segment.leadgen_campaign_id);

  const segmentIds = rows.map((s) => s.id);
  // Session-scoped client: RLS still limits this to leads on lists assigned to this agent.
  const progressBySegment = await loadCallListProgress(supabase, segmentIds);

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-[var(--color-ink-strong)]">My Call Lists</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">Call List Segments an admin has deployed to you.</p>

      {segmentsError ? (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-6 py-10 text-center">
          <p className="text-sm text-rose-700">Failed to load your call lists: {segmentsError.message}</p>
        </div>
      ) : rows.length === 0 && unassignedRows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-input-bg)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">No call lists have been assigned to you yet.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {unassignedRows.map((segment) => (
            <Link
              key={segment.id}
              href={`/leadgen/agent/call-list-segments/${segment.id}`}
              className="rounded-xl border border-amber-300 bg-amber-50 p-4 hover:border-amber-400"
            >
              <div className="font-semibold text-[var(--color-ink-strong)]">{segment.name}</div>
              <div className="mt-2 inline-block rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Campaign Assignment Required</div>
              <div className="mt-2 text-[12.5px] text-amber-800">Ask Admin to assign this list to a client before calling.</div>
            </Link>
          ))}
          {rows.map((segment) => {
            const progress = progressBySegment.get(segment.id) ?? emptyCallListProgress();
            return (
            <Link
              key={segment.id}
              href={`/leadgen/agent/call-list-segments/${segment.id}`}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-4 hover:border-[var(--color-accent)]"
            >
              <CallListCardFrame status={progress.status}>
              <div className="font-semibold text-[var(--color-ink-strong)]">{segment.name}</div>
              <div className="mt-1 text-sm text-[var(--color-text-muted)]">{segment.campaign_name || "—"}</div>
              {segment.leadgen_campaign_id && clientNameByCampaignId.get(segment.leadgen_campaign_id) && (
                <div className="mt-1 text-[12.5px] font-semibold text-sky-800">Calling for: {clientNameByCampaignId.get(segment.leadgen_campaign_id)}</div>
              )}
              <CallListProgressSummary progress={progress} />
              </CallListCardFrame>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
