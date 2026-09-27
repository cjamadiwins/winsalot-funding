import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  businessDaysSince,
  deriveCommunicationMonitoringStatus,
  deriveStaleLeadStatus,
  computeLastMeaningfulActivity,
  deriveAppointmentRiskStatus,
  isPastCallKpiCheckpoint,
  deriveCallKpiPace,
  callKpiPaceMonitoringStatus,
  deriveDataQualityStatus,
  deriveCampaignActivityStatus,
  worstMonitoringStatus,
  summarizeOperationsMonitoring,
  type CommunicationFailureRecord,
  type StaleLeadRecord,
  type AppointmentRiskRecord,
  type AppointmentRiskFlag,
  type CallKpiAgentRecord,
  type DataQualityIssue,
  type CampaignActivityRecord,
  type MonitoringCategorySummary,
  type OperationsMonitoringSummary,
} from "./leadgen-monitoring";
import { LEADGEN_LEAD_CLOSED_STATUSES, isValidEmail, leadgenEmailStatusAt, type LeadgenEmailRow, type LeadgenLeadRow, type LeadgenAppointmentStatus } from "./leadgen-types";
import { normalizePhoneNumber, normalizeDncEmail } from "./dnc-types";
import { fetchLeadgenAppointmentReminderStatusMap, fetchLeadgenAppointmentSmsReminderStatusMap } from "./leadgen-appointment-reminders";
import { computeLeadgenAgentActivityKpis, LEADGEN_DAILY_CALL_TARGET, type LeadgenKpiCallLogRow, type LeadgenKpiEmailRow, type LeadgenKpiFollowUpRow } from "./leadgen-agent-kpi";

// Lead Generation CRM: Operations Monitoring data layer - see
// crm-monitoring-data.ts (the Growth CRM's equivalent) for the shared
// design rationale. Every read here is bounded (a recent time window, or
// a small active-record set) and reuses an existing table.

const FAILURE_WINDOW_DAYS = 7;
function windowCutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------
// 1. Email / SMS Failure Monitoring - leadgen_emails is the one canonical
// writer for every Lead Gen email (sendLeadgenEmail always inserts a row
// before calling Resend), so it already captures appointment-reminder
// email failures too - no second reminder-table query needed, unlike the
// Growth CRM (see that file's own comment on why it queries two tables).
// ---------------------------------------------------------------------
export async function fetchCommunicationFailures(admin: SupabaseClient): Promise<CommunicationFailureRecord[]> {
  const cutoff = windowCutoffIso(FAILURE_WINDOW_DAYS);
  const [{ data: emails }, { data: smsReminders }] = await Promise.all([
    admin
      .from("leadgen_emails")
      .select("id, lead_id, client_id, to_email, status, bounce_reason, failure_reason, created_at, sent_at, delivered_at, bounced_at, complained_at, opened_at, clicked_at, failed_at, delayed_at")
      .in("status", ["bounced", "failed", "complained"])
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("leadgen_appointment_sms_reminders")
      .select("id, appointment_id, status, error_detail, recipient_phone, updated_at")
      .eq("status", "failed")
      .gte("updated_at", cutoff)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  const leadIds = [...new Set((emails ?? []).map((e) => e.lead_id).filter((id): id is string => !!id))];
  const appointmentIds = [...new Set((smsReminders ?? []).map((r) => r.appointment_id))];

  const [{ data: leads }, { data: appointments }] = await Promise.all([
    leadIds.length ? admin.from("leadgen_leads").select("id, business_name").in("id", leadIds) : Promise.resolve({ data: [] }),
    appointmentIds.length ? admin.from("leadgen_appointments").select("id, business_name, lead_id").in("id", appointmentIds) : Promise.resolve({ data: [] }),
  ]);
  const leadNameById = new Map((leads ?? []).map((l: { id: string; business_name: string }) => [l.id, l.business_name]));
  const appointmentById = new Map((appointments ?? []).map((a: { id: string; business_name: string; lead_id: string | null }) => [a.id, a]));

  const records: CommunicationFailureRecord[] = [];
  for (const e of (emails ?? []) as LeadgenEmailRow[]) {
    records.push({
      id: `email:${e.id}`,
      channel: "email",
      recipient: e.to_email,
      status: e.status,
      detail: e.bounce_reason ?? e.failure_reason ?? null,
      relatedLabel: e.lead_id ? (leadNameById.get(e.lead_id) ?? null) : null,
      relatedHref: e.lead_id ? `/leadgen/admin/leads/${e.lead_id}` : null,
      occurredAt: leadgenEmailStatusAt(e),
      // The Lead Detail page already offers a "Resend" action for a
      // bounced/failed tracked email.
      retrySupported: true,
    });
  }
  for (const r of (smsReminders ?? []) as { id: string; appointment_id: string; status: string; error_detail: string | null; recipient_phone: string | null; updated_at: string }[]) {
    const appt = appointmentById.get(r.appointment_id) as { id: string; business_name: string; lead_id: string | null } | undefined;
    records.push({
      id: `sms:${r.id}`,
      channel: "sms",
      recipient: r.recipient_phone ?? "-",
      status: r.status,
      detail: r.error_detail,
      relatedLabel: appt?.business_name ?? null,
      relatedHref: appt?.lead_id ? `/leadgen/admin/leads/${appt.lead_id}` : "/leadgen/admin/appointments",
      occurredAt: r.updated_at,
      retrySupported: true,
    });
  }
  return records.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

// ---------------------------------------------------------------------
// 2. Stale Lead Monitoring
// ---------------------------------------------------------------------
type StaleLeadOpts = { agentId?: string; agentNameById?: Map<string, string> };

export async function fetchStaleLeads(admin: SupabaseClient, opts: StaleLeadOpts = {}): Promise<StaleLeadRecord[]> {
  let query = admin
    .from("leadgen_leads")
    .select("id, business_name, assigned_agent_id, status, created_at, last_contacted_at")
    .not("status", "in", `(${LEADGEN_LEAD_CLOSED_STATUSES.map((s) => `"${s}"`).join(",")})`)
    .eq("archived", false);
  if (opts.agentId) query = query.eq("assigned_agent_id", opts.agentId);
  const { data } = await query;
  const rows = (data ?? []) as Pick<LeadgenLeadRow, "id" | "business_name" | "assigned_agent_id" | "status" | "created_at" | "last_contacted_at">[];
  if (rows.length === 0) return [];

  const now = new Date();
  const results: StaleLeadRecord[] = [];
  for (const lead of rows) {
    const lastMeaningfulActivityAt = computeLastMeaningfulActivity(lead.created_at, [lead.last_contacted_at]);
    const businessDaysSinceActivity = businessDaysSince(lastMeaningfulActivityAt, now, 3);
    const status = deriveStaleLeadStatus(businessDaysSinceActivity);
    if (status === "Healthy") continue;
    results.push({
      leadId: lead.id,
      businessName: lead.business_name,
      assignedAgentId: lead.assigned_agent_id,
      assignedAgentName: lead.assigned_agent_id ? (opts.agentNameById?.get(lead.assigned_agent_id) ?? null) : null,
      lastMeaningfulActivityAt,
      businessDaysSinceActivity,
      status,
    });
  }
  return results.sort((a, b) => b.businessDaysSinceActivity - a.businessDaysSinceActivity);
}

// ---------------------------------------------------------------------
// 3. Appointment Risk Monitoring
// ---------------------------------------------------------------------
type AppointmentRiskOpts = { agentId?: string };

export async function fetchAppointmentRisks(admin: SupabaseClient, opts: AppointmentRiskOpts = {}): Promise<AppointmentRiskRecord[]> {
  const horizonKey = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayKey = new Date().toISOString().slice(0, 10);

  let query = admin
    .from("leadgen_appointments")
    .select("id, business_name, appointment_date, appointment_time, timezone, status, assigned_specialist_id, phone, email, sms_consent")
    .in("status", ["Booked", "Confirmed"])
    .gte("appointment_date", todayKey)
    .lte("appointment_date", horizonKey);
  if (opts.agentId) query = query.eq("assigned_specialist_id", opts.agentId);
  const { data } = await query;
  const rows = (data ?? []) as {
    id: string;
    business_name: string;
    appointment_date: string;
    appointment_time: string;
    timezone: string;
    status: LeadgenAppointmentStatus;
    assigned_specialist_id: string | null;
    phone: string | null;
    email: string | null;
    sms_consent: boolean;
  }[];
  if (rows.length === 0) return [];

  const [reminderMap, smsReminderMap] = await Promise.all([
    fetchLeadgenAppointmentReminderStatusMap(admin, rows),
    fetchLeadgenAppointmentSmsReminderStatusMap(admin, rows),
  ]);

  const results: AppointmentRiskRecord[] = [];
  for (const appt of rows) {
    const flags: AppointmentRiskFlag[] = [];
    const reminderStatus = reminderMap[appt.id];
    const smsStatus = smsReminderMap[appt.id];

    if (!appt.phone) flags.push({ code: "missing_phone", label: "No phone number on file", severity: "warning" });
    if (!appt.email) flags.push({ code: "missing_email", label: "No email address on file", severity: "warning" });
    if (!appt.assigned_specialist_id) flags.push({ code: "unassigned_agent", label: "No agent assigned to this appointment", severity: "warning" });

    if (reminderStatus?.status24h === "Failed") flags.push({ code: "email_24h_failed", label: "24-hour email reminder failed to send", severity: "action" });
    else if (reminderStatus?.status1h === "Failed") flags.push({ code: "email_1h_failed", label: "1-hour email reminder failed to send", severity: "action" });

    if (appt.sms_consent && smsStatus?.status24h === "Failed") flags.push({ code: "sms_24h_failed", label: "24-hour SMS reminder failed to send", severity: "action" });
    else if (appt.sms_consent && smsStatus?.status1h === "Failed") flags.push({ code: "sms_1h_failed", label: "1-hour SMS reminder failed to send", severity: "action" });

    if (flags.length === 0) continue;
    results.push({
      appointmentId: appt.id,
      businessName: appt.business_name,
      appointmentDate: appt.appointment_date,
      status: appt.status,
      assignedAgentId: appt.assigned_specialist_id,
      flags,
      monitoringStatus: deriveAppointmentRiskStatus(flags),
    });
  }
  return results.sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate));
}

// ---------------------------------------------------------------------
// 4. Call KPI Warning - reuses computeLeadgenAgentActivityKpis
// (leadgen-agent-kpi.ts) verbatim against LEADGEN_DAILY_CALL_TARGET (80).
// ---------------------------------------------------------------------
export async function fetchCallKpiAgents(admin: SupabaseClient): Promise<CallKpiAgentRecord[]> {
  const now = new Date();
  const isPastCheckpoint = isPastCallKpiCheckpoint(now);

  const { data: agents } = await admin.from("leadgen_users").select("id, full_name, email").eq("role", "agent").eq("active", true);
  const agentRows = (agents ?? []) as { id: string; full_name: string; email: string }[];
  if (agentRows.length === 0) return [];

  const sevenDaysAgo = windowCutoffIso(7);
  const [{ data: callLogs }, { data: emails }, { data: followUps }] = await Promise.all([
    admin.from("leadgen_call_logs").select("agent_id, created_at").gte("created_at", sevenDaysAgo),
    admin.from("leadgen_emails").select("sent_by, sent_at, delivered_at, bounced_at, failed_at").gte("sent_at", sevenDaysAgo),
    admin.from("leadgen_followups").select("agent_id, status, completed_at").gte("completed_at", sevenDaysAgo),
  ]);

  return agentRows.map((agent) => {
    const kpi = computeLeadgenAgentActivityKpis(
      (callLogs ?? []) as LeadgenKpiCallLogRow[],
      (emails ?? []) as LeadgenKpiEmailRow[],
      (followUps ?? []) as LeadgenKpiFollowUpRow[],
      agent.id,
      now
    );
    const pace = deriveCallKpiPace(kpi.dailyCallProgressPct, isPastCheckpoint);
    return {
      agentId: agent.id,
      agentName: agent.full_name || agent.email,
      callsToday: kpi.callsToday,
      dailyTarget: LEADGEN_DAILY_CALL_TARGET,
      pace,
      status: callKpiPaceMonitoringStatus(pace),
    };
  });
}

// ---------------------------------------------------------------------
// 5. Data Quality Monitoring
// ---------------------------------------------------------------------
function normalizeBusinessKey(businessName: string, city: string | null): string {
  return `${businessName.trim().toLowerCase().replace(/\s+/g, " ")}|${(city ?? "").trim().toLowerCase()}`;
}

export async function fetchDataQualityIssues(admin: SupabaseClient): Promise<DataQualityIssue[]> {
  const { data } = await admin
    .from("leadgen_leads")
    .select("id, business_name, phone, email, city, assigned_agent_id, status")
    .not("status", "in", `(${LEADGEN_LEAD_CLOSED_STATUSES.map((s) => `"${s}"`).join(",")})`)
    .eq("archived", false);
  const rows = (data ?? []) as Pick<LeadgenLeadRow, "id" | "business_name" | "phone" | "email" | "city" | "assigned_agent_id" | "status">[];

  const byPhone = new Map<string, string[]>();
  const byEmail = new Map<string, string[]>();
  const byBusinessKey = new Map<string, string[]>();
  for (const l of rows) {
    const phoneKey = normalizePhoneNumber(l.phone);
    if (phoneKey) byPhone.set(phoneKey, [...(byPhone.get(phoneKey) ?? []), l.id]);
    const emailKey = normalizeDncEmail(l.email);
    if (emailKey) byEmail.set(emailKey, [...(byEmail.get(emailKey) ?? []), l.id]);
    const bizKey = normalizeBusinessKey(l.business_name, l.city);
    byBusinessKey.set(bizKey, [...(byBusinessKey.get(bizKey) ?? []), l.id]);
  }

  const issues: DataQualityIssue[] = [];
  for (const l of rows) {
    const reasons: string[] = [];
    if (!l.phone) reasons.push("Missing phone number");
    if (!l.email) reasons.push("Missing email");
    else if (!isValidEmail(l.email)) reasons.push("Invalid email format");
    if (!l.city) reasons.push("Missing city");
    if (!l.assigned_agent_id) reasons.push("Missing assigned agent");

    const phoneKey = normalizePhoneNumber(l.phone);
    if (phoneKey && (byPhone.get(phoneKey)?.length ?? 0) > 1) reasons.push("Possible duplicate phone number");
    const emailKey = normalizeDncEmail(l.email);
    if (emailKey && (byEmail.get(emailKey)?.length ?? 0) > 1) reasons.push("Possible duplicate email address");
    const bizKey = normalizeBusinessKey(l.business_name, l.city);
    if ((byBusinessKey.get(bizKey)?.length ?? 0) > 1) reasons.push("Possible duplicate business (same name and city)");

    if (reasons.length > 0) {
      issues.push({ leadId: l.id, businessName: l.business_name, reasons, href: `/leadgen/admin/leads/${l.id}` });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------
// 6. Client Campaign Activity Monitoring - only campaigns with
// status='active'.
// ---------------------------------------------------------------------
export async function fetchCampaignActivity(admin: SupabaseClient): Promise<CampaignActivityRecord[]> {
  const { data: campaigns } = await admin.from("leadgen_campaigns").select("id, name, client_id, status").eq("status", "active");
  const campaignRows = (campaigns ?? []) as { id: string; name: string; client_id: string; status: string }[];
  if (campaignRows.length === 0) return [];

  const campaignIds = campaignRows.map((c) => c.id);
  const clientIds = [...new Set(campaignRows.map((c) => c.client_id))];
  const todayKey = new Date().toISOString().slice(0, 10);

  const [{ data: clients }, { data: campaignAgents }, { data: leads }, { data: emails }, { data: appointments }] = await Promise.all([
    admin.from("leadgen_clients").select("id, business_name").in("id", clientIds),
    admin.from("leadgen_campaign_agents").select("campaign_id, agent_id, leadgen_users(full_name, email)").in("campaign_id", campaignIds),
    admin.from("leadgen_leads").select("id, campaign_id, created_at").in("campaign_id", campaignIds),
    admin.from("leadgen_emails").select("campaign_id, sent_at").in("campaign_id", campaignIds).not("sent_at", "is", null),
    admin.from("leadgen_appointments").select("id, campaign_id, created_at, appointment_date").in("campaign_id", campaignIds),
  ]);

  const clientNameById = new Map((clients ?? []).map((c: { id: string; business_name: string }) => [c.id, c.business_name]));
  const agentNamesByCampaign = new Map<string, string[]>();
  for (const link of (campaignAgents ?? []) as unknown as { campaign_id: string; leadgen_users: { full_name: string; email: string } | { full_name: string; email: string }[] | null }[]) {
    const user = Array.isArray(link.leadgen_users) ? link.leadgen_users[0] : link.leadgen_users;
    const name = user?.full_name || user?.email;
    if (!name) continue;
    agentNamesByCampaign.set(link.campaign_id, [...(agentNamesByCampaign.get(link.campaign_id) ?? []), name]);
  }

  const leadsByCampaign = new Map<string, { created_at: string }[]>();
  for (const l of (leads ?? []) as { id: string; campaign_id: string; created_at: string }[]) {
    leadsByCampaign.set(l.campaign_id, [...(leadsByCampaign.get(l.campaign_id) ?? []), l]);
  }
  const emailsByCampaign = new Map<string, { sent_at: string }[]>();
  for (const e of (emails ?? []) as { campaign_id: string; sent_at: string }[]) {
    emailsByCampaign.set(e.campaign_id, [...(emailsByCampaign.get(e.campaign_id) ?? []), e]);
  }
  const appointmentsByCampaign = new Map<string, { id: string; created_at: string; appointment_date: string }[]>();
  for (const a of (appointments ?? []) as { id: string; campaign_id: string; created_at: string; appointment_date: string }[]) {
    appointmentsByCampaign.set(a.campaign_id, [...(appointmentsByCampaign.get(a.campaign_id) ?? []), a]);
  }

  const now = new Date();
  const results: CampaignActivityRecord[] = [];
  for (const campaign of campaignRows) {
    const campaignLeads = leadsByCampaign.get(campaign.id) ?? [];
    const campaignEmails = emailsByCampaign.get(campaign.id) ?? [];
    const campaignAppointments = appointmentsByCampaign.get(campaign.id) ?? [];

    const activityTimestamps = [
      ...campaignLeads.map((l) => l.created_at),
      ...campaignEmails.map((e) => e.sent_at),
      ...campaignAppointments.map((a) => a.created_at),
    ];
    const lastActivityAt = activityTimestamps.length > 0 ? activityTimestamps.reduce((latest, v) => (v > latest ? v : latest)) : null;
    const businessDaysSinceActivity = lastActivityAt ? businessDaysSince(lastActivityAt, now, 2) : 2;
    const status = deriveCampaignActivityStatus(businessDaysSinceActivity);
    if (status === "Healthy") continue;

    results.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      clientId: campaign.client_id,
      clientName: clientNameById.get(campaign.client_id) ?? "Unknown Client",
      assignedAgentNames: agentNamesByCampaign.get(campaign.id) ?? [],
      lastActivityAt,
      // "Today" counts are informational context in the detail table, not
      // part of the status derivation above (which uses the actual last
      // activity timestamp, not a same-day boolean).
      callsToday: 0,
      emailsToday: campaignEmails.filter((e) => e.sent_at.slice(0, 10) === todayKey).length,
      leadsGenerated: campaignLeads.length,
      appointmentsBooked: campaignAppointments.length,
      businessDaysSinceActivity,
      status,
    });
  }
  return results.sort((a, b) => b.businessDaysSinceActivity - a.businessDaysSinceActivity);
}

// ---------------------------------------------------------------------
// Dashboard card summary
// ---------------------------------------------------------------------
export async function fetchOperationsMonitoringSummary(admin: SupabaseClient): Promise<OperationsMonitoringSummary> {
  const [failures, staleLeads, appointmentRisks, callKpiAgents, dataQualityIssues, campaigns] = await Promise.all([
    fetchCommunicationFailures(admin),
    fetchStaleLeads(admin),
    fetchAppointmentRisks(admin),
    fetchCallKpiAgents(admin),
    fetchDataQualityIssues(admin),
    fetchCampaignActivity(admin),
  ]);

  const commsStatus = deriveCommunicationMonitoringStatus(failures.length);
  const staleCounts = countByStatus(staleLeads.map((r) => r.status));
  const apptCounts = countByStatus(appointmentRisks.map((r) => r.monitoringStatus));
  const kpiCounts = countByStatus(callKpiAgents.map((r) => r.status));
  const dqStatus = deriveDataQualityStatus(dataQualityIssues.length);
  const campaignCounts = countByStatus(campaigns.map((r) => r.status));
  const behindPaceCount = callKpiAgents.filter((a) => a.pace === "Behind Pace").length;

  const categories: MonitoringCategorySummary[] = [
    {
      key: "email_sms",
      label: "Email/SMS",
      status: commsStatus,
      headline: commsStatus === "Healthy" ? "Healthy" : `${failures.length} recent failures`,
      actionRequiredCount: commsStatus === "Action Required" ? 1 : 0,
      warningCount: commsStatus === "Needs Attention" ? 1 : 0,
      healthyCount: commsStatus === "Healthy" ? 1 : 0,
    },
    {
      key: "stale_leads",
      label: "Stale Leads",
      status: worstMonitoringStatus(staleLeads.map((r) => r.status)),
      headline: String(staleLeads.length),
      actionRequiredCount: staleCounts["Action Required"],
      warningCount: staleCounts["Needs Attention"],
      healthyCount: 0,
    },
    {
      key: "appointments",
      label: "Appointments",
      status: worstMonitoringStatus(appointmentRisks.map((r) => r.monitoringStatus)),
      headline: String(appointmentRisks.length),
      actionRequiredCount: apptCounts["Action Required"],
      warningCount: apptCounts["Needs Attention"],
      healthyCount: 0,
    },
    {
      key: "agent_kpi",
      label: "Agent KPI",
      status: worstMonitoringStatus(callKpiAgents.map((r) => r.status)),
      headline: behindPaceCount > 0 ? `${behindPaceCount} agent${behindPaceCount === 1 ? "" : "s"} behind pace` : "On track",
      actionRequiredCount: kpiCounts["Action Required"],
      warningCount: kpiCounts["Needs Attention"],
      healthyCount: callKpiAgents.length - kpiCounts["Action Required"] - kpiCounts["Needs Attention"],
    },
    {
      key: "data_quality",
      label: "Data Quality",
      status: dqStatus,
      headline: dqStatus === "Healthy" ? "Healthy" : `${dataQualityIssues.length} records`,
      actionRequiredCount: dqStatus === "Action Required" ? 1 : 0,
      warningCount: dqStatus === "Needs Attention" ? 1 : 0,
      healthyCount: dqStatus === "Healthy" ? 1 : 0,
    },
    {
      key: "client_campaigns",
      label: "Client Campaigns",
      status: worstMonitoringStatus(campaigns.map((r) => r.status)),
      headline: campaigns.length === 0 ? "Healthy" : `${campaigns.length} campaigns`,
      actionRequiredCount: campaignCounts["Action Required"],
      warningCount: campaignCounts["Needs Attention"],
      healthyCount: campaignCounts["Action Required"] === 0 && campaignCounts["Needs Attention"] === 0 ? 1 : 0,
    },
  ];

  return summarizeOperationsMonitoring(categories);
}

function countByStatus(statuses: ("Healthy" | "Needs Attention" | "Action Required")[]): Record<"Healthy" | "Needs Attention" | "Action Required", number> {
  const counts = { Healthy: 0, "Needs Attention": 0, "Action Required": 0 };
  for (const s of statuses) counts[s]++;
  return counts;
}

// ---------------------------------------------------------------------
// Agent-scoped alerts (agent dashboard "My Alerts") - session-scoped
// client, RLS (leadgen_leads_agent_select_own etc.) does the narrowing.
// ---------------------------------------------------------------------
export async function fetchAgentOperationsAlerts(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ staleLeadCount: number; appointmentRiskCount: number }> {
  const [staleLeads, appointmentRisks] = await Promise.all([
    fetchStaleLeads(supabase, { agentId }),
    fetchAppointmentRisks(supabase, { agentId }),
  ]);
  return { staleLeadCount: staleLeads.length, appointmentRiskCount: appointmentRisks.length };
}

// This agent's own call KPI pace, from their own already-fetched call
// logs (the agent dashboard can pass its own RLS-scoped leadgen_call_logs
// read directly, avoiding a second query for just this).
export function computeMyCallKpiPace(
  callLogs: LeadgenKpiCallLogRow[],
  emails: LeadgenKpiEmailRow[],
  followUps: LeadgenKpiFollowUpRow[],
  agentId: string,
  now: Date = new Date()
): CallKpiAgentRecord {
  const kpi = computeLeadgenAgentActivityKpis(callLogs, emails, followUps, agentId, now);
  const pace = deriveCallKpiPace(kpi.dailyCallProgressPct, isPastCallKpiCheckpoint(now));
  return {
    agentId,
    agentName: "",
    callsToday: kpi.callsToday,
    dailyTarget: LEADGEN_DAILY_CALL_TARGET,
    pace,
    status: callKpiPaceMonitoringStatus(pace),
  };
}
