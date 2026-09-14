// Winsalot Sales Coach & Operations Manager: shared, pure, DB-agnostic types
// and deterministic business logic used by both the Growth CRM and the Lead
// Generation CRM. Deliberately mirrors the pattern already used by
// opportunity-finder.ts (shared scoring vocabulary) and leave-requests.ts
// (shared shape, per-CRM data) - the two CRMs have separate tables/RLS, but
// the "what should this card say" logic is identical, so it lives here once.
//
// This module reads already-computed data (Smart Opportunities scores,
// crm_followups/leadgen_followups, appointments + their existing reminder
// status, call logs, and each CRM's own weekly performance calculation) and
// turns it into short, English coaching copy. It never re-scores an
// opportunity, re-derives a reminder status, or invents a second weekly
// target - see growth-sales-coach.ts / leadgen-sales-coach.ts for where
// each CRM's existing systems are read and shaped into the types below.

export const SALES_COACH_TIME_ZONE = "America/Toronto";

export type SalesCoachRecordRef = {
  id: string;
  businessName: string;
  href: string;
};

export type SalesCoachOpportunityRef = SalesCoachRecordRef & {
  score: number;
  lastContactedAt: string | null;
};

export type SalesCoachFollowUpRef = SalesCoachRecordRef & {
  scheduledAt: string;
};

export type SalesCoachAppointmentRef = SalesCoachRecordRef & {
  startAt: string; // ISO instant
  reminderIssue: string | null;
};

export type SalesCoachCallLogStatus = {
  countToday: number;
  lastLoggedAt: string | null;
  // How many of today's logged calls resulted in a "Callback" outcome -
  // feeds the coaching note reminding the agent to attach a follow-up date
  // (section 20's "Coaching Integration" examples).
  callbackOutcomesToday: number;
};

export type SalesCoachWeeklyPerformance = {
  bookedThisWeek: number;
  target: number;
  remainingToTarget: number;
  weekLabel: string;
};

export type SalesCoachAction = {
  label: string;
  href: string;
};

// Whether the signed-in agent currently has an open attendance shift, and
// whether "now" is past when they were expected to have clocked in (per
// their admin-set scheduled_start_time, if any) - the two inputs the
// Green/Amber/Red status banner needs beyond ordinary CRM activity.
// Deliberately its own small type rather than folded into a boolean, since
// "not clocked in" and "not clocked in AND it's now a problem" are
// different questions (an agent due to start at 1pm isn't late at 9am).
export type SalesCoachAgentPresence = {
  isClockedIn: boolean;
  isPastExpectedClockIn: boolean;
};

export type SalesCoachAgentData = {
  agentId: string;
  agentName: string;
  presence: SalesCoachAgentPresence;
  hot: SalesCoachOpportunityRef[];
  warm: SalesCoachOpportunityRef[];
  // Warm opportunities with no contact recorded in the staleness window
  // (see STALE_OPPORTUNITY_DAYS below) - priority #10 in section 9.
  staleWarmOpportunities: SalesCoachOpportunityRef[];
  followUpsDueToday: SalesCoachFollowUpRef[];
  followUpsOverdue: SalesCoachFollowUpRef[];
  // "Interested" stage/status prospects with no pending follow-up and no
  // upcoming appointment already booked - i.e. genuinely waiting on the
  // agent, not merely tagged Interested.
  interestedNeedingAction: SalesCoachOpportunityRef[];
  appointmentsToday: SalesCoachAppointmentRef[];
  appointmentsTomorrow: SalesCoachAppointmentRef[];
  // Booked appointments (today, tomorrow, or otherwise inside a reminder's
  // eligibility window) whose reminder is "Not scheduled" or "Failed" -
  // never populated for a reminder that's Scheduled/Sent/Delivered.
  reminderIssues: SalesCoachAppointmentRef[];
  weeklyPerformance: SalesCoachWeeklyPerformance;
  callLog: SalesCoachCallLogStatus;
  // Deep links for "N Hot/Warm Opportunities" back into the existing Smart
  // Opportunities / Opportunity Finder experience - never a new list UI.
  hotHref: string;
  warmHref: string;
};

export type SalesCoachTeamAgentSummary = {
  agentId: string;
  agentName: string;
  presence: SalesCoachAgentPresence;
  hotCount: number;
  warmCount: number;
  followUpsOverdueCount: number;
  followUpsDueTodayCount: number;
  appointmentsTodayCount: number;
  appointmentsTomorrowCount: number;
  weeklyBooked: number;
  weeklyTarget: number;
  callLog: SalesCoachCallLogStatus;
  // Deep link into this one agent's own Opportunity Finder / performance
  // view (admin can filter by agent already - see opportunity-finder page's
  // own `agent` searchParam).
  agentHref: string;
};

export type SalesCoachTeamData = {
  agents: SalesCoachTeamAgentSummary[];
  teamHot: number;
  teamWarm: number;
  teamFollowUpsOverdue: number;
  teamFollowUpsDueToday: number;
  teamAppointmentsToday: SalesCoachAppointmentRef[];
  teamAppointmentsTomorrow: SalesCoachAppointmentRef[];
  teamReminderIssues: SalesCoachAppointmentRef[];
  teamWeeklyBooked: number;
  teamWeeklyTarget: number;
};

// A hot/warm opportunity with no recorded contact in this many days counts
// as "no recent activity" for the Sales Coach's own recommended-action
// language - the section 5 example is literally "no activity for 3 days".
// This is a separate, coarser signal from the scoring engine's own 30/60-day
// inactivity penalty (opportunity-finder.ts / migration 0151) - both read
// the same last_contacted_at column, they just answer different questions.
export const STALE_OPPORTUNITY_DAYS = 3;

export function isStaleContact(lastContactedAt: string | null, now: Date = new Date()): boolean {
  if (!lastContactedAt) return true;
  const ageMs = now.getTime() - new Date(lastContactedAt).getTime();
  return ageMs >= STALE_OPPORTUNITY_DAYS * 24 * 60 * 60 * 1000;
}

export function computeTeamWeeklyTarget(perAgentWeeklyTarget: number, activeAgentCount: number): number {
  return perAgentWeeklyTarget * activeAgentCount;
}

// A grace window after an agent's admin-set scheduled_start_time before
// "hasn't clocked in yet" becomes something the coach flags - a few minutes
// of normal variation shouldn't read as a problem the moment the clock
// ticks over. Separate from attendance-pay.ts's own SCHEDULED_SHIFT_MINUTES
// (that file measures lateness *within* an existing shift record for
// payroll; this measures "should they have a shift record open by now at
// all," which has no existing equivalent - see growth-sales-coach.ts's
// header comment).
export const LATE_CLOCK_IN_GRACE_MINUTES = 30;

// True once "now" is at least LATE_CLOCK_IN_GRACE_MINUTES past the agent's
// own scheduled_start_time ("HH:MM[:SS]", admin-set, crm_users/leadgen_users)
// today, in SALES_COACH_TIME_ZONE - false whenever no schedule is configured
// for that agent, since there's nothing to be late against.
export function isPastExpectedClockIn(scheduledStartTime: string | null, now: Date = new Date(), timeZone: string = SALES_COACH_TIME_ZONE): boolean {
  if (!scheduledStartTime) return false;
  const [hours, minutes] = scheduledStartTime.split(":").map(Number);
  const startOfDayMs = new Date(zonedStartOfDayIso(now, timeZone)).getTime();
  const expectedMs = startOfDayMs + (hours * 60 + minutes + LATE_CLOCK_IN_GRACE_MINUTES) * 60_000;
  return now.getTime() >= expectedMs;
}

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinClauses(clauses: string[]): string {
  if (clauses.length === 0) return "";
  if (clauses.length === 1) return clauses[0];
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
}

export function isSalesCoachWorkingDay(date: Date, timeZone: string = SALES_COACH_TIME_ZONE): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return weekday !== "Sat" && weekday !== "Sun";
}

function hourInTimeZone(date: Date, timeZone: string): number {
  const hourStr = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(date);
  return Number(hourStr) % 24;
}

// Midnight at the start of `now`'s calendar day in `timeZone`, as a UTC ISO
// instant - used to scope "calls logged today" queries. Same guess-and-
// correct technique as zonedWallTimeToUtcMs (leadgen-appointment-
// reminders.ts), reimplemented locally so this pure, unit-tested module
// doesn't have to import that file's much heavier (server-only, email/SMS-
// sending) module graph just for one small date calculation.
export function zonedStartOfDayIso(now: Date, timeZone: string = SALES_COACH_TIME_ZONE): string {
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [year, month, day] = dateKey.split("-").map(Number);
  const targetMs = Date.UTC(year, month - 1, day, 0, 0, 0);

  let guessMs = targetMs;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guessMs)).map((p) => [p.type, p.value]));
    const shownMs = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    const diff = shownMs - targetMs;
    if (diff === 0) break;
    guessMs -= diff;
  }
  return new Date(guessMs).toISOString();
}

// ---------------------------------------------------------------------------
// Agent-facing copy
// ---------------------------------------------------------------------------

export function buildAgentHeadline(data: SalesCoachAgentData): string {
  const clauses: string[] = [];
  if (data.hot.length > 0) {
    clauses.push(`${pluralize(data.hot.length, "Hot Opportunity", "Hot Opportunities")} requiring attention today`);
  }
  if (data.followUpsOverdue.length > 0) {
    clauses.push(pluralize(data.followUpsOverdue.length, "overdue follow-up/callback", "overdue follow-ups/callbacks"));
  } else if (data.followUpsDueToday.length > 0) {
    clauses.push(`${pluralize(data.followUpsDueToday.length, "follow-up/callback", "follow-ups/callbacks")} due today`);
  }
  if (data.appointmentsToday.length > 0) {
    clauses.push(`${pluralize(data.appointmentsToday.length, "appointment")} today`);
  } else if (data.appointmentsTomorrow.length > 0) {
    clauses.push(`${pluralize(data.appointmentsTomorrow.length, "appointment")} scheduled tomorrow`);
  }

  const first =
    clauses.length > 0
      ? `${data.agentName}, you have ${joinClauses(clauses)}.`
      : `${data.agentName}, nothing urgent is waiting on you right now.`;

  const booked = data.weeklyPerformance.bookedThisWeek;
  const second = `You have booked ${pluralize(booked, "appointment")} this week against your target of ${data.weeklyPerformance.target}.`;

  return `${first} ${second}`;
}

export function buildAgentCoachRecommendation(data: SalesCoachAgentData): string {
  const remaining = data.weeklyPerformance.remainingToTarget;

  if (data.followUpsOverdue.length > 0) {
    const n = data.followUpsOverdue.length;
    return `You have ${pluralize(n, "overdue follow-up/callback", "overdue follow-ups/callbacks")}. Complete ${n === 1 ? "it" : "those"} first — ${
      n === 1 ? "it is" : "they are"
    } more urgent than new prospecting.`;
  }

  if (data.hot.length > 0 && remaining > 0) {
    return `Follow up with your ${pluralize(data.hot.length, "Hot Opportunity", "Hot Opportunities")} first. You are only ${pluralize(
      remaining,
      "appointment"
    )} away from your weekly target.`;
  }

  if (remaining <= 0) {
    return "You have already reached your weekly appointment target. Continue working Hot and Warm Opportunities to build next week's pipeline.";
  }

  if (data.hot.length + data.warm.length === 0 && data.weeklyPerformance.bookedThisWeek === 0) {
    return "You have no appointments booked yet this week and no Hot or Warm Opportunities in your pipeline. Focus on new outreach and any overdue follow-ups.";
  }

  if (data.hot.length + data.warm.length > 0 && data.weeklyPerformance.bookedThisWeek === 0) {
    return "You have several opportunities but no appointments booked yet this week. Prioritize prospects showing interest and complete any overdue follow-ups.";
  }

  return "Keep working your pipeline — focus on your Hot and Warm Opportunities and any follow-ups due today.";
}

const MAX_RECOMMENDED_ACTIONS = 5;

// Recommended Actions, in the priority order from section 9: overdue
// callbacks/follow-ups first, then Hot Opportunities, appointments today,
// reminder problems, appointments tomorrow, follow-ups due today, interested
// prospects, weekly performance, and finally stale Warm Opportunities. Each
// slot deep-links to the one existing record it's about - never a new list
// UI - and the list stops at 5 entries.
export function buildAgentRecommendedActions(data: SalesCoachAgentData): SalesCoachAction[] {
  const actions: SalesCoachAction[] = [];
  const push = (label: string, href: string) => {
    if (actions.length < MAX_RECOMMENDED_ACTIONS) actions.push({ label, href });
  };

  if (data.followUpsOverdue.length > 0) {
    const item = data.followUpsOverdue[0];
    push(`Complete overdue follow-up — ${item.businessName}`, item.href);
  }
  if (data.hot.length > 0) {
    const item = data.hot[0];
    push(`Follow up with ${item.businessName} — Hot Opportunity`, item.href);
  }
  if (data.appointmentsToday.length > 0) {
    const item = data.appointmentsToday[0];
    push(`Prepare for today's appointment — ${item.businessName}`, item.href);
  }
  if (data.reminderIssues.length > 0) {
    const item = data.reminderIssues[0];
    push(`Review appointment reminder — ${item.businessName}`, item.href);
  }
  if (data.appointmentsTomorrow.length > 0) {
    const item = data.appointmentsTomorrow[0];
    push(`Review tomorrow's appointment — ${item.businessName}`, item.href);
  }
  if (data.followUpsDueToday.length > 0) {
    const item = data.followUpsDueToday[0];
    push(`Complete today's follow-up — ${item.businessName}`, item.href);
  }
  if (data.interestedNeedingAction.length > 0) {
    const item = data.interestedNeedingAction[0];
    push(`Contact interested prospect — ${item.businessName}`, item.href);
  }
  if (data.weeklyPerformance.remainingToTarget > 0) {
    push("Review your Hot Opportunities to reach this week's target", data.hotHref);
  }
  if (data.staleWarmOpportunities.length > 0) {
    const item = data.staleWarmOpportunities[0];
    push(`Review ${item.businessName} — no recent activity`, item.href);
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Daily Call Log coaching reminder (section 20)
// ---------------------------------------------------------------------------

export type CallLogReminderLevel = "reminder" | "active" | "strong";

export type CallLogReminderState = {
  level: CallLogReminderLevel;
  title: string;
  message: string;
};

// The hour (in SALES_COACH_TIME_ZONE) after which "no calls logged yet
// today" upgrades from the gentle morning reminder to the stronger
// mid-workday one - a deliberately simple, real-clock-driven signal rather
// than trying to infer "other CRM activity" from disparate tables.
const CALL_LOG_STRONG_REMINDER_HOUR = 11;

// Returns null outside Monday-Friday (section 20: "Apply the daily reminder
// Monday through Friday... reset at the beginning of the next working day"
// - a weekend has no working-day reminder to reset into).
export function buildCallLogReminder(
  callLog: SalesCoachCallLogStatus,
  now: Date = new Date(),
  timeZone: string = SALES_COACH_TIME_ZONE
): CallLogReminderState | null {
  if (!isSalesCoachWorkingDay(now, timeZone)) return null;

  if (callLog.countToday > 0) {
    return {
      level: "active",
      title: "Call Logging Active",
      message:
        "Your calls are being recorded. Keep logging each call outcome so your follow-ups, opportunities, and performance remain accurate.",
    };
  }

  if (hourInTimeZone(now, timeZone) >= CALL_LOG_STRONG_REMINDER_HOUR) {
    return {
      level: "strong",
      title: "Call Log Reminder",
      message:
        "You have not logged any calls yet today. Please record each call and outcome so your prospect history, follow-ups, and performance remain accurate.",
    };
  }

  return {
    level: "reminder",
    title: "Daily Coach Reminder",
    message:
      "Remember to log your calls today. Call Logs help Winsalot track prospect history, follow-ups, callbacks, and opportunities — accurate logging also helps the Sales Coach give you better recommendations.",
  };
}

// Section 20's "Coaching Integration" - a short, data-only line about
// today's logged calls, shown alongside (not instead of) the reminder above.
// Returns null when nothing has been logged yet, since there's nothing real
// to report.
export function buildCallLogCoachingNote(callLog: SalesCoachCallLogStatus): string | null {
  if (callLog.countToday === 0) return null;
  let note = `You have logged ${pluralize(callLog.countToday, "call")} today.`;
  if (callLog.callbackOutcomesToday > 0) {
    note +=
      callLog.callbackOutcomesToday === 1
        ? " One resulted in a callback — make sure it has a follow-up date."
        : ` ${callLog.callbackOutcomesToday} resulted in a callback — make sure those have follow-up dates.`;
  }
  return note;
}

export function describeAgentCallLogStatus(callLog: SalesCoachCallLogStatus, timeZone: string = SALES_COACH_TIME_ZONE): string {
  if (callLog.countToday > 0 && callLog.lastLoggedAt) {
    const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(callLog.lastLoggedAt));
    return `Call Logging Active — Last Call Logged: ${time}`;
  }
  return "No Calls Logged Today";
}

// ---------------------------------------------------------------------------
// Admin / team-facing copy
// ---------------------------------------------------------------------------

export function teamAgentsAheadOfTarget(data: SalesCoachTeamData): SalesCoachTeamAgentSummary[] {
  return data.agents.filter((agent) => agent.weeklyBooked >= agent.weeklyTarget);
}

export function teamAgentsBehindTarget(data: SalesCoachTeamData): SalesCoachTeamAgentSummary[] {
  return data.agents.filter((agent) => agent.weeklyBooked < agent.weeklyTarget);
}

export function teamAgentMainPriority(agent: SalesCoachTeamAgentSummary): string {
  if (agent.followUpsOverdueCount > 0) {
    return `${pluralize(agent.followUpsOverdueCount, "overdue follow-up/callback", "overdue follow-ups/callbacks")}`;
  }
  if (agent.hotCount > 0) {
    return `${pluralize(agent.hotCount, "Hot Opportunity", "Hot Opportunities")} to follow up`;
  }
  if (agent.appointmentsTodayCount > 0) {
    return `${pluralize(agent.appointmentsTodayCount, "appointment")} today`;
  }
  if (agent.followUpsDueTodayCount > 0) {
    return `${pluralize(agent.followUpsDueTodayCount, "follow-up/callback")} due today`;
  }
  if (agent.weeklyBooked < agent.weeklyTarget) {
    const remaining = agent.weeklyTarget - agent.weeklyBooked;
    return `${pluralize(remaining, "appointment")} needed to hit weekly target`;
  }
  return "On track — building next week's pipeline";
}

export function buildTeamHeadline(data: SalesCoachTeamData): string {
  const sentences: string[] = [];
  const byHot = [...data.agents].filter((agent) => agent.hotCount > 0).sort((a, b) => b.hotCount - a.hotCount);
  const byOverdue = [...data.agents].filter((agent) => agent.followUpsOverdueCount > 0).sort((a, b) => b.followUpsOverdueCount - a.followUpsOverdueCount);

  if (byHot[0]) {
    sentences.push(`${byHot[0].agentName} has ${pluralize(byHot[0].hotCount, "Hot Opportunity", "Hot Opportunities")} requiring follow-up today.`);
  }
  const overdueAgent = byOverdue.find((agent) => agent.agentId !== byHot[0]?.agentId) ?? byOverdue[0];
  if (overdueAgent) {
    sentences.push(`${overdueAgent.agentName} has ${pluralize(overdueAgent.followUpsOverdueCount, "overdue follow-up/callback", "overdue follow-ups/callbacks")}.`);
  }
  if (data.teamReminderIssues.length > 0) {
    sentences.push(
      data.teamReminderIssues.length === 1
        ? "One appointment reminder requires attention."
        : `${data.teamReminderIssues.length} appointment reminders require attention.`
    );
  }
  sentences.push(`The team has booked ${pluralize(data.teamWeeklyBooked, "appointment")} this week against a target of ${data.teamWeeklyTarget}.`);

  if (sentences.length === 1) {
    return `No agent has an urgent Hot Opportunity or overdue follow-up right now. ${sentences[0]}`;
  }
  return sentences.join(" ");
}

export function buildTeamOperationsPriority(data: SalesCoachTeamData): string {
  if (data.teamFollowUpsOverdue > 0 && data.teamHot > 0) {
    return "Clear overdue follow-ups and callbacks, then focus on Hot Opportunities before increasing new outreach.";
  }
  if (data.teamFollowUpsOverdue > 0) {
    return "Clear overdue follow-ups and callbacks across the team before starting new outreach.";
  }
  if (data.teamHot > 0) {
    return "Focus the team on Hot Opportunities requiring follow-up today.";
  }
  if (data.teamReminderIssues.length > 0) {
    return "Resolve appointment reminder issues before the next scheduled appointments.";
  }
  if (data.teamWeeklyBooked < data.teamWeeklyTarget) {
    return "The team is behind its weekly appointment target — prioritize booking over new prospecting.";
  }
  return "The team is on track. Continue working Hot and Warm Opportunities to build next week's pipeline.";
}

export function buildTeamRecommendedActions(data: SalesCoachTeamData, opts: { performanceHref: string }): SalesCoachAction[] {
  const actions: SalesCoachAction[] = [];
  const push = (label: string, href: string) => {
    if (actions.length < MAX_RECOMMENDED_ACTIONS) actions.push({ label, href });
  };

  const byOverdue = [...data.agents].filter((agent) => agent.followUpsOverdueCount > 0).sort((a, b) => b.followUpsOverdueCount - a.followUpsOverdueCount);
  if (byOverdue[0]) push(`Review overdue follow-ups — ${byOverdue[0].agentName}`, byOverdue[0].agentHref);

  const byHot = [...data.agents].filter((agent) => agent.hotCount > 0).sort((a, b) => b.hotCount - a.hotCount);
  if (byHot[0]) push(`Review Hot Opportunities — ${byHot[0].agentName}`, byHot[0].agentHref);

  if (data.teamReminderIssues[0]) {
    push(`Review appointment reminder — ${data.teamReminderIssues[0].businessName}`, data.teamReminderIssues[0].href);
  }
  if (data.teamAppointmentsToday[0]) {
    push(`Review today's appointment — ${data.teamAppointmentsToday[0].businessName}`, data.teamAppointmentsToday[0].href);
  }

  const behind = teamAgentsBehindTarget(data);
  if (behind.length > 0) {
    push(
      behind.length === 1 ? `Review weekly performance — ${behind[0].agentName}` : `Review weekly performance — ${behind.length} agents behind target`,
      opts.performanceHref
    );
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Main Dashboard colour-coded status banner (section 21)
// ---------------------------------------------------------------------------

export type SalesCoachStatusLevel = "green" | "amber" | "red";

export const SALES_COACH_STATUS_LABEL: Record<SalesCoachStatusLevel, string> = {
  green: "On Track",
  amber: "Attention Needed",
  red: "Immediate Attention Required",
};

// Two or more overdue follow-ups/callbacks is "multiple" per the banner's
// own Red example ("Multiple callbacks or follow-ups are overdue") - one
// overdue item stays Amber ("becoming overdue").
const MULTIPLE_OVERDUE_THRESHOLD = 2;

function hasFailedReminder(reminderIssues: SalesCoachAppointmentRef[]): boolean {
  return reminderIssues.some((item) => item.reminderIssue?.toLowerCase().includes("failed"));
}

// Highest-severity status this agent's real CRM activity supports right
// now, in the order the banner's own spec lists its Red/Amber examples:
// missed clock-in first (a working-hours problem, not a pipeline one),
// then multiple overdue items, then a failed reminder, then "clocked in
// but quiet" (which itself escalates from Amber to Red once the call-log
// reminder has already escalated to "strong" - see buildCallLogReminder),
// then the single-item/behind-target Amber cases.
export function computeAgentStatusLevel(data: SalesCoachAgentData, now: Date = new Date()): SalesCoachStatusLevel {
  const workingDay = isSalesCoachWorkingDay(now, SALES_COACH_TIME_ZONE);

  if (workingDay && data.presence.isPastExpectedClockIn && !data.presence.isClockedIn) return "red";
  if (data.followUpsOverdue.length >= MULTIPLE_OVERDUE_THRESHOLD) return "red";
  if (hasFailedReminder(data.reminderIssues)) return "red";

  if (workingDay && data.presence.isClockedIn && data.callLog.countToday === 0) {
    const reminder = buildCallLogReminder(data.callLog, now);
    return reminder?.level === "strong" ? "red" : "amber";
  }

  if (data.followUpsOverdue.length > 0) return "amber";
  if (data.reminderIssues.length > 0) return "amber";
  if (data.weeklyPerformance.remainingToTarget > 0) return "amber";

  return "green";
}

// The banner's own short coaching message - kept separate from
// buildAgentCoachRecommendation (used as the banner's "main issue or
// priority" line) so the two never repeat each other verbatim.
export function buildAgentStatusMessage(data: SalesCoachAgentData, level: SalesCoachStatusLevel, now: Date = new Date()): string {
  const workingDay = isSalesCoachWorkingDay(now, SALES_COACH_TIME_ZONE);

  if (level === "red") {
    if (workingDay && data.presence.isPastExpectedClockIn && !data.presence.isClockedIn) {
      return "You have not clocked in during your expected working hours. Please clock in, or let your admin know if your schedule has changed.";
    }
    if (data.followUpsOverdue.length >= MULTIPLE_OVERDUE_THRESHOLD) {
      return `You have ${data.followUpsOverdue.length} overdue follow-ups/callbacks. Please complete these before starting any new outreach.`;
    }
    if (hasFailedReminder(data.reminderIssues)) {
      return "An appointment reminder failed to send. Please review it now so your prospect isn't missed.";
    }
    return "You are logged in with activity today, but no calls have been logged. Please use Call Logs so your follow-ups, opportunities, and performance tracking remain accurate.";
  }

  if (level === "amber") {
    if (data.presence.isClockedIn && data.callLog.countToday === 0) {
      return "You are logged in today, but no calls have been logged yet. Please use Call Logs so your follow-ups, opportunities, and performance tracking remain accurate.";
    }
    if (data.followUpsOverdue.length > 0) {
      return "You have an overdue follow-up/callback. Complete it soon before it affects your prospect's experience.";
    }
    if (data.reminderIssues.length > 0) {
      return "An upcoming appointment reminder needs attention before it's due.";
    }
    return "You are behind your weekly appointment target, but there is still time this week to catch up.";
  }

  return "You're on track — Call Logs are active, there are no major overdue items, and your weekly performance is on pace.";
}

// Same severity ladder as computeAgentStatusLevel, applied across the team:
// any agent missing their expected clock-in, or with multiple overdue items,
// or a failed reminder, is Red for the whole team; two or more agents with
// no Call Logs yet today is treated the same as one agent's own escalation
// to Red (a pattern across the team, not just one person having a slow
// morning); anything else that would make an individual agent Amber makes
// the team Amber too.
export function computeTeamStatusLevel(data: SalesCoachTeamData, now: Date = new Date()): SalesCoachStatusLevel {
  const workingDay = isSalesCoachWorkingDay(now, SALES_COACH_TIME_ZONE);

  const missedClockIn = data.agents.some((agent) => workingDay && agent.presence.isPastExpectedClockIn && !agent.presence.isClockedIn);
  if (missedClockIn) return "red";
  if (data.agents.some((agent) => agent.followUpsOverdueCount >= MULTIPLE_OVERDUE_THRESHOLD)) return "red";
  if (hasFailedReminder(data.teamReminderIssues)) return "red";

  const noCallsYet = workingDay ? data.agents.filter((agent) => agent.presence.isClockedIn && agent.callLog.countToday === 0) : [];
  if (noCallsYet.length >= MULTIPLE_OVERDUE_THRESHOLD) return "red";
  if (noCallsYet.length === 1) return "amber";

  if (data.teamFollowUpsOverdue > 0) return "amber";
  if (data.teamReminderIssues.length > 0) return "amber";
  if (data.teamWeeklyBooked < data.teamWeeklyTarget) return "amber";

  return "green";
}

export function buildTeamStatusMessage(data: SalesCoachTeamData, level: SalesCoachStatusLevel, now: Date = new Date()): string {
  const workingDay = isSalesCoachWorkingDay(now, SALES_COACH_TIME_ZONE);
  const missedClockIn = data.agents.filter((agent) => workingDay && agent.presence.isPastExpectedClockIn && !agent.presence.isClockedIn);
  if (level === "red" && missedClockIn.length > 0) {
    const names = missedClockIn.map((agent) => agent.agentName);
    return `${joinClauses(names)} ${missedClockIn.length === 1 ? "has" : "have"} not clocked in during expected working hours.`;
  }

  const clauses: string[] = [];
  const noCallsYet = workingDay ? data.agents.filter((agent) => agent.callLog.countToday === 0) : [];
  if (noCallsYet[0]) clauses.push(`${noCallsYet[0].agentName} has no Call Logs today`);

  const byOverdue = [...data.agents].filter((agent) => agent.followUpsOverdueCount > 0).sort((a, b) => b.followUpsOverdueCount - a.followUpsOverdueCount);
  if (byOverdue[0] && byOverdue[0].agentName !== noCallsYet[0]?.agentName) {
    clauses.push(`${byOverdue[0].agentName} has ${pluralize(byOverdue[0].followUpsOverdueCount, "overdue follow-up/callback", "overdue follow-ups/callbacks")}`);
  }

  clauses.push(`The team is at ${data.teamWeeklyBooked} of ${data.teamWeeklyTarget} appointments this week.`);

  if (level === "green") return `The team is on track. ${clauses[clauses.length - 1]}`;
  return clauses.join(" ");
}
