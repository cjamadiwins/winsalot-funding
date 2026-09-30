import Link from "next/link";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { emptyCallListProgress } from "@/lib/call-list-progress";
import { loadCallListProgress } from "@/lib/call-list-progress-data";
import { CallListCardFrame, CallListProgressSummary } from "@/components/crm-call-list/CallListProgressInfo";
import type { CallListSegmentRow } from "@/lib/call-list-types";
import { GROWTH_CALL_LIST_OWNER } from "@/lib/growth-call-list-owner";

const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  lead_generation: "Lead Generation",
  business_financing: "Business Financing",
  both_services: "Lead Gen + Financing",
};

export default async function AgentCallListSegmentsPage() {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (call_list_segments_growth_agent_select_assigned /
  // call_list_leads_growth_agent_select) is what actually enforces "only
  // segments assigned to me" - this query would simply return nothing for
  // anything else, session-scoped client, no service-role client here.
  // The error is checked explicitly (not just `data ?? []`) because a
  // real query failure here (e.g. a future RLS regression) must never be
  // indistinguishable from "genuinely nothing assigned yet" - that gap is
  // exactly what let a real bug read as a data/assignment problem before.
  const { data: segments, error: segmentsError } = await supabase
    .from("call_list_segments")
    .select("*")
    .order("created_at", { ascending: false });
  const rows = (segments ?? []) as CallListSegmentRow[];

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
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-input-bg)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">No call lists have been assigned to you yet.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((segment) => {
            const progress = progressBySegment.get(segment.id) ?? emptyCallListProgress();
            return (
            <Link
              key={segment.id}
              href={`/agent/call-list-segments/${segment.id}`}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-4 hover:border-[var(--color-accent)]"
            >
              <CallListCardFrame status={progress.status}>
              <div className="font-semibold text-[var(--color-ink-strong)]">{segment.name}</div>
              <div className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">
                {segment.campaign_name || OPPORTUNITY_TYPE_LABELS[segment.growth_opportunity_type ?? ""] || "—"}
              </div>
              <div className="mt-2 text-[12px] text-[var(--color-text-muted)]">Client / Campaign Owner: {GROWTH_CALL_LIST_OWNER}</div>
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
