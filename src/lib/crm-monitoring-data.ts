import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  businessDaysSince,
  deriveCommunicationMonitoringStatus,
  deriveStaleLeadStatus,
  computeLastMeaningfulActivity,
  deriveAppointmentRiskStatus,
  deriveFollowUpMissingFlag,
  isPastCallKpiCheckpoint,
  expectedCallsByNow,
  deriveCallKpiPace,
  callKpiPaceMonitoringStatus,
  deriveDataQualityStatus,
  deriveClientCampaignStatus,
  worstMonitoringStatus,
  summarizeOperationsMonitoring,
  type CommunicationFailureRecord,
  type StaleOpportunityRecord,
  type AppointmentRiskRecord,
  type AppointmentRiskFlag,
  type CallKpiAgentRecord,
  type DataQualityIssue,
  type ClientCampaignActivityRecord,
  type MonitoringCategorySummary,
  type OperationsMonitoringSummary,
} from "./crm-monitoring";
import { CLOSED_STAGES, type CrmOpportunityRow } from "./crm-types";
import { CRM_WEEKLY_CALL_TARGET } from "./crm-performance";
import { normalizePhoneNumber, normalizeDncEmail } from "./dnc-types";
import { isValidEmail } from "./winsalot-consultation-types";
import { fetchWinsalotReminderStatusMap, fetchWinsalotSmsReminderStatusMap } from "./winsalot-consultation-reminders";
import { winsalotFollowUpEmailDisplayStatus } from "./winsalot-consultation-types";
import type { WinsalotAppointmentRow } from "./winsalot-consultation-types";
import type { CrmLeadEmailRow } from "./crm-types";

// Winsalot Growth CRM: Operations Monitoring data layer - every read here
// is bounded (a short recent time window, or a small "active" record set)
// rather than an unbounded full-table scan, and every table read already
// exists for another feature (see crm-monitoring.ts's own header comment
// for the full reuse list). Nothing here writes to the database except
// crm-monitoring-notifications.ts's escalation sweep, which only ever
// inserts into the existing crm_notifications table.

const FAILURE_WINDOW_DAYS = 7;
function windowCutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------
// 1. Email / SMS Failure Monitoring
// ---------------------------------------------------------------------
export async function fetchCommunicationFailures(admin: SupabaseClient): Promise<CommunicationFailureRecord[]> {
  const cutoff = windowCutoffIso(FAILURE_WINDOW_DAYS);
  const [{ data: leadEmails }, { data: invoiceEmails }, { data: emailReminders }, { data: smsReminders }] = await Promise.all([
    admin
      .from("crm_lead_emails")
      .select("id, opportunity_id, email_type, to_email, status, status_at, bounce_reason, failure_reason")
      .in("status", ["bounced", "failed", "complained"])
      .gte("status_at", cutoff)
      .order("status_at", { ascending: false })
      .limit(200),
    admin
      .from("crm_invoice_emails")
      .select("id, invoice_id, email_type, to_email, status, status_at")
      .in("status", ["bounced", "failed", "complained"])
      .gte("status_at", cutoff)
      .order("status_at", { ascending: false })
      .limit(100),
    admin
      .from("winsalot_appointment_reminders")
      .select("id, appointment_id, reminder_type, status, error_detail, recipient_email, updated_at")
      .eq("status", "failed")
      .gte("updated_at", cutoff)
      .order("updated_at", { ascending: false })
      .limit(100),
    admin
      .from("winsalot_appointment_sms_reminders")
      .select("id, appointment_id, reminder_type, status, error_detail, recipient_phone, updated_at")
      .eq("status", "failed")
      .gte("updated_at", cutoff)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  const opportunityIds = [...new Set((leadEmails ?? []).map((e) => e.opportunity_id).filter((id): id is string => !!id))];
  const appointmentIds = [
    ...new Set([...(emailReminders ?? []).map((r) => r.appointment_id), ...(smsReminders ?? []).map((r) => r.appointment_id)]),
  ];
  const invoiceIds = [...new Set((invoiceEmails ?? []).map((e) => e.invoice_id).filter((id): id is string => !!id))];

  const [{ data: opportunities }, { data: appointments }, { data: invoices }] = await Promise.all([
    opportunityIds.length ? admin.from("crm_opportunities").select("id, business_name").in("id", opportunityIds) : Promise.resolve({ data: [] }),
    appointmentIds.length
      ? admin.from("winsalot_appointments").select("id, business_name, opportunity_id").in("id", appointmentIds)
      : Promise.resolve({ data: [] }),
    invoiceIds.length ? admin.from("crm_invoices").select("id, invoice_number").in("id", invoiceIds) : Promise.resolve({ data: [] }),
  ]);
  const opportunityNameById = new Map((opportunities ?? []).map((o: { id: string; business_name: string }) => [o.id, o.business_name]));
  const appointmentById = new Map(
    (appointments ?? []).map((a: { id: string; business_name: string; opportunity_id: string | null }) => [a.id, a])
  );
  const invoiceNumberById = new Map((invoices ?? []).map((i: { id: string; invoice_number: string }) => [i.id, i.invoice_number]));

  const records: CommunicationFailureRecord[] = [];

  for (const e of leadEmails ?? []) {
    records.push({
      id: `lead_email:${e.id}`,
      channel: "email",
      recipient: e.to_email,
      status: e.status,
      detail: e.bounce_reason ?? e.failure_reason ?? null,
      relatedLabel: e.opportunity_id ? (opportunityNameById.get(e.opportunity_id) ?? null) : null,
      relatedHref: e.opportunity_id ? `/admin/crm/opportunities/${e.opportunity_id}` : null,
      occurredAt: e.status_at,
      // A one-off prospect email (follow-up/consultation invite/etc) has no
      // dedicated "retry this exact failed send" action - re-sending means
      // composing a new email from the opportunity page.
      retrySupported: false,
    });
  }
  for (const e of invoiceEmails ?? []) {
    records.push({
      id: `invoice_email:${e.id}`,
      channel: "email",
      recipient: e.to_email,
      status: e.status,
      detail: null,
      relatedLabel: e.invoice_id ? (invoiceNumberById.get(e.invoice_id) ? `Invoice ${invoiceNumberById.get(e.invoice_id)}` : null) : null,
      relatedHref: e.invoice_id ? `/admin/crm/invoices/${e.invoice_id}` : null,
      occurredAt: e.status_at,
      // The Invoices page already offers a "Resend" action for a sent
      // invoice email.
      retrySupported: true,
    });
  }
  for (const r of emailReminders ?? []) {
    const appt = appointmentById.get(r.appointment_id) as { id: string; business_name: string; opportunity_id: string | null } | undefined;
    records.push({
      id: `appt_email_reminder:${r.id}`,
      channel: "email",
      recipient: r.recipient_email ?? "-",
      status: r.status,
      detail: r.error_detail,
      relatedLabel: appt?.business_name ?? null,
      relatedHref: appt?.opportunity_id ? `/admin/crm/opportunities/${appt.opportunity_id}` : "/admin/crm/appointments",
      occurredAt: r.updated_at,
      // The appointment page already offers "Resend Appointment
      // Notification" / "Send Appointment Reminder".
      retrySupported: true,
    });
  }
  for (const r of smsReminders ?? []) {
    const appt = appointmentById.get(r.appointment_id) as { id: string; business_name: string; opportunity_id: string | null } | undefined;
    records.push({
      id: `appt_sms_reminder:${r.id}`,
      channel: "sms",
      recipient: r.recipient_phone ?? "-",
      status: r.status,
      detail: r.error_detail,
      relatedLabel: appt?.business_name ?? null,
      relatedHref: appt?.opportunity_id ? `/admin/crm/opportunities/${appt.opportunity_id}` : "/admin/crm/appointments",
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

export async function fetchStaleOpportunities(admin: SupabaseClient, opts: StaleLeadOpts = {}): Promise<StaleOpportunityRecord[]> {
  let query = admin
    .from("crm_opportunities")
    .select("id, business_name, assigned_agent_id, stage, created_at, last_contacted_at")
    .not("stage", "in", `(${CLOSED_STAGES.map((s) => `"${s}"`).join(",")})`);
  if (opts.agentId) query = query.eq("assigned_agent_id", opts.agentId);
  const { data: opportunities } = await query;
  const rows = (opportunities ?? []) as Pick<CrmOpportunityRow, "id" | "business_name" | "assigned_agent_id" | "stage" | "created_at" | "last_contacted_at">[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: scores } = await admin.from("crm_opportunity_scores").select("opportunity_id, signals").in("opportunity_id", ids);
  const signalsById = new Map(
    (scores ?? []).map((s: { opportunity_id: string; signals: Record<string, unknown> | null }) => [s.opportunity_id, s.signals ?? {}])
  );

  const now = new Date();
  const results: StaleOpportunityRecord[] = [];
  for (const o of rows) {
    const signals = (signalsById.get(o.id) ?? {}) as { last_call_at?: string | null; last_email_activity_at?: string | null; last_note_at?: string | null };
    const lastMeaningfulActivityAt = computeLastMeaningfulActivity(o.created_at, [
      o.last_contacted_at,
      signals.last_call_at ?? null,
      signals.last_email_activity_at ?? null,
      signals.last_note_at ?? null,
    ]);
    const businessDaysSinceActivity = businessDaysSince(lastMeaningfulActivityAt, now, 3);
    const status = deriveStaleLeadStatus(businessDaysSinceActivity);
    if (status === "Healthy") continue;
    results.push({
      opportunityId: o.id,
      businessName: o.business_name,
      assignedAgentId: o.assigned_agent_id,
      assignedAgentName: o.assigned_agent_id ? (opts.agentNameById?.get(o.assigned_agent_id) ?? null) : null,
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
  const now = new Date();
  const horizonIso = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const recentCompletedCutoff = windowCutoffIso(14);

  let query = admin
    .from("winsalot_appointments")
    .select(
      "id, business_name, appointment_start_at, status, assigned_agent_id, sms_consent, phone, follow_up_email_status, follow_up_crm_lead_email_id, completed_at"
    )
    .or(`and(status.eq.booked,appointment_start_at.lte.${horizonIso}),and(status.eq.completed,completed_at.gte.${recentCompletedCutoff})`);
  if (opts.agentId) query = query.eq("assigned_agent_id", opts.agentId);
  const { data } = await query;
  const rows = (data ?? []) as Pick<
    WinsalotAppointmentRow,
    "id" | "business_name" | "appointment_start_at" | "status" | "assigned_agent_id" | "sms_consent" | "phone" | "follow_up_email_status" | "follow_up_crm_lead_email_id" | "completed_at"
  >[];
  if (rows.length === 0) return [];

  const [reminderMap, smsReminderMap] = await Promise.all([
    fetchWinsalotReminderStatusMap(admin, rows),
    fetchWinsalotSmsReminderStatusMap(admin, rows),
  ]);

  const followUpEmailIds = rows.map((r) => r.follow_up_crm_lead_email_id).filter((id): id is string => !!id);
  const { data: followUpEmails } = followUpEmailIds.length
    ? await admin.from("crm_lead_emails").select("*").in("id", followUpEmailIds)
    : { data: [] as CrmLeadEmailRow[] };
  const followUpEmailById = new Map(((followUpEmails ?? []) as CrmLeadEmailRow[]).map((e) => [e.id, e]));

  const results: AppointmentRiskRecord[] = [];
  for (const appt of rows) {
    const flags: AppointmentRiskFlag[] = [];
    const reminderStatus = reminderMap[appt.id];
    const smsStatus = smsReminderMap[appt.id];

    if (appt.status === "booked") {
      if (reminderStatus?.reminder24h === "Failed") flags.push({ code: "email_24h_failed", label: "24-hour email reminder failed to send", severity: "action" });
      else if (reminderStatus?.reminder1h === "Failed") flags.push({ code: "email_1h_failed", label: "1-hour email reminder failed to send", severity: "action" });

      if (appt.sms_consent && smsStatus?.status24h === "Failed") flags.push({ code: "sms_24h_failed", label: "24-hour SMS reminder failed to send", severity: "action" });
      else if (appt.sms_consent && smsStatus?.status1h === "Failed") flags.push({ code: "sms_1h_failed", label: "1-hour SMS reminder failed to send", severity: "action" });

      if (!appt.assigned_agent_id) flags.push({ code: "unassigned_agent", label: "No agent assigned to this appointment", severity: "warning" });
    }

    if (appt.status === "completed" && appt.completed_at) {
      const linkedEmail = appt.follow_up_crm_lead_email_id ? (followUpEmailById.get(appt.follow_up_crm_lead_email_id) ?? null) : null;
      const displayStatus = winsalotFollowUpEmailDisplayStatus(appt.follow_up_email_status, linkedEmail);
      if (displayStatus === "Not Sent" || displayStatus === "Failed") {
        const flag = deriveFollowUpMissingFlag(appt.completed_at, now);
        if (flag) flags.push(flag);
      }
    }

    if (flags.length === 0) continue;
    results.push({
      appointmentId: appt.id,
      businessName: appt.business_name,
      appointmentStartAt: appt.appointment_start_at,
      status: appt.status,
      assignedAgentId: appt.assigned_agent_id,
      flags,
      monitoringStatus: deriveAppointmentRiskStatus(flags),
    });
  }
  return results.sort((a, b) => new Date(a.appointmentStartAt).getTime() - new Date(b.appointmentStartAt).getTime());
}

// ---------------------------------------------------------------------
// 4. Call KPI Warning - against the CRM's own existing CRM_WEEKLY_CALL_TARGET
// (src/lib/crm-performance.ts), read from the latest imported Dialpad
// report period rather than a live daily counter (see crm-monitoring.ts's
// header comment on this file's own limits).
// ---------------------------------------------------------------------
export async function fetchCallKpiAgents(admin: SupabaseClient): Promise<CallKpiAgentRecord[]> {
  const now = new Date();
  const { data: reports } = await admin.from("dialpad_call_reports").select("id, period_start, period_end").order("period_end", { ascending: false }).limit(1);
  const report = (reports ?? [])[0] as { id: string; period_start: string; period_end: string } | undefined;
  if (!report) return [];

  const { data: summaries } = await admin.from("dialpad_user_stats").select("agent_name, agent_role, total_calls").eq("report_id", report.id);
  const agentSummaries = (summaries ?? []) as { agent_name: string; agent_role: "admin" | "agent"; total_calls: number }[];

  const totalBusinessDaysInPeriod = countBusinessDaysInclusive(report.period_start, report.period_end);
  const elapsedBusinessDays = countBusinessDaysInclusive(report.period_start, isoDateKey(now));
  const isPastCheckpoint = isPastCallKpiCheckpoint(now);

  return agentSummaries
    .filter((s) => s.agent_role === "agent")
    .map((s, index) => {
      const expected = expectedCallsByNow(CRM_WEEKLY_CALL_TARGET, totalBusinessDaysInPeriod, elapsedBusinessDays);
      const pace = deriveCallKpiPace(s.total_calls, expected, isPastCheckpoint);
      return {
        agentId: `dialpad:${s.agent_name}:${index}`,
        agentName: s.agent_name,
        callsInPeriod: s.total_calls,
        weeklyTarget: CRM_WEEKLY_CALL_TARGET,
        periodStart: report.period_start,
        periodEnd: report.period_end,
        pace,
        status: callKpiPaceMonitoringStatus(pace),
      };
    });
}

function isoDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function countBusinessDaysInclusive(startKey: string, endKey: string): number {
  if (endKey < startKey) return 0;
  let count = 0;
  const [sy, sm, sd] = startKey.split("-").map(Number);
  let cursorDate = new Date(sy, sm - 1, sd);
  const [ey, em, ed] = endKey.split("-").map(Number);
  const endDate = new Date(ey, em - 1, ed);
  while (cursorDate <= endDate) {
    const day = cursorDate.getDay();
    if (day !== 0 && day !== 6) count++;
    cursorDate = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), cursorDate.getDate() + 1);
  }
  return count;
}

// ---------------------------------------------------------------------
// 5. Data Quality Monitoring
// ---------------------------------------------------------------------
function normalizeBusinessKey(businessName: string, city: string | null): string {
  return `${businessName.trim().toLowerCase().replace(/\s+/g, " ")}|${(city ?? "").trim().toLowerCase()}`;
}

export async function fetchDataQualityIssues(admin: SupabaseClient): Promise<DataQualityIssue[]> {
  const { data } = await admin
    .from("crm_opportunities")
    .select("id, business_name, phone, email, city, assigned_agent_id, stage")
    .not("stage", "in", `(${CLOSED_STAGES.map((s) => `"${s}"`).join(",")})`);
  const rows = (data ?? []) as Pick<CrmOpportunityRow, "id" | "business_name" | "phone" | "email" | "city" | "assigned_agent_id" | "stage">[];

  const byPhone = new Map<string, string[]>();
  const byEmail = new Map<string, string[]>();
  const byBusinessKey = new Map<string, string[]>();
  for (const o of rows) {
    const phoneKey = normalizePhoneNumber(o.phone);
    if (phoneKey) byPhone.set(phoneKey, [...(byPhone.get(phoneKey) ?? []), o.id]);
    const emailKey = normalizeDncEmail(o.email);
    if (emailKey) byEmail.set(emailKey, [...(byEmail.get(emailKey) ?? []), o.id]);
    const bizKey = normalizeBusinessKey(o.business_name, o.city);
    byBusinessKey.set(bizKey, [...(byBusinessKey.get(bizKey) ?? []), o.id]);
  }

  const issues: DataQualityIssue[] = [];
  for (const o of rows) {
    const reasons: string[] = [];
    if (!o.email) reasons.push("Missing email");
    else if (!isValidEmail(o.email)) reasons.push("Invalid email format");
    if (!o.city) reasons.push("Missing city");
    if (!o.assigned_agent_id) reasons.push("Missing assigned agent");

    const phoneKey = normalizePhoneNumber(o.phone);
    if (phoneKey && (byPhone.get(phoneKey)?.length ?? 0) > 1) reasons.push("Possible duplicate phone number");
    const emailKey = normalizeDncEmail(o.email);
    if (emailKey && (byEmail.get(emailKey)?.length ?? 0) > 1) reasons.push("Possible duplicate email address");
    const bizKey = normalizeBusinessKey(o.business_name, o.city);
    if ((byBusinessKey.get(bizKey)?.length ?? 0) > 1) reasons.push("Possible duplicate business (same name and city)");

    if (reasons.length > 0) {
      issues.push({ recordType: "opportunity", recordId: o.id, businessName: o.business_name, reasons, href: `/admin/crm/opportunities/${o.id}` });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------
// 6. Client Campaign Activity Monitoring - only 'Active' clients.
// ---------------------------------------------------------------------
export async function fetchClientCampaignActivity(admin: SupabaseClient): Promise<ClientCampaignActivityRecord[]> {
  const { data: clients } = await admin.from("crm_clients").select("id, company_name").eq("status", "Active");
  const clientRows = (clients ?? []) as { id: string; company_name: string }[];
  if (clientRows.length === 0) return [];

  const clientIds = clientRows.map((c) => c.id);
  const [{ data: agentLinks }, { data: activities }, { data: appointments }] = await Promise.all([
    admin.from("crm_client_agents").select("client_id, agent_id, crm_users(full_name, email)").in("client_id", clientIds),
    admin.from("crm_activities").select("client_id, occurred_at").in("client_id", clientIds).order("occurred_at", { ascending: false }),
    admin.from("crm_client_appointments").select("client_id, appointment_date").in("client_id", clientIds).order("appointment_date", { ascending: false }),
  ]);

  const agentNamesByClient = new Map<string, string[]>();
  for (const link of (agentLinks ?? []) as unknown as { client_id: string; crm_users: { full_name: string; email: string } | { full_name: string; email: string }[] | null }[]) {
    const user = Array.isArray(link.crm_users) ? link.crm_users[0] : link.crm_users;
    const name = user?.full_name || user?.email;
    if (!name) continue;
    agentNamesByClient.set(link.client_id, [...(agentNamesByClient.get(link.client_id) ?? []), name]);
  }
  const lastActivityByClient = new Map<string, string>();
  for (const a of (activities ?? []) as { client_id: string; occurred_at: string }[]) {
    if (!lastActivityByClient.has(a.client_id)) lastActivityByClient.set(a.client_id, a.occurred_at);
  }
  for (const a of (appointments ?? []) as { client_id: string; appointment_date: string }[]) {
    const existing = lastActivityByClient.get(a.client_id);
    if (!existing || new Date(a.appointment_date).getTime() > new Date(existing).getTime()) lastActivityByClient.set(a.client_id, a.appointment_date);
  }

  const now = new Date();
  const results: ClientCampaignActivityRecord[] = [];
  for (const client of clientRows) {
    const lastActivityAt = lastActivityByClient.get(client.id) ?? null;
    // No recorded activity at all for an Active client is treated the same
    // as very old activity (capped at 2 business days) - the client's own
    // creation date isn't a meaningful "activity" floor here, unlike an
    // opportunity's created_at, since a client can be Active for months.
    const businessDaysSinceActivity = lastActivityAt ? businessDaysSince(lastActivityAt, now, 2) : 2;
    const status = deriveClientCampaignStatus(businessDaysSinceActivity);
    if (status === "Healthy") continue;
    results.push({
      clientId: client.id,
      companyName: client.company_name,
      assignedAgentNames: agentNamesByClient.get(client.id) ?? [],
      lastActivityAt,
      businessDaysSinceActivity,
      status,
    });
  }
  return results.sort((a, b) => b.businessDaysSinceActivity - a.businessDaysSinceActivity);
}

// ---------------------------------------------------------------------
// Dashboard card summary - the compact "Operations Monitoring" card's
// data, computed from the same detail-fetching functions above so the
// card's counts can never disagree with the detail page's own tabs.
// ---------------------------------------------------------------------
export async function fetchOperationsMonitoringSummary(admin: SupabaseClient): Promise<OperationsMonitoringSummary> {
  const [failures, staleLeads, appointmentRisks, callKpiAgents, dataQualityIssues, clientCampaigns] = await Promise.all([
    fetchCommunicationFailures(admin),
    fetchStaleOpportunities(admin),
    fetchAppointmentRisks(admin),
    fetchCallKpiAgents(admin),
    fetchDataQualityIssues(admin),
    fetchClientCampaignActivity(admin),
  ]);

  const commsStatus = deriveCommunicationMonitoringStatus(failures.length);
  const staleCounts = countByStatus(staleLeads.map((r) => r.status));
  const apptCounts = countByStatus(appointmentRisks.map((r) => r.monitoringStatus));
  const kpiCounts = countByStatus(callKpiAgents.map((r) => r.status));
  const dqStatus = deriveDataQualityStatus(dataQualityIssues.length);
  const campaignCounts = countByStatus(clientCampaigns.map((r) => r.status));
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
      status: worstMonitoringStatus(clientCampaigns.map((r) => r.status)),
      headline: clientCampaigns.length === 0 ? "Healthy" : `${clientCampaigns.length} campaigns`,
      actionRequiredCount: campaignCounts["Action Required"],
      warningCount: campaignCounts["Needs Attention"],
      healthyCount: 0,
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
// Agent-scoped alerts (agent dashboard "My Alerts") - reads through the
// session-scoped client so RLS (crm_opportunities_agent_select_own,
// winsalot_appointments_agent_select_own, etc) does the actual narrowing;
// never a service-role read, so an agent's session can only ever see
// their own opportunities/appointments here regardless of what this
// function requests.
// ---------------------------------------------------------------------
export async function fetchAgentOperationsAlerts(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ staleLeadCount: number; appointmentRiskCount: number }> {
  const [staleLeads, appointmentRisks] = await Promise.all([
    fetchStaleOpportunities(supabase, { agentId }),
    fetchAppointmentRisks(supabase, { agentId }),
  ]);
  return { staleLeadCount: staleLeads.length, appointmentRiskCount: appointmentRisks.length };
}

// Call KPI pace for one agent's own already-fetched Dialpad summary (the
// agent dashboard already loads this via loadDialpadAgentDashboardData for
// the Dialpad Performance card) - Dialpad rows are matched by name/email,
// not crm_users.id (see resolveIdentity in dialpad-report-data.ts), so
// this takes the summary the caller already resolved rather than trying
// to re-match it here.
export function computeMyCallKpiPace(totalCalls: number, periodStart: string, periodEnd: string, now: Date = new Date()): CallKpiAgentRecord {
  const totalBusinessDaysInPeriod = countBusinessDaysInclusive(periodStart, periodEnd);
  const elapsedBusinessDays = countBusinessDaysInclusive(periodStart, isoDateKey(now));
  const expected = expectedCallsByNow(CRM_WEEKLY_CALL_TARGET, totalBusinessDaysInPeriod, elapsedBusinessDays);
  const pace = deriveCallKpiPace(totalCalls, expected, isPastCallKpiCheckpoint(now));
  return {
    agentId: "me",
    agentName: "",
    callsInPeriod: totalCalls,
    weeklyTarget: CRM_WEEKLY_CALL_TARGET,
    periodStart,
    periodEnd,
    pace,
    status: callKpiPaceMonitoringStatus(pace),
  };
}
