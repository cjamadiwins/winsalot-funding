import "server-only";

import { getEmailReplyTo, getEmailSender } from "./email-senders";
import { getResendClient } from "./resend";
import { getSupabaseAdmin } from "./supabase-admin";
import { getCrmPerformanceRecords } from "./crm-performance-data";
import {
  CRM_BIWEEKLY_APPLICATIONS_TARGET,
  CRM_BIWEEKLY_CONSULTATIONS_TARGET,
  CRM_BIWEEKLY_PROPOSALS_TARGET,
  CRM_BIWEEKLY_QUALIFIED_TARGET,
  CRM_BIWEEKLY_WON_TARGET,
  computeCrmPeriodPerformance,
  crmDateKey,
} from "./crm-performance";
import { crmPeriodStartsInMonth } from "./crm-performance-history";
import {
  LEADGEN_WEEKLY_APPOINTMENT_TARGET,
  leadgenCreditedAppointments,
  leadgenDateKey,
} from "./leadgen-performance";
import { leadgenWeekStartsInMonth } from "./leadgen-performance-history";
import type { LeadgenPerformanceAppointment } from "./leadgen-performance";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

type AgentIdentity = {
  id: string;
  full_name: string | null;
  email: string;
};

type Recipient = {
  email: string;
  name: string;
  crmAgentId?: string;
  leadgenAgentId?: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function previousMonth(now: Date): { year: number; month: number; start: string; end: string; label: string; key: string } {
  const today = crmDateKey(now);
  const [currentYear, currentMonth] = today.split("-").map(Number);
  const month = currentMonth === 1 ? 12 : currentMonth - 1;
  const year = currentMonth === 1 ? currentYear - 1 : currentYear;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
  return {
    year,
    month,
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`,
    label,
    key: `${year}-${pad2(month)}`,
  };
}

export function isFirstWeekdayInToronto(now: Date = new Date()): boolean {
  const [year, month, day] = crmDateKey(now).split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return (day === 1 && weekday >= 1 && weekday <= 5) || ((day === 2 || day === 3) && weekday === 1);
}

function pct(value: number, goal: number): number {
  return goal > 0 ? Math.round((value / goal) * 100) : 0;
}

function statusLabel(percentage: number): string {
  if (percentage >= 70) return "On Track";
  if (percentage >= 40) return "Needs Improvement";
  return "Behind Target";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[character] ?? character;
  });
}

function metricRow(label: string, value: number, goal: number): string {
  return `<tr><td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;color:#334155">${escapeHtml(label)}</td><td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#0f172a">${value}</td><td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">${goal}</td><td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#2563eb">${pct(value, goal)}%</td></tr>`;
}

function section(title: string, rows: string, summary: string, link: string): string {
  return `<div style="margin-top:24px;border:1px solid #dbe4ee;border-radius:14px;overflow:hidden"><div style="padding:14px 16px;background:#f8fafc"><div style="font-size:17px;font-weight:800;color:#0f172a">${escapeHtml(title)}</div><div style="margin-top:4px;font-size:13px;color:#475569">${escapeHtml(summary)}</div></div><table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#fff"><th style="padding:9px 10px;text-align:left;color:#64748b">Metric</th><th style="padding:9px 10px;color:#64748b">Result</th><th style="padding:9px 10px;color:#64748b">Goal</th><th style="padding:9px 10px;color:#64748b">Rate</th></tr></thead><tbody>${rows}</tbody></table><div style="padding:12px 16px"><a href="${link}" style="color:#2563eb;font-weight:700;text-decoration:none">View full report →</a></div></div>`;
}

function buildEmail(input: {
  recipient: Recipient;
  monthLabel: string;
  growth?: { consultations: number; qualified: number; applications: number; proposals: number; won: number; periodCount: number };
  leadgen?: { booked: number; weekCount: number };
}): { subject: string; html: string; text: string } {
  const greetingName = input.recipient.name.trim().split(/\s+/)[0] || "Agent";
  let sections = "";
  const textLines = [`Hi ${greetingName},`, "", `Here is your Winsalot monthly performance report for ${input.monthLabel}.`, ""];

  if (input.growth) {
    const g = input.growth;
    const goals = {
      consultations: CRM_BIWEEKLY_CONSULTATIONS_TARGET * g.periodCount,
      qualified: CRM_BIWEEKLY_QUALIFIED_TARGET * g.periodCount,
      applications: CRM_BIWEEKLY_APPLICATIONS_TARGET * g.periodCount,
      proposals: CRM_BIWEEKLY_PROPOSALS_TARGET * g.periodCount,
      won: CRM_BIWEEKLY_WON_TARGET * g.periodCount,
    };
    const overall = Math.round(
      [pct(g.consultations, goals.consultations), pct(g.qualified, goals.qualified), pct(g.applications, goals.applications), pct(g.proposals, goals.proposals), pct(g.won, goals.won)]
        .map((value) => Math.min(100, value))
        .reduce((sum, value) => sum + value, 0) / 5
    );
    sections += section(
      "Growth CRM",
      metricRow("Consultations booked", g.consultations, goals.consultations) +
        metricRow("Qualified opportunities", g.qualified, goals.qualified) +
        metricRow("Applications submitted", g.applications, goals.applications) +
        metricRow("Proposals sent", g.proposals, goals.proposals) +
        metricRow("Clients won", g.won, goals.won),
      `Overall: ${overall}% — ${statusLabel(overall)}`,
      "https://growth.winsalotcorp.com/agent/performance/monthly"
    );
    textLines.push("Growth CRM", `Consultations: ${g.consultations}/${goals.consultations}`, `Qualified opportunities: ${g.qualified}/${goals.qualified}`, `Applications: ${g.applications}/${goals.applications}`, `Proposals: ${g.proposals}/${goals.proposals}`, `Clients won: ${g.won}/${goals.won}`, `Overall: ${overall}% — ${statusLabel(overall)}`, "");
  }

  if (input.leadgen) {
    const l = input.leadgen;
    const goal = LEADGEN_WEEKLY_APPOINTMENT_TARGET * l.weekCount;
    const percentage = pct(l.booked, goal);
    sections += section(
      "Lead Generation CRM",
      metricRow("Appointments booked", l.booked, goal),
      `Overall: ${percentage}% — ${statusLabel(percentage)}`,
      "https://leads.winsalotcorp.com/leadgen/agent/performance/monthly"
    );
    textLines.push("Lead Generation CRM", `Appointments booked: ${l.booked}/${goal}`, `Overall: ${percentage}% — ${statusLabel(percentage)}`, "");
  }

  textLines.push("Thank you for your work.", "Winsalot Corp.");

  return {
    subject: `Your Winsalot performance report — ${input.monthLabel}`,
    html: `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:680px;margin:0 auto;padding:28px 14px"><div style="background:#ffffff;border-radius:18px;padding:28px;box-shadow:0 2px 8px rgba(15,23,42,.08)"><div style="font-size:13px;font-weight:800;letter-spacing:.08em;color:#2563eb">WINSALOT CORP.</div><h1 style="margin:10px 0 8px;font-size:25px">Monthly Agent Performance</h1><p style="margin:0;color:#475569">Hi ${escapeHtml(greetingName)}, here is your private performance report for <strong>${escapeHtml(input.monthLabel)}</strong>.</p>${sections}<p style="margin:24px 0 0;color:#475569;font-size:13px">Thank you for your work.<br><strong>Winsalot Corp.</strong></p></div></div></body></html>`,
    text: textLines.join("\n"),
  };
}

export async function runAgentMonthlyReportJob(options: { dryRun?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const reportMonth = previousMonth(now);
  const admin = getSupabaseAdmin();

  const [{ data: crmAgents }, { data: leadgenAgents }, recordsResult, { data: appointments }] = await Promise.all([
    admin.from("crm_users").select("id, full_name, email").eq("role", "agent").eq("active", true),
    admin.from("leadgen_users").select("id, full_name, email").eq("role", "agent").eq("active", true).neq("email", DEACTIVATED_TEST_AGENT_EMAIL),
    getCrmPerformanceRecords(),
    admin.from("leadgen_appointments").select("id, business_name, contact_name, appointment_date, appointment_time, status, created_at, booking_agent_id"),
  ]);

  const recipients = new Map<string, Recipient>();
  for (const agent of (crmAgents ?? []) as AgentIdentity[]) {
    const email = agent.email.trim().toLowerCase();
    if (!email) continue;
    recipients.set(email, { email, name: agent.full_name || agent.email, crmAgentId: agent.id });
  }
  for (const agent of (leadgenAgents ?? []) as AgentIdentity[]) {
    const email = agent.email.trim().toLowerCase();
    if (!email) continue;
    const current = recipients.get(email);
    recipients.set(email, { email, name: current?.name || agent.full_name || agent.email, crmAgentId: current?.crmAgentId, leadgenAgentId: agent.id });
  }

  const records = recordsResult;
  const allAppointments = (appointments ?? []) as LeadgenPerformanceAppointment[];
  const growthPeriodCount = crmPeriodStartsInMonth(reportMonth.year, reportMonth.month).length;
  const leadgenWeekCount = leadgenWeekStartsInMonth(reportMonth.year, reportMonth.month).length;
  const results: Array<{ email: string; outcome: "sent" | "dry-run" | "failed"; resendId?: string; error?: string }> = [];

  for (const recipient of recipients.values()) {
    const growthPeriod = recipient.crmAgentId
      ? computeCrmPeriodPerformance(records, recipient.crmAgentId, reportMonth.start, reportMonth.end)
      : undefined;
    const leadgenBooked = recipient.leadgenAgentId
      ? leadgenCreditedAppointments(allAppointments, recipient.leadgenAgentId).filter((appointment) => {
          const date = leadgenDateKey(appointment.created_at);
          return date >= reportMonth.start && date <= reportMonth.end;
        }).length
      : undefined;

    const email = buildEmail({
      recipient,
      monthLabel: reportMonth.label,
      growth: growthPeriod
        ? {
            consultations: growthPeriod.consultationsBooked,
            qualified: growthPeriod.qualifiedOpportunities,
            applications: growthPeriod.applicationsSubmitted,
            proposals: growthPeriod.proposalsSent,
            won: growthPeriod.clientsWon,
            periodCount: growthPeriodCount,
          }
        : undefined,
      leadgen: leadgenBooked === undefined ? undefined : { booked: leadgenBooked, weekCount: leadgenWeekCount },
    });

    if (options.dryRun) {
      results.push({ email: recipient.email, outcome: "dry-run" });
      continue;
    }

    const { data, error } = await getResendClient().emails.send(
      {
        from: getEmailSender("growth"),
        to: recipient.email,
        replyTo: getEmailReplyTo(),
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [
          { name: "category", value: "agent-monthly-report" },
          { name: "report_month", value: reportMonth.key },
        ],
      },
      { idempotencyKey: `agent-monthly-report-${reportMonth.key}-${recipient.email.replace(/[^a-z0-9]+/g, "-")}` }
    );

    if (error) results.push({ email: recipient.email, outcome: "failed", error: error.message });
    else results.push({ email: recipient.email, outcome: "sent", resendId: data?.id });
  }

  return {
    reportMonth: reportMonth.key,
    recipientCount: recipients.size,
    sent: results.filter((result) => result.outcome === "sent").length,
    failed: results.filter((result) => result.outcome === "failed").length,
    dryRun: !!options.dryRun,
    results,
  };
}
