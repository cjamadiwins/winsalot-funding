// Automatic Call List progress / usage status, shared by the Growth CRM and
// Lead Generation CRM (admin + agent views). Pure and derived on read from
// the existing call_list_leads call state (last_outcome / last_contacted_at /
// callback_at, which every logged call - Growth crm_call_logs and Lead Gen
// leadgen_call_logs alike - writes via updateSegmentLeadCallState). Nothing
// is stored or manually marked, so it can never drift from the call logs.

export type CallListProgressStatus = "not_started" | "in_progress" | "mostly_worked" | "completed" | "paused";

export type CallListProgress = {
  totalLeads: number;
  workedLeads: number;
  unworkedLeads: number;
  // Whole-number percent, floored so 100 is only ever reached when every lead is worked.
  progressPercent: number;
  pendingFollowUps: number;
  lastWorkedAt: string | null;
  status: CallListProgressStatus;
};

export type CallListProgressLead = {
  segment_id: string;
  last_outcome: string | null;
  last_contacted_at: string | null;
  callback_at: string | null;
  removed_at?: string | null;
};

export const CALL_LIST_PROGRESS_LABELS: Record<CallListProgressStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  mostly_worked: "Mostly Worked",
  completed: "Completed",
  paused: "Paused",
};

// Side-bar colours (no red, no purple) + matching text/progress-fill tints.
export const CALL_LIST_PROGRESS_STYLES: Record<CallListProgressStatus, { bar: string; fill: string; text: string }> = {
  not_started: { bar: "bg-slate-300", fill: "bg-slate-300", text: "text-slate-600" },
  in_progress: { bar: "bg-emerald-500", fill: "bg-emerald-500", text: "text-emerald-700" },
  mostly_worked: { bar: "bg-amber-500", fill: "bg-amber-500", text: "text-amber-700" },
  completed: { bar: "bg-blue-500", fill: "bg-blue-500", text: "text-blue-700" },
  paused: { bar: "bg-slate-600", fill: "bg-slate-600", text: "text-slate-700" },
};

export function getCallListProgressStatus(totalLeads: number, workedLeads: number, paused = false): CallListProgressStatus {
  if (paused) return "paused";
  if (totalLeads <= 0 || workedLeads <= 0) return "not_started";
  if (workedLeads >= totalLeads) return "completed";
  const percent = Math.floor((workedLeads / totalLeads) * 100);
  return percent >= 75 ? "mostly_worked" : "in_progress";
}

export function emptyCallListProgress(paused = false): CallListProgress {
  return { totalLeads: 0, workedLeads: 0, unworkedLeads: 0, progressPercent: 0, pendingFollowUps: 0, lastWorkedAt: null, status: getCallListProgressStatus(0, 0, paused) };
}

// One row per lead, so a lead called many times (or with several outcomes,
// callbacks, appointment, DNC) is counted exactly once. Worked = any recorded
// call outcome; a pending callback is tallied separately and never changes
// the worked count. Removed leads are excluded.
export function computeCallListProgress(leads: CallListProgressLead[], paused = false): CallListProgress {
  let total = 0;
  let worked = 0;
  let followUps = 0;
  let last: string | null = null;
  for (const lead of leads) {
    if (lead.removed_at) continue;
    total += 1;
    const isWorked = !!lead.last_outcome;
    if (isWorked) worked += 1;
    if (lead.callback_at) followUps += 1;
    const touched = lead.last_contacted_at;
    if (isWorked && touched && (!last || new Date(touched).getTime() > new Date(last).getTime())) last = touched;
  }
  return {
    totalLeads: total,
    workedLeads: worked,
    unworkedLeads: total - worked,
    progressPercent: total > 0 ? Math.floor((worked / total) * 100) : 0,
    pendingFollowUps: followUps,
    lastWorkedAt: last,
    status: getCallListProgressStatus(total, worked, paused),
  };
}

export function computeProgressBySegment(leads: CallListProgressLead[], pausedSegmentIds: ReadonlySet<string> = new Set()): Map<string, CallListProgress> {
  const grouped = new Map<string, CallListProgressLead[]>();
  for (const lead of leads) {
    const list = grouped.get(lead.segment_id) ?? [];
    list.push(lead);
    grouped.set(lead.segment_id, list);
  }
  const result = new Map<string, CallListProgress>();
  for (const [segmentId, list] of grouped) result.set(segmentId, computeCallListProgress(list, pausedSegmentIds.has(segmentId)));
  return result;
}

export function formatLastWorked(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dayKey = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return `Today, ${time}`;
  if (dayKey(d) === dayKey(yesterday)) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) })}, ${time}`;
}
