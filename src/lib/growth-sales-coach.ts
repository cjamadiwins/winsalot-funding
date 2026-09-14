import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDueToday, isOverdue, type CrmUserRow, type OpportunityStage } from "./crm-types";
import { opportunityPriorityLevel, type CrmOpportunityScoreRow } from "./opportunity-finder";
import { fetchWinsalotReminderStatusMap, type WinsalotReminderStatusEntry } from "./winsalot-consultation-reminders";
import type { ConsultationCardRecord } from "./winsalot-consultation-data";
import {
  CRM_WEEKLY_CONSULTATIONS_TARGET,
  addDays as crmAddDays,
  computeCrmAgentPerformance,
  crmWeeklyRangeLabel,
  type CrmAgentPerformance,
  type CrmPerformanceOpportunityRecord,
} from "./crm-performance";
import {
  SALES_COACH_TIME_ZONE,
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

// Growth CRM adapter for the Winsalot Sales Coach & Operations Manager -
// reads the existing Smart Opportunities scores, the opportunity's own
// (trigger-derived) next_follow_up_at, booked winsalot_appointments (+
// their existing reminder status), crm_call_logs, and the existing weekly
// performance calculation (crm-performance.ts), and shapes them into the
// CRM-agnostic types in sales-coach.ts. Adds no new scoring, follow-up,
// reminder, or performance logic of its own.

// One crm_opportunity_scores row joined to the handful of crm_opportunities
// columns this feature needs - the same "*, crm_opportunities(...)" join
// pattern already used by agent-my-opportunities-data.ts and
// admin-opportunity-finder-data.ts, as its own lightweight query here
// (rather than reusing those two files' differently-shaped exported row
// types) since this module is read by four different dashboard pages with
// four different fetch contexts. next_follow_up_at is the same
// trigger-derived "earliest pending callback" column isOverdue()/isDueToday()
// already read elsewhere (see crm-types.ts) - there's no separate
// crm_followups fetch here, so a callback and its parent opportunity's due/
// overdue status can never disagree with what the rest of the CRM shows.
type GrowthScoredOpportunity = CrmOpportunityScoreRow & {
  crm_opportunities: {
    id: string;
    business_name: string;
    assigned_agent_id: string | null;
    last_contacted_at: string | null;
    stage: OpportunityStage;
    next_follow_up_at: string | null;
  } | null;
};

// `client` is either the signed-in session client (RLS already scopes an
// agent caller to their own opportunities - crm_opportunity_scores_agent_
// select_own) or the service-role client (admin's Team Overview, which
// needs every agent's rows in one call, same as loadAdminOpportunityFinderData).
async function fetchScoredOpportunities(client: SupabaseClient): Promise<GrowthScoredOpportunity[]> {
  const { data } = await client
    .from("crm_opportunity_scores")
    .select("*, crm_opportunities(id, business_name, assigned_agent_id, last_contacted_at, stage, next_follow_up_at)")
    .eq("finder_state", "active")
    .order("score", { ascending: false });
  return ((data ?? []) as unknown as GrowthScoredOpportunity[]).filter((row) => row.crm_opportunities !== null);
}

function toOpportunityRef(row: GrowthScoredOpportunity, hrefBase: string): SalesCoachOpportunityRef {
  const opp = row.crm_opportunities!;
  return {
    id: opp.id,
    businessName: opp.business_name,
    href: `${hrefBase}/${opp.id}`,
    score: row.score,
    lastContactedAt: opp.last_contacted_at,
  };
}

function toFollowUpRef(row: GrowthScoredOpportunity, hrefBase: string): SalesCoachFollowUpRef {
  const opp = row.crm_opportunities!;
  return {
    id: opp.id,
    businessName: opp.business_name,
    href: `${hrefBase}/${opp.id}`,
    scheduledAt: opp.next_follow_up_at!,
  };
}

function dateKeyIn(date: Date, timeZone: string = SALES_COACH_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// A reminder is only ever flagged once its own eligibility window has
// opened (mirrors fetchWinsalotReminderStatusMap's own isEligible check) and
// its status is "Not scheduled" or "Failed" - never for a healthy Scheduled/
// Sent/Delivered reminder (section 7: "Do not report reminder problems when
// reminders are functioning correctly").
function describeReminderIssue(entry: WinsalotReminderStatusEntry | undefined, appointmentStartAt: string, now: Date): string | null {
  if (!entry) return null;
  const hoursUntil = (new Date(appointmentStartAt).getTime() - now.getTime()) / (60 * 60 * 1000);
  if (hoursUntil <= 0) return null;
  if (entry.reminder24h === "Failed") return "24-hour reminder failed to send";
  if (hoursUntil <= 24 && entry.reminder24h === "Not scheduled") return "24-hour reminder is not scheduled";
  if (entry.reminder1h === "Failed") return "1-hour reminder failed to send";
  if (hoursUntil <= 1 && entry.reminder1h === "Not scheduled") return "1-hour reminder is not scheduled";
  return null;
}

const emptyCallLogStatus: SalesCoachCallLogStatus = { countToday: 0, lastLoggedAt: null, callbackOutcomesToday: 0 };

async function fetchCallLogStatus(client: SupabaseClient, agentId: string, now: Date): Promise<SalesCoachCallLogStatus> {
  const { data } = await client
    .from("crm_call_logs")
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

// Batch version for the admin Team Overview - one query covers every active
// agent's call logs today instead of one round trip per agent.
async function fetchTeamCallLogStatus(admin: SupabaseClient, agentIds: string[], now: Date): Promise<Map<string, SalesCoachCallLogStatus>> {
  const map = new Map<string, SalesCoachCallLogStatus>();
  if (agentIds.length === 0) return map;
  const { data } = await admin
    .from("crm_call_logs")
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

export type GrowthAgentCoachSourceData = {
  agentId: string;
  agentName: string;
  supabase: SupabaseClient;
  now: Date;
  consultations: ConsultationCardRecord[]; // this agent's own booked appointments (already loaded on the page)
  performance: CrmAgentPerformance; // computeCrmAgentPerformance(...) result, already computed on the page
};

export async function loadGrowthAgentSalesCoachData(input: GrowthAgentCoachSourceData): Promise<SalesCoachAgentData> {
  const { agentId, agentName, supabase, now, consultations, performance } = input;
  const hrefBase = "/agent/opportunities";

  const scoredOpportunities = await fetchScoredOpportunities(supabase);
  const hot: SalesCoachOpportunityRef[] = [];
  const warm: SalesCoachOpportunityRef[] = [];
  for (const row of scoredOpportunities) {
    const ref = toOpportunityRef(row, hrefBase);
    const level = opportunityPriorityLevel(row.score);
    if (level === "hot") hot.push(ref);
    else if (level === "warm") warm.push(ref);
  }
  const staleWarmOpportunities = warm.filter((opp) => isStaleContact(opp.lastContactedAt, now));

  const interestedNeedingAction = scoredOpportunities
    .filter((row) => row.crm_opportunities!.stage === "Interested" && !row.crm_opportunities!.next_follow_up_at)
    .map((row) => toOpportunityRef(row, hrefBase));

  const followUpsOverdue = scoredOpportunities.filter((row) => isOverdue(row.crm_opportunities!)).map((row) => toFollowUpRef(row, hrefBase));
  const followUpsDueToday = scoredOpportunities.filter((row) => isDueToday(row.crm_opportunities!)).map((row) => toFollowUpRef(row, hrefBase));

  const todayKey = dateKeyIn(now);
  const tomorrowKey = crmAddDays(todayKey, 1);
  const apptsToday = consultations.filter((a) => dateKeyIn(new Date(a.appointment_start_at)) === todayKey);
  const apptsTomorrow = consultations.filter((a) => dateKeyIn(new Date(a.appointment_start_at)) === tomorrowKey);
  const reminderMap = await fetchWinsalotReminderStatusMap(supabase, [...apptsToday, ...apptsTomorrow]);
  const toApptRef = (a: ConsultationCardRecord): SalesCoachAppointmentRef => ({
    id: a.id,
    businessName: a.business_name,
    href: a.opportunity_id ? `${hrefBase}/${a.opportunity_id}` : "/agent/appointments",
    startAt: a.appointment_start_at,
    reminderIssue: describeReminderIssue(reminderMap[a.id], a.appointment_start_at, now),
  });
  const appointmentsToday = apptsToday.map(toApptRef);
  const appointmentsTomorrow = apptsTomorrow.map(toApptRef);
  const reminderIssues = [...appointmentsToday, ...appointmentsTomorrow].filter((a) => a.reminderIssue !== null);

  const callLog = await fetchCallLogStatus(supabase, agentId, now);

  const bookedThisWeek = performance.current.consultationsBooked;
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
      bookedThisWeek,
      target: CRM_WEEKLY_CONSULTATIONS_TARGET,
      remainingToTarget: Math.max(0, CRM_WEEKLY_CONSULTATIONS_TARGET - bookedThisWeek),
      weekLabel: crmWeeklyRangeLabel(performance.current.periodStart, performance.current.periodEnd),
    },
    callLog,
    hotHref: "/agent/my-opportunities?category=hot",
    warmHref: "/agent/my-opportunities?category=warm",
  };
}

export type GrowthTeamCoachSourceData = {
  admin: SupabaseClient; // service-role client
  activeAgents: CrmUserRow[];
  now: Date;
  consultations: ConsultationCardRecord[]; // every booked appointment (admin already loads this)
  performanceRecords: CrmPerformanceOpportunityRecord[]; // getCrmPerformanceRecords(), already loaded on the page
};

export async function loadGrowthTeamSalesCoachData(input: GrowthTeamCoachSourceData): Promise<SalesCoachTeamData> {
  const { admin, activeAgents, now, consultations, performanceRecords } = input;
  const hrefBase = "/admin/crm/opportunities";

  const scoredOpportunities = await fetchScoredOpportunities(admin);
  const todayKey = dateKeyIn(now);
  const tomorrowKey = crmAddDays(todayKey, 1);
  const apptsToday = consultations.filter((a) => dateKeyIn(new Date(a.appointment_start_at)) === todayKey);
  const apptsTomorrow = consultations.filter((a) => dateKeyIn(new Date(a.appointment_start_at)) === tomorrowKey);
  const reminderMap = await fetchWinsalotReminderStatusMap(admin, [...apptsToday, ...apptsTomorrow]);
  const toApptRef = (a: ConsultationCardRecord): SalesCoachAppointmentRef => ({
    id: a.id,
    businessName: a.business_name,
    href: a.opportunity_id ? `${hrefBase}/${a.opportunity_id}` : "/admin/crm/appointments",
    startAt: a.appointment_start_at,
    reminderIssue: describeReminderIssue(reminderMap[a.id], a.appointment_start_at, now),
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
    const agentScored = scoredOpportunities.filter((row) => row.crm_opportunities!.assigned_agent_id === agent.id);
    const hotCount = agentScored.filter((row) => opportunityPriorityLevel(row.score) === "hot").length;
    const warmCount = agentScored.filter((row) => opportunityPriorityLevel(row.score) === "warm").length;
    const performance = computeCrmAgentPerformance(performanceRecords, agent.id).current;
    return {
      agentId: agent.id,
      agentName: agent.full_name || agent.email,
      hotCount,
      warmCount,
      followUpsOverdueCount: agentScored.filter((row) => isOverdue(row.crm_opportunities!)).length,
      followUpsDueTodayCount: agentScored.filter((row) => isDueToday(row.crm_opportunities!)).length,
      appointmentsTodayCount: apptsToday.filter((a) => a.assigned_agent_id === agent.id).length,
      appointmentsTomorrowCount: apptsTomorrow.filter((a) => a.assigned_agent_id === agent.id).length,
      weeklyBooked: performance.consultationsBooked,
      weeklyTarget: CRM_WEEKLY_CONSULTATIONS_TARGET,
      callLog: callLogMap.get(agent.id) ?? { ...emptyCallLogStatus },
      agentHref: `/admin/crm/opportunity-finder?agent=${agent.id}`,
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
    teamWeeklyTarget: computeTeamWeeklyTarget(CRM_WEEKLY_CONSULTATIONS_TARGET, activeAgents.length),
  };
}
