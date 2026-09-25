// Lead Generation CRM — per-agent Activity & Results KPI tracking (Calls,
// Emails Sent, Email Delivery Rate, Follow-Ups Completed). Deliberately its
// own file, not an extension of leadgen-performance.ts, which already owns
// the separate weekly Appointments Booked target (LEADGEN_WEEKLY_APPOINTMENT_TARGET,
// unchanged by this file) - this file adds the new call/email targets
// alongside it without touching that existing computation.
//
// Every count here is read from an existing table the CRM already
// maintains for other reasons - there is no new manual counter anywhere:
//   - Calls: leadgen_call_logs (agent_id, created_at) - one row per logged
//     call, already the CRM's Call Log feature.
//   - Emails Sent: leadgen_emails (sent_by, sent_at) - sent_at is set once,
//     at the moment Resend accepts the send (see sendLeadgenEmail in
//     leadgen-email.ts); a draft/never-sent row has sent_at = null and is
//     therefore never counted here.
//   - Delivered / Bounced / Failed: leadgen_emails.delivered_at/bounced_at/
//     failed_at - each is only ever set by the Resend webhook
//     (src/app/api/webhooks/resend/route.ts) once the corresponding
//     official event actually arrives. An email with none of the three set
//     yet (still in flight) is correctly excluded from all three counts
//     rather than guessed into "Failed".
//   - Follow-Ups Completed: leadgen_followups (agent_id, status,
//     completed_at) - the CRM's existing Follow-Up feature.
//
// "This week" and "today" use the same Monday-Friday, America/Toronto
// convention as the existing Appointments Booked target
// (leadgenDateKey/leadgenMondayOf, leadgen-performance.ts) so every KPI on
// the page resets at the same moment and never disagrees about what
// "today"/"this week" means.
import { addDays, leadgenDateKey, leadgenMondayOf } from "./leadgen-performance";

export const LEADGEN_DAILY_CALL_TARGET = 80;
export const LEADGEN_WEEKLY_CALL_TARGET = 400;
export const LEADGEN_DAILY_EMAIL_TARGET = 20;
export const LEADGEN_WEEKLY_EMAIL_TARGET = 100;

export type LeadgenKpiCallLogRow = {
  agent_id: string;
  created_at: string;
};

export type LeadgenKpiEmailRow = {
  sent_by: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  failed_at: string | null;
};

export type LeadgenKpiFollowUpRow = {
  agent_id: string | null;
  status: "pending" | "completed";
  completed_at: string | null;
};

export type LeadgenAgentActivityKpis = {
  agentId: string;
  weekStart: string; // YYYY-MM-DD, Monday
  weekEnd: string; // YYYY-MM-DD, Friday
  callsToday: number;
  callsRemainingToday: number;
  dailyCallProgressPct: number; // capped at 100 for display
  callsThisWeek: number;
  weeklyCallProgressPct: number;
  emailsToday: number;
  emailsRemainingToday: number;
  emailsThisWeek: number;
  weeklyEmailProgressPct: number;
  // Delivery rate/Delivered/Bounced/Failed are all scoped to this same
  // week's sent cohort, so every number in this section reads against one
  // consistent reporting window rather than mixing "today" and "all time".
  deliveredThisWeek: number;
  bouncedThisWeek: number;
  failedThisWeek: number;
  // null (not 0%) when nothing has been sent yet this week - a 0% delivery
  // rate would misleadingly read as "everything failed" rather than
  // "nothing sent yet".
  emailDeliveryRatePct: number | null;
  followUpsCompletedThisWeek: number;
};

function pctCapped(count: number, target: number): number {
  return target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
}

export function computeLeadgenAgentActivityKpis(
  callLogs: LeadgenKpiCallLogRow[],
  emails: LeadgenKpiEmailRow[],
  followUps: LeadgenKpiFollowUpRow[],
  agentId: string,
  now: Date = new Date()
): LeadgenAgentActivityKpis {
  const todayKey = leadgenDateKey(now);
  const weekStart = leadgenMondayOf(todayKey);
  const weekEnd = addDays(weekStart, 4);
  const inWeek = (key: string) => key >= weekStart && key <= weekEnd;

  const myCalls = callLogs.filter((c) => c.agent_id === agentId);
  const callsToday = myCalls.filter((c) => leadgenDateKey(c.created_at) === todayKey).length;
  const callsThisWeek = myCalls.filter((c) => inWeek(leadgenDateKey(c.created_at))).length;

  // "Do not count draft, cancelled, or unsent emails as sent" - filtering
  // on sent_at (set once, only at the moment of a real send) rather than
  // the mutable `status` column means a row that later moves to
  // delivered/opened/clicked/bounced/failed is still counted as sent
  // exactly once, and a draft that was never sent (sent_at still null) is
  // never counted at all.
  const mySentEmails = emails.filter((e) => e.sent_by === agentId && e.sent_at);
  const emailsToday = mySentEmails.filter((e) => leadgenDateKey(e.sent_at as string) === todayKey).length;
  const emailsThisWeekSent = mySentEmails.filter((e) => inWeek(leadgenDateKey(e.sent_at as string)));
  const emailsThisWeek = emailsThisWeekSent.length;

  const deliveredThisWeek = emailsThisWeekSent.filter((e) => e.delivered_at).length;
  const bouncedThisWeek = emailsThisWeekSent.filter((e) => e.bounced_at).length;
  const failedThisWeek = emailsThisWeekSent.filter((e) => e.failed_at).length;

  const followUpsCompletedThisWeek = followUps.filter(
    (f) => f.agent_id === agentId && f.status === "completed" && f.completed_at && inWeek(leadgenDateKey(f.completed_at))
  ).length;

  return {
    agentId,
    weekStart,
    weekEnd,
    callsToday,
    callsRemainingToday: Math.max(0, LEADGEN_DAILY_CALL_TARGET - callsToday),
    dailyCallProgressPct: pctCapped(callsToday, LEADGEN_DAILY_CALL_TARGET),
    callsThisWeek,
    weeklyCallProgressPct: pctCapped(callsThisWeek, LEADGEN_WEEKLY_CALL_TARGET),
    emailsToday,
    emailsRemainingToday: Math.max(0, LEADGEN_DAILY_EMAIL_TARGET - emailsToday),
    emailsThisWeek,
    weeklyEmailProgressPct: pctCapped(emailsThisWeek, LEADGEN_WEEKLY_EMAIL_TARGET),
    deliveredThisWeek,
    bouncedThisWeek,
    failedThisWeek,
    emailDeliveryRatePct: emailsThisWeek > 0 ? Math.round((deliveredThisWeek / emailsThisWeek) * 100) : null,
    followUpsCompletedThisWeek,
  };
}

export type LeadgenTeamActivityKpis = {
  agentCount: number;
  dailyCallGoal: number;
  weeklyCallGoal: number;
  dailyEmailGoal: number;
  weeklyEmailGoal: number;
  callsToday: number;
  callsThisWeek: number;
  emailsToday: number;
  emailsThisWeek: number;
  deliveredThisWeek: number;
  bouncedThisWeek: number;
  failedThisWeek: number;
  teamEmailDeliveryRatePct: number | null;
};

// Team totals are the sum of each agent's own already-computed snapshot -
// never a second independent pass over the raw rows - so a team total can
// never disagree with what its own agents' cards show elsewhere on the
// same page. The delivery rate is computed from the SUMMED delivered/sent
// counts across every agent, not by averaging each agent's own percentage,
// so one agent with a small sample size can never skew the team figure.
export function computeLeadgenTeamActivityKpis(perAgent: LeadgenAgentActivityKpis[]): LeadgenTeamActivityKpis {
  const agentCount = perAgent.length;
  const sum = (fn: (a: LeadgenAgentActivityKpis) => number) => perAgent.reduce((total, a) => total + fn(a), 0);

  const emailsThisWeek = sum((a) => a.emailsThisWeek);
  const deliveredThisWeek = sum((a) => a.deliveredThisWeek);

  return {
    agentCount,
    dailyCallGoal: agentCount * LEADGEN_DAILY_CALL_TARGET,
    weeklyCallGoal: agentCount * LEADGEN_WEEKLY_CALL_TARGET,
    dailyEmailGoal: agentCount * LEADGEN_DAILY_EMAIL_TARGET,
    weeklyEmailGoal: agentCount * LEADGEN_WEEKLY_EMAIL_TARGET,
    callsToday: sum((a) => a.callsToday),
    callsThisWeek: sum((a) => a.callsThisWeek),
    emailsToday: sum((a) => a.emailsToday),
    emailsThisWeek,
    deliveredThisWeek,
    bouncedThisWeek: sum((a) => a.bouncedThisWeek),
    failedThisWeek: sum((a) => a.failedThisWeek),
    teamEmailDeliveryRatePct: emailsThisWeek > 0 ? Math.round((deliveredThisWeek / emailsThisWeek) * 100) : null,
  };
}
