import "server-only";

import { getEmailReplyTo, getEmailSender } from "./email-senders";
import { getResendClient } from "./resend";
import { getSupabaseAdmin } from "./supabase-admin";
import { getCrmPerformanceRecords } from "./crm-performance-data";
import {
  CRM_PERFORMANCE_TIER_LABEL,
  CRM_WEEKLY_CONSULTATIONS_TARGET,
  CRM_WEEKLY_EMAILS_DELIVERED_TARGET,
  CRM_WEEKLY_LEADS_ADDED_TARGET,
  computeCrmPeriodPerformance,
  crmDateKey,
  crmPerformanceTier,
  crmWeekStartOf,
  crmWeeklyRangeLabel,
} from "./crm-performance";
import {
  LEADGEN_PERFORMANCE_TIER_LABEL,
  LEADGEN_WEEKLY_APPOINTMENT_TARGET,
  computeLeadgenAgentPerformance,
  leadgenDateKey,
  leadgenPerformanceTier,
  type LeadgenPerformanceAppointment,
} from "./leadgen-performance";
import { LEADGEN_DAILY_CALL_TARGET, LEADGEN_DAILY_EMAIL_TARGET } from "./leadgen-agent-kpi";
import {
  computeGrowthReportActivity,
  computeLeadgenReportActivity,
  type GrowthEmailRow,
  type GrowthFollowUpRow,
  type GrowthLeadOwnerRow,
  type ReportCallRow,
  type ReportEmailRow,
  type ReportFollowUpRow,
  type ReportLeadRow,
} from "./agent-performance-report-kpis";
import {
  countWeekdaysInclusive,
  renderAgentPerformanceEmail,
  renderAgentReportSection,
  type AgentReportSection,
} from "./agent-performance-report-email";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";
const GROWTH_AGENT_REPORT_URL = "https://growth.winsalotcorp.com/agent/performance";
const LEADGEN_AGENT_REPORT_URL = "https://leads.winsalotcorp.com/leadgen/agent/performance";
const GROWTH_ADMIN_REPORT_URL = "https://growth.winsalotcorp.com/admin/crm/performance";
const LEADGEN_ADMIN_REPORT_URL = "https://leads.winsalotcorp.com/leadgen/admin/performance";
const GROWTH_DAILY_CALL_TARGET = 80;

type AgentIdentity = { id: string; full_name: string | null; email: string };
type Recipient = { email: string; name: string; crmAgentId?: string; leadgenAgentId?: string };
type AgentSnapshot = { recipient: Recipient; sections: AgentReportSection[] };

function pct(value: number, goal: number): number {
  return goal > 0 ? Math.round((value / goal) * 100) : 0;
}

function safe(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

export function isFridayInToronto(now: Date = new Date()): boolean {
  const key = crmDateKey(now);
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() === 5;
}

export function buildAgentReportSections(input: {
  crmAgentId?: string;
  leadgenAgentId?: string;
  start: string;
  end: string;
  growthRecords: Awaited<ReturnType<typeof getCrmPerformanceRecords>>;
  leadgenAppointments: LeadgenPerformanceAppointment[];
  growthCallLogs: ReportCallRow[];
  callLogs: ReportCallRow[];
  leadgenEmails: ReportEmailRow[];
  leadgenFollowUps: ReportFollowUpRow[];
  leadgenLeads: ReportLeadRow[];
  growthEmails: GrowthEmailRow[];
  growthFollowUps: GrowthFollowUpRow[];
  growthLeads: GrowthLeadOwnerRow[];
  growthGoalWeeks?: number;
  leadgenGoalWeeks?: number;
  leadgenBooked?: number;
}): AgentReportSection[] {
  const workingDays = countWeekdaysInclusive(input.start, input.end);
  const growthGoalWeeks = input.growthGoalWeeks ?? 1;
  const leadgenGoalWeeks = input.leadgenGoalWeeks ?? 1;
  const sections: AgentReportSection[] = [];

  if (input.crmAgentId) {
    const growth = computeCrmPeriodPerformance(input.growthRecords, input.crmAgentId, input.start, input.end);
    const consultationGoal = CRM_WEEKLY_CONSULTATIONS_TARGET * growthGoalWeeks;
    const leadGoal = CRM_WEEKLY_LEADS_ADDED_TARGET * growthGoalWeeks;
    const deliveredGoal = CRM_WEEKLY_EMAILS_DELIVERED_TARGET * growthGoalWeeks;
    const consultationRate = Math.min(100, pct(growth.consultationsBooked, consultationGoal));
    const leadRate = Math.min(100, pct(growth.leadsAdded, leadGoal));
    const deliveredRate = Math.min(100, pct(growth.emailsDelivered, deliveredGoal));
    const growthScore = Math.round((consultationRate + leadRate + deliveredRate) / 3);
    const activity = computeGrowthReportActivity({
      agentId: input.crmAgentId,
      start: input.start,
      end: input.end,
      calls: input.growthCallLogs,
      emails: input.growthEmails,
      followUps: input.growthFollowUps,
      leads: input.growthLeads,
      opportunityOwners: new Map(input.growthRecords.map((record) => [record.opportunityId, record.assignedAgentId] as const)),
    });
    sections.push({
      title: "Growth CRM",
      overallPercentage: growthScore,
      status: CRM_PERFORMANCE_TIER_LABEL[crmPerformanceTier(growthScore)],
      href: GROWTH_AGENT_REPORT_URL,
      metrics: [
        { label: "Calls completed (CRM call logs)", result: activity.calls, goal: GROWTH_DAILY_CALL_TARGET * workingDays, rate: pct(activity.calls, GROWTH_DAILY_CALL_TARGET * workingDays) },
        { label: "Consultations booked", result: growth.consultationsBooked, goal: consultationGoal, rate: consultationRate },
        { label: "Opportunity leads added", result: growth.leadsAdded, goal: leadGoal, rate: leadRate },
        { label: "Emails sent", result: activity.emailsSent, goal: null, rate: null, informational: true },
        { label: "Emails delivered", result: growth.emailsDelivered, goal: deliveredGoal, rate: deliveredRate },
        { label: "Email delivery rate", result: activity.emailDeliveryRate == null ? "—" : `${activity.emailDeliveryRate}%`, goal: null, rate: activity.emailDeliveryRate, informational: true },
        { label: "Follow-ups due", result: activity.followUpsDue, goal: null, rate: null, informational: true },
      ],
    });
  }

  if (input.leadgenAgentId) {
    const leadgen = computeLeadgenAgentPerformance(input.leadgenAppointments, input.leadgenAgentId, new Date(`${input.end}T12:00:00Z`));
    const activity = computeLeadgenReportActivity({
      agentId: input.leadgenAgentId,
      start: input.start,
      end: input.end,
      calls: input.callLogs,
      emails: input.leadgenEmails,
      followUps: input.leadgenFollowUps,
      leads: input.leadgenLeads,
    });
    const booked = input.leadgenBooked ?? leadgen.bookedThisWeek;
    const appointmentGoal = LEADGEN_WEEKLY_APPOINTMENT_TARGET * leadgenGoalWeeks;
    const appointmentRate = input.leadgenBooked === undefined ? leadgen.percentage : pct(booked, appointmentGoal);
    const emailGoal = LEADGEN_DAILY_EMAIL_TARGET * workingDays;
    sections.push({
      title: "Lead Generation CRM",
      overallPercentage: appointmentRate,
      status: LEADGEN_PERFORMANCE_TIER_LABEL[leadgenPerformanceTier(appointmentRate)],
      href: LEADGEN_AGENT_REPORT_URL,
      metrics: [
        { label: "Calls completed", result: activity.calls, goal: LEADGEN_DAILY_CALL_TARGET * workingDays, rate: pct(activity.calls, LEADGEN_DAILY_CALL_TARGET * workingDays) },
        { label: "Emails sent", result: activity.emailsSent, goal: emailGoal, rate: pct(activity.emailsSent, emailGoal) },
        { label: "Emails delivered", result: activity.emailsDelivered, goal: null, rate: null, informational: true },
        { label: "Email delivery rate", result: activity.emailDeliveryRate == null ? "—" : `${activity.emailDeliveryRate}%`, goal: null, rate: activity.emailDeliveryRate, informational: true },
        { label: "Interested / qualified leads", result: activity.interestedLeads, goal: null, rate: null, informational: true },
        { label: "Follow-ups due", result: activity.followUpsDue, goal: null, rate: null, informational: true },
        { label: "Appointments booked", result: booked, goal: appointmentGoal, rate: appointmentRate },
      ],
    });
  }
  return sections;
}

function buildAdminEmail(snapshots: AgentSnapshot[], rangeLabel: string): { subject: string; html: string; text: string } {
  const cards = snapshots.map(({ recipient, sections }) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:18px;border:1px solid #dbe3ee;border-radius:12px"><tr><td style="padding:12px 14px;background:#f7f9fc"><strong style="font-size:16px;color:#10213f">${safe(recipient.name)}</strong><div style="font-size:12px;color:#52627a">${safe(recipient.email)}</div></td></tr><tr><td style="padding:0 12px 12px">${sections.map((section) => renderAgentReportSection({ ...section, href: section.title === "Growth CRM" ? GROWTH_ADMIN_REPORT_URL : LEADGEN_ADMIN_REPORT_URL })).join("")}</td></tr></table>`).join("");
  const text = [`Winsalot Corp. weekly agent performance summary — ${rangeLabel}`, "", ...snapshots.flatMap(({ recipient, sections }) => [recipient.name, recipient.email, ...sections.flatMap((section) => [section.title, `Overall: ${section.overallPercentage}% — ${section.status}`, ...section.metrics.map((metric) => `${metric.label}: ${metric.result}`)]), ""])].join("\n");
  return {
    subject: `Admin summary: Weekly Agent Performance — ${rangeLabel}`,
    html: `<!doctype html><html><body style="margin:0;background:#f1f4f8;font-family:Arial,Helvetica,sans-serif;color:#10213f"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4f8"><tr><td align="center" style="padding:18px 10px"><table role="presentation" width="720" style="width:100%;max-width:720px;background:#fff;padding:22px;border-radius:16px"><tr><td><img src="https://growth.winsalotcorp.com/winsalot-logo.png" alt="Winsalot Corp." width="175" style="max-width:100%;height:auto;border:0"></td></tr><tr><td><h1 style="font-size:24px;margin:16px 0 5px">Weekly Agent Performance Summary</h1><p style="color:#52627a;margin:0">All active agents for ${safe(rangeLabel)}. Each agent received a separate private report.</p>${cards}<p style="font-size:12px;color:#52627a;text-align:center">Winsalot Corp. | Empowering Businesses, One Solution at a Time.</p></td></tr></table></td></tr></table></body></html>`,
    text,
  };
}

export async function runAgentWeeklyReportJob(options: { dryRun?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const admin = getSupabaseAdmin();
  const [agentsResult, leadgenAgentsResult, growthRecords, appointmentsResult, growthCallLogsResult, callLogsResult, leadgenEmailsResult, leadgenFollowUpsResult, leadgenLeadsResult, growthEmailsResult, growthFollowUpsResult, growthLeadsResult] = await Promise.all([
    admin.from("crm_users").select("id, full_name, email").eq("role", "agent").eq("active", true),
    admin.from("leadgen_users").select("id, full_name, email").eq("role", "agent").eq("active", true).neq("email", DEACTIVATED_TEST_AGENT_EMAIL),
    getCrmPerformanceRecords(),
    admin.from("leadgen_appointments").select("id, lead_id, business_name, contact_name, appointment_date, appointment_time, status, created_at, booking_agent_id"),
    admin.from("crm_call_logs").select("agent_id, created_at"),
    admin.from("leadgen_call_logs").select("agent_id, created_at"),
    admin.from("leadgen_emails").select("sent_by, sent_at, delivered_at, bounced_at, failed_at").not("sent_by", "is", null),
    admin.from("leadgen_followups").select("agent_id, scheduled_at, status"),
    admin.from("leadgen_leads").select("assigned_agent_id, status, created_at"),
    admin.from("crm_lead_emails").select("agent_id, sent_at, delivered_at").in("email_type", ["follow_up", "consultation_invite"]).not("agent_id", "is", null),
    admin.from("crm_followups").select("lead_id, opportunity_id, scheduled_at, status").eq("status", "pending"),
    admin.from("crm_leads").select("id, assigned_agent_id"),
  ]);

  const recipients = new Map<string, Recipient>();
  for (const agent of (agentsResult.data ?? []) as AgentIdentity[]) {
    const email = agent.email.trim().toLowerCase();
    if (email) recipients.set(email, { email, name: agent.full_name || agent.email, crmAgentId: agent.id });
  }
  for (const agent of (leadgenAgentsResult.data ?? []) as AgentIdentity[]) {
    const email = agent.email.trim().toLowerCase();
    if (!email) continue;
    const current = recipients.get(email);
    recipients.set(email, { email, name: current?.name || agent.full_name || agent.email, crmAgentId: current?.crmAgentId, leadgenAgentId: agent.id });
  }

  const records = growthRecords;
  const allAppointments = appointmentsResult.data ?? [];
  const dateKey = crmDateKey(now);
  const weekStart = crmWeekStartOf(dateKey);
  const [year, month, day] = weekStart.split("-").map(Number);
  const weekEndDate = new Date(Date.UTC(year, month - 1, day + 4));
  const weekEnd = `${weekEndDate.getUTCFullYear()}-${String(weekEndDate.getUTCMonth() + 1).padStart(2, "0")}-${String(weekEndDate.getUTCDate()).padStart(2, "0")}`;
  const rangeLabel = crmWeeklyRangeLabel(weekStart, weekEnd);
  const snapshots: AgentSnapshot[] = [];
  const results: Array<{ email: string; outcome: "sent" | "dry-run" | "failed"; resendId?: string; error?: string }> = [];

  for (const recipient of recipients.values()) {
    const sections = buildAgentReportSections({
      crmAgentId: recipient.crmAgentId,
      leadgenAgentId: recipient.leadgenAgentId,
      start: weekStart,
      end: weekEnd,
      growthRecords: records,
      leadgenAppointments: allAppointments,
      growthCallLogs: (growthCallLogsResult.data ?? []) as ReportCallRow[],
      callLogs: (callLogsResult.data ?? []) as ReportCallRow[],
      leadgenEmails: (leadgenEmailsResult.data ?? []).map((row) => ({ agent_id: row.sent_by, sent_at: row.sent_at, delivered_at: row.delivered_at })),
      leadgenFollowUps: (leadgenFollowUpsResult.data ?? []) as ReportFollowUpRow[],
      leadgenLeads: (leadgenLeadsResult.data ?? []) as ReportLeadRow[],
      growthEmails: (growthEmailsResult.data ?? []) as GrowthEmailRow[],
      growthFollowUps: (growthFollowUpsResult.data ?? []) as GrowthFollowUpRow[],
      growthLeads: (growthLeadsResult.data ?? []) as GrowthLeadOwnerRow[],
    });
    snapshots.push({ recipient, sections });
    if (options.dryRun) {
      results.push({ email: recipient.email, outcome: "dry-run" });
      continue;
    }
    const email = renderAgentPerformanceEmail({ recipientName: recipient.name, periodTitle: "Weekly Agent Performance", periodLabel: rangeLabel, sections });
    const { data, error } = await getResendClient().emails.send({
      from: getEmailSender("growth"), to: recipient.email, replyTo: getEmailReplyTo(), subject: email.subject, html: email.html, text: email.text,
      tags: [{ name: "category", value: "agent-weekly-report" }, { name: "report_week", value: weekStart }],
    }, { idempotencyKey: `agent-weekly-report-${weekStart}-${recipient.email.replace(/[^a-z0-9]+/g, "-")}` });
    if (error) results.push({ email: recipient.email, outcome: "failed", error: error.message });
    else results.push({ email: recipient.email, outcome: "sent", resendId: data?.id });
  }

  const adminEmailAddress = (process.env.AGENT_REPORT_ADMIN_EMAIL || "info@winsalotcorp.com").trim().toLowerCase();
  const adminEmail = buildAdminEmail(snapshots, rangeLabel);
  if (options.dryRun) results.push({ email: adminEmailAddress, outcome: "dry-run" });
  else {
    const { data, error } = await getResendClient().emails.send({
      from: getEmailSender("growth"), to: adminEmailAddress, replyTo: getEmailReplyTo(), subject: adminEmail.subject, html: adminEmail.html, text: adminEmail.text,
      tags: [{ name: "category", value: "admin-weekly-agent-summary" }, { name: "report_week", value: weekStart }],
    }, { idempotencyKey: `admin-weekly-agent-summary-${weekStart}` });
    if (error) results.push({ email: adminEmailAddress, outcome: "failed", error: error.message });
    else results.push({ email: adminEmailAddress, outcome: "sent", resendId: data?.id });
  }

  return { reportDate: leadgenDateKey(now), weekStart, weekEnd, agentRecipientCount: recipients.size, adminRecipient: adminEmailAddress, recipientCount: recipients.size + 1, sent: results.filter((result) => result.outcome === "sent").length, failed: results.filter((result) => result.outcome === "failed").length, dryRun: !!options.dryRun, results };
}
