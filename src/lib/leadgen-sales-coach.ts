import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLeadgenAppointmentCountable, isLeadgenNextFollowUpDueToday, isLeadgenNextFollowUpOverdue, type LeadgenUserRow } from "./leadgen-types";
import { opportunityPriorityLevel, type LeadgenOpportunityScoreRow } from "./opportunity-finder";
import { fetchLeadgenAppointmentReminderStatusMap, zonedWallTimeToUtcMs } from "./leadgen-appointment-reminders";
import type { LeadgenAppointmentReminderStatusEntry, LeadgenLeadStatus } from "./leadgen-types";
import {
  LEADGEN_WEEKLY_APPOINTMENT_TARGET,
  addDays as leadgenAddDays,
  computeLeadgenAgentPerformance,
  leadgenDateKey,
  leadgenWeekRangeLabel,
  type LeadgenPerformanceAppointment,
} from "./leadgen-performance";
import {
  computeTeamWeeklyTarget,
  isStaleContact,
  zonedStartOfDayIso,
  type SalesCoachAgentData,
  type SalesCoachAppointmentRef,
  type SalesCoachCallLogStatus,
  type SalesCoachFollowUpRef,
  type SalesCoachOpportunityRef,
  type SalesCoachTeamAgentSummary,
  type SalesCoachTeamData,
} from "./sales-coach";

// Lead Generation CRM adapter for the Winsalot Sales Coach & Operations
// Manager - mirrors growth-sales-coach.ts, reading leadgen_opportunity_scores,
// the lead's own (app-kept-in-sync) next_follow_up_at, leadgen_appointments
// (+ their existing reminder status), leadgen_call_logs, and the existing
// weekly performance calculation (leadgen-performance.ts). Adds no new
// scoring, follow-up, reminder, or performance logic of its own.

const LEADGEN_REMINDER_TIME_ZONE = "America/Toronto";

type LeadgenScoredLead = LeadgenOpportunityScoreRow & {
  leadgen_leads: {
    id: string;
    business_name: string;
    assigned_agent_id: string | null;
    last_contacted_at: string | null;
    status: LeadgenLeadStatus;
    next_follow_up_at: string | null;
  } | null;
};

// `client` is either the signed-in session client (RLS already scopes an
// agent caller to their own leads - leadgen_opportunity_scores_agent_select_
// own) or the service-role client (admin's Team Overview, every agent's
// rows in one call, same as loadLeadgenAdminOpportunityFinderData).
async function fetchScoredLeads(client: SupabaseClient): Promise<LeadgenScoredLead[]> {
  const { data } = await client
    .from("leadgen_opportunity_scores")
    .select("*, leadgen_leads(id, business_name, assigned_agent_id, last_contacted_at, status, next_follow_up_at)")
    .eq("finder_state", "active")
    .order("score", { ascending: false });
  return ((data ?? []) as unknown as LeadgenScoredLead[]).filter((row) => row.leadgen_leads !== null);
}

function toOpportunityRef(row: LeadgenScoredLead, hrefBase: string): SalesCoachOpportunityRef {
  const lead = row.leadgen_leads!;
  return {
    id: lead.id,
    businessName: lead.business_name,
    href: `${hrefBase}/${lead.id}`,
    score: row.score,
    lastContactedAt: lead.last_contacted_at,
  };
}

function toFollowUpRef(row: LeadgenScoredLead, hrefBase: string): SalesCoachFollowUpRef {
  const lead = row.leadgen_leads!;
  return {
    id: lead.id,
    businessName: lead.business_name,
    href: `${hrefBase}/${lead.id}`,
    scheduledAt: lead.next_follow_up_at!,
  };
}

// A reminder is only ever flagged once its own eligibility window has
// opened and its status is "Not scheduled" or "Failed" - never for a
// healthy Scheduled/Sent/Delivered reminder (section 7).
function describeReminderIssue(
  entry: LeadgenAppointmentReminderStatusEntry | undefined,
  appointmentDate: string,
  appointmentTime: string,
  timeZone: string,
  now: Date
): string | null {
  if (!entry) return null;
  const startMs = zonedWallTimeToUtcMs(appointmentDate, appointmentTime, timeZone);
  const hoursUntil = (startMs - now.getTime()) / (60 * 60 * 1000);
  if (hoursUntil <= 0) return null;
  if (entry.status24h === "Failed") return "24-hour reminder failed to send";
  if (hoursUntil <= 24 && entry.status24h === "Not scheduled") return "24-hour reminder is not scheduled";
  if (entry.status1h === "Failed") return "1-hour reminder failed to send";
  if (hoursUntil <= 1 && entry.status1h === "Not scheduled") return "1-hour reminder is not scheduled";
  return null;
}

const emptyCallLogStatus: SalesCoachCallLogStatus = { countToday: 0, lastLoggedAt: null, callbackOutcomesToday: 0 };

async function fetchCallLogStatus(client: SupabaseClient, agentId: string, now: Date): Promise<SalesCoachCallLogStatus> {
  const { data } = await client
    .from("leadgen_call_logs")
    .select("created_at, outcome")
    .eq("agent_id", agentId)
    .gte("created_at", zonedStartOfDayIso(now))
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  return {
    countToday: rows.length,
    lastLoggedAt: rows[0]?.created_at ?? null,
    callbackOutcomesToday: rows.filter((row) => row.outcome === "Callback").length,
  };
}

async function fetchTeamCallLogStatus(admin: SupabaseClient, agentIds: string[], now: Date): Promise<Map<string, SalesCoachCallLogStatus>> {
  const map = new Map<string, SalesCoachCallLogStatus>();
  if (agentIds.length === 0) return map;
  const { data } = await admin
    .from("leadgen_call_logs")
    .select("agent_id, created_at, outcome")
    .in("agent_id", agentIds)
    .gte("created_at", zonedStartOfDayIso(now));
  for (const row of data ?? []) {
    const status = map.get(row.agent_id) ?? { countToday: 0, lastLoggedAt: null, callbackOutcomesToday: 0 };
    status.countToday += 1;
    if (!status.lastLoggedAt || row.created_at > status.lastLoggedAt) status.lastLoggedAt = row.created_at;
    if (row.outcome === "Callback") status.callbackOutcomesToday += 1;
    map.set(row.agent_id, status);
  }
  for (const id of agentIds) if (!map.has(id)) map.set(id, { ...emptyCallLogStatus });
  return map;
}

export type LeadgenAgentCoachSourceData = {
  agentId: string;
  agentName: string;
  supabase: SupabaseClient;
  now: Date;
  appointments: LeadgenPerformanceAppointment[]; // this agent's own credited appointments (already loaded on the page)
};

export async function loadLeadgenAgentSalesCoachData(input: LeadgenAgentCoachSourceData): Promise<SalesCoachAgentData> {
  const { agentId, agentName, supabase, now, appointments } = input;
  const hrefBase = "/leadgen/agent/leads";

  const scoredLeads = await fetchScoredLeads(supabase);
  const hot: SalesCoachOpportunityRef[] = [];
  const warm: SalesCoachOpportunityRef[] = [];
  for (const row of scoredLeads) {
    const ref = toOpportunityRef(row, hrefBase);
    const level = opportunityPriorityLevel(row.score);
    if (level === "hot") hot.push(ref);
    else if (level === "warm") warm.push(ref);
  }
  const staleWarmOpportunities = warm.filter((opp) => isStaleContact(opp.lastContactedAt, now));

  const interestedNeedingAction = scoredLeads
    .filter((row) => row.leadgen_leads!.status === "Interested" && !row.leadgen_leads!.next_follow_up_at)
    .map((row) => toOpportunityRef(row, hrefBase));

  const followUpsOverdue = scoredLeads
    .filter((row) => isLeadgenNextFollowUpOverdue(row.leadgen_leads!.next_follow_up_at))
    .map((row) => toFollowUpRef(row, hrefBase));
  const followUpsDueToday = scoredLeads
    .filter((row) => isLeadgenNextFollowUpDueToday(row.leadgen_leads!.next_follow_up_at))
    .map((row) => toFollowUpRef(row, hrefBase));

  const todayKey = leadgenDateKey(now);
  const tomorrowKey = leadgenAddDays(todayKey, 1);
  const countable = appointments.filter((a) => isLeadgenAppointmentCountable(a.status));
  const apptsToday = countable.filter((a) => a.appointment_date === todayKey);
  const apptsTomorrow = countable.filter((a) => a.appointment_date === tomorrowKey);
  const reminderMap = await fetchLeadgenAppointmentReminderStatusMap(
    supabase,
    [...apptsToday, ...apptsTomorrow].map((a) => ({ ...a, timezone: LEADGEN_REMINDER_TIME_ZONE }))
  );
  const toApptRef = (a: LeadgenPerformanceAppointment): SalesCoachAppointmentRef => ({
    id: a.id,
    businessName: a.business_name,
    href: `${hrefBase}/${a.id}`,
    startAt: `${a.appointment_date}T${a.appointment_time}`,
    reminderIssue: describeReminderIssue(reminderMap[a.id], a.appointment_date, a.appointment_time, LEADGEN_REMINDER_TIME_ZONE, now),
  });
  const appointmentsToday = apptsToday.map(toApptRef);
  const appointmentsTomorrow = apptsTomorrow.map(toApptRef);
  const reminderIssues = [...appointmentsToday, ...appointmentsTomorrow].filter((a) => a.reminderIssue !== null);

  const callLog = await fetchCallLogStatus(supabase, agentId, now);

  const performance = computeLeadgenAgentPerformance(appointments, agentId, now);
  return {
    agentId,
    agentName,
    hot,
    warm,
    staleWarmOpportunities,
    followUpsDueToday,
    followUpsOverdue,
    interestedNeedingAction,
    appointmentsToday,
    appointmentsTomorrow,
    reminderIssues,
    weeklyPerformance: {
      bookedThisWeek: performance.bookedThisWeek,
      target: performance.target,
      remainingToTarget: performance.remainingToTarget,
      weekLabel: leadgenWeekRangeLabel(performance.weekStart, performance.weekEnd),
    },
    callLog,
    hotHref: "/leadgen/agent/my-opportunities?category=hot",
    warmHref: "/leadgen/agent/my-opportunities?category=warm",
  };
}

export type LeadgenTeamCoachSourceData = {
  admin: SupabaseClient; // service-role client
  activeAgents: Pick<LeadgenUserRow, "id" | "full_name">[];
  now: Date;
  appointments: LeadgenPerformanceAppointment[]; // every appointment (admin already loads this)
};

export async function loadLeadgenTeamSalesCoachData(input: LeadgenTeamCoachSourceData): Promise<SalesCoachTeamData> {
  const { admin, activeAgents, now, appointments } = input;
  const hrefBase = "/leadgen/admin/leads";

  const scoredLeads = await fetchScoredLeads(admin);
  const todayKey = leadgenDateKey(now);
  const tomorrowKey = leadgenAddDays(todayKey, 1);
  const countable = appointments.filter((a) => isLeadgenAppointmentCountable(a.status));
  const apptsToday = countable.filter((a) => a.appointment_date === todayKey);
  const apptsTomorrow = countable.filter((a) => a.appointment_date === tomorrowKey);
  const reminderMap = await fetchLeadgenAppointmentReminderStatusMap(
    admin,
    [...apptsToday, ...apptsTomorrow].map((a) => ({ ...a, timezone: LEADGEN_REMINDER_TIME_ZONE }))
  );
  const toApptRef = (a: LeadgenPerformanceAppointment): SalesCoachAppointmentRef => ({
    id: a.id,
    businessName: a.business_name,
    href: `${hrefBase}/${a.id}`,
    startAt: `${a.appointment_date}T${a.appointment_time}`,
    reminderIssue: describeReminderIssue(reminderMap[a.id], a.appointment_date, a.appointment_time, LEADGEN_REMINDER_TIME_ZONE, now),
  });
  const teamAppointmentsToday = apptsToday.map(toApptRef);
  const teamAppointmentsTomorrow = apptsTomorrow.map(toApptRef);
  const teamReminderIssues = [...teamAppointmentsToday, ...teamAppointmentsTomorrow].filter((a) => a.reminderIssue !== null);

  const callLogMap = await fetchTeamCallLogStatus(
    admin,
    activeAgents.map((a) => a.id),
    now
  );

  const agents: SalesCoachTeamAgentSummary[] = activeAgents.map((agent) => {
    const agentScored = scoredLeads.filter((row) => row.leadgen_leads!.assigned_agent_id === agent.id);
    const hotCount = agentScored.filter((row) => opportunityPriorityLevel(row.score) === "hot").length;
    const warmCount = agentScored.filter((row) => opportunityPriorityLevel(row.score) === "warm").length;
    const performance = computeLeadgenAgentPerformance(appointments, agent.id, now);
    return {
      agentId: agent.id,
      agentName: agent.full_name,
      hotCount,
      warmCount,
      followUpsOverdueCount: agentScored.filter((row) => isLeadgenNextFollowUpOverdue(row.leadgen_leads!.next_follow_up_at)).length,
      followUpsDueTodayCount: agentScored.filter((row) => isLeadgenNextFollowUpDueToday(row.leadgen_leads!.next_follow_up_at)).length,
      appointmentsTodayCount: apptsToday.filter((a) => a.booking_agent_id === agent.id).length,
      appointmentsTomorrowCount: apptsTomorrow.filter((a) => a.booking_agent_id === agent.id).length,
      weeklyBooked: performance.bookedThisWeek,
      weeklyTarget: performance.target,
      callLog: callLogMap.get(agent.id) ?? { ...emptyCallLogStatus },
      agentHref: `/leadgen/admin/opportunity-finder?agent=${agent.id}`,
    };
  });

  return {
    agents,
    teamHot: agents.reduce((sum, a) => sum + a.hotCount, 0),
    teamWarm: agents.reduce((sum, a) => sum + a.warmCount, 0),
    teamFollowUpsOverdue: agents.reduce((sum, a) => sum + a.followUpsOverdueCount, 0),
    teamFollowUpsDueToday: agents.reduce((sum, a) => sum + a.followUpsDueTodayCount, 0),
    teamAppointmentsToday,
    teamAppointmentsTomorrow,
    teamReminderIssues,
    teamWeeklyBooked: agents.reduce((sum, a) => sum + a.weeklyBooked, 0),
    teamWeeklyTarget: computeTeamWeeklyTarget(LEADGEN_WEEKLY_APPOINTMENT_TARGET, activeAgents.length),
  };
}
