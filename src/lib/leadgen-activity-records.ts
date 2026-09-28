// Lead Generation CRM — drill-down records for the Activity KPI cards
// (Calls Today/This Week, Emails Today/This Week, Delivered/Bounced/Failed,
// Follow-Ups Completed) shown on the admin and agent Performance pages.
// Same "enrich once, derive both the card's count and its modal's rows from
// that one array" convention as leadgen-dashboard-records.ts, so a card's
// number can never drift from what clicking it shows.
import { addDays, leadgenDateKey, leadgenMondayOf } from "./leadgen-performance";
import type { LeadgenEmailStatus } from "./leadgen-types";

export type CallLogCardSource = {
  id: string;
  created_at: string;
  agent_id: string;
  business_name: string;
  phone: string;
  outcome: string;
  notes: string;
  client_id: string | null;
};

export type CallLogCardRecord = CallLogCardSource & {
  agentName: string;
  clientName: string | null;
};

export function buildCallLogCardRecords(
  logs: CallLogCardSource[],
  agentNameById: Map<string, string>,
  clientNameById: Map<string, string>
): CallLogCardRecord[] {
  return logs.map((log) => ({
    ...log,
    agentName: agentNameById.get(log.agent_id) ?? "Unknown agent",
    clientName: log.client_id ? clientNameById.get(log.client_id) ?? null : null,
  }));
}

export function sortCallLogsMostRecentFirst(records: CallLogCardRecord[]): CallLogCardRecord[] {
  return records.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function filterRecordsToday<T extends { created_at: string }>(records: T[], now: Date = new Date()): T[] {
  const todayKey = leadgenDateKey(now);
  return records.filter((r) => leadgenDateKey(r.created_at) === todayKey);
}

export function filterRecordsThisWeek<T extends { created_at: string }>(records: T[], now: Date = new Date()): T[] {
  const todayKey = leadgenDateKey(now);
  const weekStart = leadgenMondayOf(todayKey);
  const weekEnd = addDays(weekStart, 4);
  return records.filter((r) => {
    const key = leadgenDateKey(r.created_at);
    return key >= weekStart && key <= weekEnd;
  });
}

// Matches the exact column set the Performance pages select from
// leadgen_emails - a superset of what this file's own builders need, so the
// same array can also feed leadgen-dashboard-records.ts's
// latestLeadgenEmailByLeadId() without a separate query or an unsafe cast.
export type EmailCardSource = {
  id: string;
  created_at: string;
  client_id: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  sender_email: string;
  sent_by: string | null;
  status: LeadgenEmailStatus;
  sent_at: string | null;
  delivered_at: string | null;
  delayed_at: string | null;
  bounced_at: string | null;
  bounce_reason: string | null;
  complained_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
};

export type EmailCardRecord = EmailCardSource & {
  agentName: string;
  clientName: string | null;
  businessName: string | null;
};

export function buildEmailCardRecords(
  emails: EmailCardSource[],
  agentNameById: Map<string, string>,
  clientNameById: Map<string, string>,
  businessNameByLeadId: Map<string, string>
): EmailCardRecord[] {
  return emails.map((email) => ({
    ...email,
    agentName: email.sent_by ? agentNameById.get(email.sent_by) ?? "Unknown agent" : "Unknown agent",
    clientName: email.client_id ? clientNameById.get(email.client_id) ?? null : null,
    businessName: email.lead_id ? businessNameByLeadId.get(email.lead_id) ?? null : null,
  }));
}

export function sortEmailsMostRecentFirst(records: EmailCardRecord[]): EmailCardRecord[] {
  return records
    .slice()
    .sort((a, b) => new Date(b.sent_at ?? b.created_at).getTime() - new Date(a.sent_at ?? a.created_at).getTime());
}

// Emails use `sent_at` (not `created_at`) for "today"/"this week" windowing,
// matching computeLeadgenAgentActivityKpis's own definition of when an
// email counts - a draft row with sent_at still null never matches either
// filter, same as it's excluded from the Emails Today/This Week counts.
export function filterEmailsSentToday(records: EmailCardRecord[], now: Date = new Date()): EmailCardRecord[] {
  const todayKey = leadgenDateKey(now);
  return records.filter((r) => r.sent_at && leadgenDateKey(r.sent_at) === todayKey);
}

export function filterEmailsSentThisWeek(records: EmailCardRecord[], now: Date = new Date()): EmailCardRecord[] {
  const todayKey = leadgenDateKey(now);
  const weekStart = leadgenMondayOf(todayKey);
  const weekEnd = addDays(weekStart, 4);
  return records.filter((r) => {
    if (!r.sent_at) return false;
    const key = leadgenDateKey(r.sent_at);
    return key >= weekStart && key <= weekEnd;
  });
}

export type FollowUpCompletedCardSource = {
  id: string;
  lead_id: string;
  agent_id: string | null;
  status: "pending" | "completed";
  completed_at: string | null;
  note: string | null;
};

export type FollowUpCompletedCardRecord = FollowUpCompletedCardSource & {
  agentName: string;
  businessName: string;
};

export function buildFollowUpCompletedCardRecords(
  followUps: FollowUpCompletedCardSource[],
  agentNameById: Map<string, string>,
  businessNameByLeadId: Map<string, string>
): FollowUpCompletedCardRecord[] {
  return followUps.map((followUp) => ({
    ...followUp,
    agentName: followUp.agent_id ? agentNameById.get(followUp.agent_id) ?? "Unknown agent" : "Unassigned",
    businessName: businessNameByLeadId.get(followUp.lead_id) ?? "Unknown business",
  }));
}

export function sortFollowUpsCompletedMostRecentFirst(records: FollowUpCompletedCardRecord[]): FollowUpCompletedCardRecord[] {
  return records
    .slice()
    .sort((a, b) => new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime());
}

// Same "this week" window as computeLeadgenAgentActivityKpis's own
// followUpsCompletedThisWeek count, keyed on `completed_at` (not
// `created_at`, unlike calls/emails) so the drill-down's records can never
// disagree with that count.
export function filterFollowUpsCompletedThisWeek(records: FollowUpCompletedCardRecord[], now: Date = new Date()): FollowUpCompletedCardRecord[] {
  const todayKey = leadgenDateKey(now);
  const weekStart = leadgenMondayOf(todayKey);
  const weekEnd = addDays(weekStart, 4);
  return records.filter((r) => {
    if (!r.completed_at) return false;
    const key = leadgenDateKey(r.completed_at);
    return key >= weekStart && key <= weekEnd;
  });
}
