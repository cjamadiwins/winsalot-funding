import "server-only";

import { getEmailReplyTo, getEmailSender } from "./email-senders";
import { getResendClient } from "./resend";
import { getSupabaseAdmin } from "./supabase-admin";
import { getCrmPerformanceRecords } from "./crm-performance-data";
import { crmDateKey } from "./crm-performance";
import { crmWeekStartsInMonth } from "./crm-performance-history";
import { leadgenCreditedAppointments, type LeadgenPerformanceAppointment } from "./leadgen-performance";
import { leadgenWeekStartsInMonth } from "./leadgen-performance-history";
import { countLeadgenAppointmentsInRange, type GrowthEmailRow, type GrowthFollowUpRow, type GrowthLeadOwnerRow, type ReportCallRow, type ReportFollowUpRow, type ReportLeadRow } from "./agent-performance-report-kpis";
import {
  countWeekdaysInclusive,
  renderAgentPerformanceEmail,
  renderAgentReportSection,
  type AgentReportSection,
} from "./agent-performance-report-email";
import { buildAgentReportSections } from "./agent-weekly-report-job";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";
const GROWTH_ADMIN_REPORT_URL = "https://growth.winsalotcorp.com/admin/crm/performance";
const LEADGEN_ADMIN_REPORT_URL = "https://leads.winsalotcorp.com/leadgen/admin/performance";

type AgentIdentity = { id: string; full_name: string | null; email: string };
type Recipient = { email: string; name: string; crmAgentId?: string; leadgenAgentId?: string };
type AgentSnapshot = { recipient: Recipient; sections: AgentReportSection[] };

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function previousMonth(now: Date): { year: number; month: number; start: string; end: string; label: string; key: string } {
  const today = crmDateKey(now);
  const [currentYear, currentMonth] = today.split("-").map(Number);
  const month = currentMonth === 1 ? 12 : currentMonth - 1;
  const year = currentMonth === 1 ? currentYear - 1 : currentYear;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year,
    month,
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`,
    label: new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1))),
    key: `${year}-${pad2(month)}`,
  };
}

export function isFirstWeekdayInToronto(now: Date = new Date()): boolean {
  const [year, month, day] = crmDateKey(now).split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return (day === 1 && weekday >= 1 && weekday <= 5) || ((day === 2 || day === 3) && weekday === 1);
}

function safe(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function buildAdminEmail(snapshots: AgentSnapshot[], monthLabel: string): { subject: string; html: string; text: string } {
  const cards = snapshots.map(({ recipient, sections }) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:18px;border:1px solid #dbe3ee;border-radius:12px"><tr><td style="padding:12px 14px;background:#f7f9fc"><strong style="font-size:16px;color:#10213f">${safe(recipient.name)}</strong><div style="font-size:12px;color:#52627a">${safe(recipient.email)}</div></td></tr><tr><td style="padding:0 12px 12px">${sections.map((section) => renderAgentReportSection({ ...section, href: section.title === "Growth CRM" ? GROWTH_ADMIN_REPORT_URL : LEADGEN_ADMIN_REPORT_URL })).join("")}</td></tr></table>`).join("");
  const text = [`Winsalot Corp. monthly agent performance summary — ${monthLabel}`, "", ...snapshots.flatMap(({ recipient, sections }) => [recipient.name, recipient.email, ...sections.flatMap((section) => [section.title, `Overall: ${section.overallPercentage}% — ${section.status}`, ...section.metrics.map((metric) => `${metric.label}: ${metric.result}`)]), ""])].join("\n");
  return {
    subject: `Admin summary: Monthly Agent Performance — ${monthLabel}`,
    html: `<!doctype html><html><body style="margin:0;background:#f1f4f8;font-family:Arial,Helvetica,sans-serif;color:#10213f"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4f8"><tr><td align="center" style="padding:18px 10px"><table role="presentation" width="720" style="width:100%;max-width:720px;background:#fff;padding:22px;border-radius:16px"><tr><td><img src="https://growth.winsalotcorp.com/winsalot-logo.png" alt="Winsalot Corp." width="175" style="max-width:100%;height:auto;border:0"></td></tr><tr><td><h1 style="font-size:24px;margin:16px 0 5px">Monthly Agent Performance Summary</h1><p style="color:#52627a;margin:0">Administrative overview for ${safe(monthLabel)}. Each agent received a separate private report.</p>${cards}<p style="font-size:12px;color:#52627a;text-align:center">Winsalot Corp. | Empowering Businesses, One Solution at a Time.</p></td></tr></table></td></tr></table></body></html>`,
    text,
  };
}

export async function runAgentMonthlyReportJob(options: { dryRun?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const reportMonth = previousMonth(now);
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

  const growthPeriodCount = crmWeekStartsInMonth(reportMonth.year, reportMonth.month).length;
  const leadgenWeekCount = leadgenWeekStartsInMonth(reportMonth.year, reportMonth.month).length;
  const validAppointments = (appointmentsResult.data ?? []) as LeadgenPerformanceAppointment[];
  const snapshots: AgentSnapshot[] = [];
  const results: Array<{ email: string; outcome: "sent" | "dry-run" | "failed"; resendId?: string; error?: string }> = [];
  const weekdays = countWeekdaysInclusive(reportMonth.start, reportMonth.end);

  for (const recipient of recipients.values()) {
    const leadgenBooked = recipient.leadgenAgentId
      ? countLeadgenAppointmentsInRange(leadgenCreditedAppointments(validAppointments, recipient.leadgenAgentId), recipient.leadgenAgentId, reportMonth.start, reportMonth.end)
      : undefined;
    const sections = buildAgentReportSections({
      crmAgentId: recipient.crmAgentId,
      leadgenAgentId: recipient.leadgenAgentId,
      start: reportMonth.start,
      end: reportMonth.end,
      growthRecords,
      leadgenAppointments: validAppointments,
      leadgenBooked,
      growthGoalWeeks: growthPeriodCount,
      leadgenGoalWeeks: leadgenWeekCount,
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
    const email = renderAgentPerformanceEmail({ recipientName: recipient.name, periodTitle: "Monthly Agent Performance", periodLabel: reportMonth.label, monthly: true, sections });
    const { data, error } = await getResendClient().emails.send({
      from: getEmailSender("growth"), to: recipient.email, replyTo: getEmailReplyTo(), subject: email.subject, html: email.html, text: email.text,
      tags: [{ name: "category", value: "agent-monthly-report" }, { name: "report_month", value: reportMonth.key }],
    }, { idempotencyKey: `agent-monthly-report-${reportMonth.key}-${recipient.email.replace(/[^a-z0-9]+/g, "-")}` });
    if (error) results.push({ email: recipient.email, outcome: "failed", error: error.message });
    else results.push({ email: recipient.email, outcome: "sent", resendId: data?.id });
  }

  const adminEmailAddress = (process.env.AGENT_REPORT_ADMIN_EMAIL || "info@winsalotcorp.com").trim().toLowerCase();
  const adminEmail = buildAdminEmail(snapshots, reportMonth.label);
  if (options.dryRun) results.push({ email: adminEmailAddress, outcome: "dry-run" });
  else {
    const { data, error } = await getResendClient().emails.send({
      from: getEmailSender("growth"), to: adminEmailAddress, replyTo: getEmailReplyTo(), subject: adminEmail.subject, html: adminEmail.html, text: adminEmail.text,
      tags: [{ name: "category", value: "admin-monthly-agent-summary" }, { name: "report_month", value: reportMonth.key }],
    }, { idempotencyKey: `admin-monthly-agent-summary-${reportMonth.key}` });
    if (error) results.push({ email: adminEmailAddress, outcome: "failed", error: error.message });
    else results.push({ email: adminEmailAddress, outcome: "sent", resendId: data?.id });
  }

  return { reportMonth: reportMonth.key, workingDays: weekdays, growthGoalWeeks: growthPeriodCount, leadgenGoalWeeks: leadgenWeekCount, agentRecipientCount: recipients.size, adminRecipient: adminEmailAddress, recipientCount: recipients.size + 1, sent: results.filter((result) => result.outcome === "sent").length, failed: results.filter((result) => result.outcome === "failed").length, dryRun: !!options.dryRun, results };
}
