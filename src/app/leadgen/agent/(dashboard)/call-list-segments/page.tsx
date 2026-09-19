import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
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
  const rows = (segments ?? []) as CallListSegmentRow[];

  const segmentIds = rows.map((s) => s.id);
  const { data: leadCounts } = segmentIds.length
    ? await supabase.from("call_list_leads").select("segment_id, last_outcome").in("segment_id", segmentIds)
    : { data: [] as { segment_id: string; last_outcome: string | null }[] };

  const totalBySegment = new Map<string, number>();
  const remainingBySegment = new Map<string, number>();
  for (const row of leadCounts ?? []) {
    totalBySegment.set(row.segment_id, (totalBySegment.get(row.segment_id) ?? 0) + 1);
    if (!row.last_outcome) remainingBySegment.set(row.segment_id, (remainingBySegment.get(row.segment_id) ?? 0) + 1);
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-[var(--color-ink-strong)]">My Call Lists</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">Call List Segments an admin has deployed to you.</p>

      {segmentsError ? (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-6 py-10 text-center">
          <p className="text-sm text-rose-700">Failed to load your call lists: {segmentsError.message}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-input-bg)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">No call lists have been assigned to you yet.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((segment) => (
            <Link
              key={segment.id}
              href={`/leadgen/agent/call-list-segments/${segment.id}`}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-4 hover:border-[var(--color-accent)]"
            >
              <div className="font-semibold text-[var(--color-ink-strong)]">{segment.name}</div>
              <div className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">{segment.campaign_name || "—"}</div>
              <div className="mt-3 flex items-center justify-between text-[12.5px]">
                <span className="text-[var(--color-text-muted)]">{remainingBySegment.get(segment.id) ?? 0} remaining</span>
                <span className="text-[var(--color-text-muted)]">{totalBySegment.get(segment.id) ?? 0} total</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
