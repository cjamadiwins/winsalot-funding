import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeProgressBySegment, type CallListProgress, type CallListProgressLead } from "./call-list-progress";

const PAGE = 1000;

// Loads call state for the given segments in pages (PostgREST caps a single
// response at 1000 rows, which a large list would silently exceed) and
// derives progress per segment. Pass the caller's own client: the admin
// service-role client for Admin pages, the session client for agents so RLS
// keeps limiting them to segments/leads they are already authorized to see.
export async function loadCallListProgress(
  client: SupabaseClient,
  segmentIds: string[],
  pausedSegmentIds: ReadonlySet<string> = new Set()
): Promise<Map<string, CallListProgress>> {
  if (segmentIds.length === 0) return new Map();
  const leads: CallListProgressLead[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("call_list_leads")
      .select("id, segment_id, last_outcome, last_contacted_at, callback_at, removed_at")
      .in("segment_id", segmentIds)
      .is("removed_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    leads.push(...(data as CallListProgressLead[]));
    if (data.length < PAGE) break;
  }
  return computeProgressBySegment(leads, pausedSegmentIds);
}
