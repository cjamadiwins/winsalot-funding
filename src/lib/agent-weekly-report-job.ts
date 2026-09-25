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
  computeCrmAgentPerformance,
  crmDateKey,
  crmPerformanceTier,
  crmWeeklyRangeLabel,
} from "./crm-performance";
import {
  LEADGEN_PERFORMANCE_TIER_LABEL,
  LEADGEN_WEEKLY_APPOINTMENT_TARGET,
  computeLeadgenAgentPerformance,
  leadgenDateKey,
  leadgenPerformanceTier,
  leadgenWeekRangeLabel,
  type LeadgenPerformanceAppointment,
} from "./leadgen-performance";
import {
  LEADGEN_WEEKLY_CALL_TARGET,
  LEADGEN_WEEKLY_EMAIL_TARGET,
  computeLeadgenAgentActivityKpis,
  type LeadgenKpiCallLogRow,
  type LeadgenKpiEmailRow,
} from "./leadgen-agent-kpi";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";
const LOGO_URL = "https://growth.winsalotcorp.com/winsalot-logo.png";

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

type WeeklyAgentSnapshot = {
  recipient: Recipient;
  growth?: ReturnType<typeof computeCrmAgentPerformance>["current"];
  leadgen?: ReturnType<typeof computeLeadgenAgentPerformance>;
  leadgenActivity?: ReturnType<typeof computeLeadgenAgentActivityKpis>;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[character] ?? character;
  });
}

function metricRow(label: string, result: number, goal: number, rate: number): string {
  return `<tr>
    <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#334155">${escapeHtml(label)}</td>
    <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#0f172a">${result}</td>
    <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">${goal}</td>
    <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#2563eb">${rate}%</td>
  </tr>`;
}

function section(title: string, summary: string, rows: string, href: string): string {
  return `<div style="margin-top:22px;border:1px solid #dbe4ee;border-radius:14px;overflow:hidden">
    <div style="padding:14px 16px;background:#f8fafc">
      <div style="font-size:17px;font-weight:800;color:#0f172a">${escapeHtml(title)}</div>
      <div style="margin-top:4px;font-size:13px;color:#475569">${escapeHtml(summary)}</div>
    </div>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr>
        <th style="padding:9px 10px;text-align:left;color:#64748b">Metric</th>
        <th style="padding:9px 10px;color:#64748b">Result</th>
        <th style="padding:9px 10px;color:#64748b">Goal</th>
        <th style="padding:9px 10px;color:#64748b">Rate</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="padding:12px 16px"><a href="${href}" style="color:#2563eb;font-weight:700;text-decoration:none">View full report →</a></div>
  </div>`;
}

export function isFridayInToronto(now: Date = new Date()): boolean {
  const key = crmDateKey(now);
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() === 5;
}

function buildEmail(input: {
  recipient: Recipient;
  growth?: ReturnType<typeof computeCrmAgentPerformance>["current"];
  leadgen?: ReturnType<typeof computeLeadgenAgentPerformance>;
  leadgenActivity?: ReturnType<typeof computeLeadgenAgentActivityKpis>;
}): { subject: string; html: string; text: string } {
  const greetingName = input.recipient.name.trim().split(/\s+/)[0] || "Agent";
  const weekStart = input.growth?.periodStart ?? input.leadgen?.weekStart ?? crmDateKey(new Date());
  const weekEnd = input.growth?.periodEnd ?? input.leadgen?.weekEnd ?? weekStart;
  const rangeLabel = input.growth
    ? crmWeeklyRangeLabel(weekStart, weekEnd)
    : input.leadgen
      ? leadgenWeekRangeLabel(weekStart, weekEnd)
      : weekStart;

  let sections = "";
  const textLines = [
    `Hi ${greetingName},`,
    "",
    `Here is your Winsalot weekly performance report for ${rangeLabel}.`,
    "",
  ];

  if (input.growth) {
    const g = input.growth;
    const status = CRM_PERFORMANCE_TIER_LABEL[crmPerformanceTier(g.overallPercentage)];
    sections += section(
      "Growth CRM",
      `Overall: ${g.overallPercentage}% — ${status}`,
      metricRow("Consultations booked", g.consultationsBooked, CRM_WEEKLY_CONSULTATIONS_TARGET, g.consultationsPercentage) +
        metricRow("Opportunity leads added", g.leadsAdded, CRM_WEEKLY_LEADS_ADDED_TARGET, g.leadsAddedPercentage) +
        metricRow("Emails delivered", g.emailsDelivered, CRM_WEEKLY_EMAILS_DELIVERED_TARGET, g.emailsDeliveredPercentage),
      "https://growth.winsalotcorp.com/agent/performance"
    );
    textLines.push(
      "Growth CRM",
      `Consultations booked: ${g.consultationsBooked}/${CRM_WEEKLY_CONSULTATIONS_TARGET}`,
      `Opportunity leads added: ${g.leadsAdded}/${CRM_WEEKLY_LEADS_ADDED_TARGET}`,
      `Emails delivered: ${g.emailsDelivered}/${CRM_WEEKLY_EMAILS_DELIVERED_TARGET}`,
      `Overall: ${g.overallPercentage}% — ${status}`,
      ""
    );
  }

  if (input.leadgen) {
    const l = input.leadgen;
    const status = LEADGEN_PERFORMANCE_TIER_LABEL[leadgenPerformanceTier(l.percentage)];
    sections += section(
      "Lead Generation CRM",
      `Overall: ${l.percentage}% — ${status}`,
      metricRow("Appointments booked", l.bookedThisWeek, LEADGEN_WEEKLY_APPOINTMENT_TARGET, l.percentage) +
        (input.leadgenActivity
          ? metricRow("Calls logged", input.leadgenActivity.callsThisWeek, LEADGEN_WEEKLY_CALL_TARGET, input.leadgenActivity.weeklyCallProgressPct) +
            metricRow("Emails sent", input.leadgenActivity.emailsThisWeek, LEADGEN_WEEKLY_EMAIL_TARGET, input.leadgenActivity.weeklyEmailProgressPct)
          : ""),
      "https://leads.winsalotcorp.com/leadgen/agent/performance"
    );
    textLines.push(
      "Lead Generation CRM",
      `Appointments booked: ${l.bookedThisWeek}/${LEADGEN_WEEKLY_APPOINTMENT_TARGET}`,
      ...(input.leadgenActivity
        ? [
            `Calls logged: ${input.leadgenActivity.callsThisWeek}/${LEADGEN_WEEKLY_CALL_TARGET}`,
            `Emails sent: ${input.leadgenActivity.emailsThisWeek}/${LEADGEN_WEEKLY_EMAIL_TARGET}`,
          ]
        : []),
      `Overall: ${l.percentage}% — ${status}`,
      ""
    );
  }

  textLines.push(
    "Keep your follow-ups current, focus on qualified decision-makers, and work toward the weekly targets.",
    "",
    "Thank you for your work.",
    "Winsalot Corp."
  );

  return {
    subject: `Your Winsalot weekly performance report — ${rangeLabel}`,
    html: `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:680px;margin:0 auto;padding:28px 14px">
        <div style="background:#ffffff;border-radius:18px;padding:28px;box-shadow:0 2px 8px rgba(15,23,42,.08)">
          <div style="text-align:center;margin-bottom:18px">
            <img src="${LOGO_URL}" alt="Winsalot Corp." width="150" style="display:inline-block;max-width:150px;height:auto;border:0" />
          </div>
          <h1 style="margin:0 0 8px;font-size:25px;text-align:center">Weekly Agent Performance</h1>
          <p style="margin:0;text-align:center;color:#475569">Hi ${escapeHtml(greetingName)}, here is your private performance report for <strong>${escapeHtml(rangeLabel)}</strong>.</p>
          ${sections}
          <div style="margin-top:22px;padding:14px 16px;border-radius:12px;background:#eff6ff;color:#1e3a8a;font-size:13px">
            Keep your follow-ups current, focus on qualified decision-makers, and work toward the weekly targets.
          </div>
          <p style="margin:24px 0 0;color:#475569;font-size:13px">Thank you for your work.<br><strong>Winsalot Corp.</strong><br>Empowering Businesses, One Solution at a Time.</p>
        </div>
      </div>
    </body></html>`,
    text: textLines.join("\n"),
  };
}


function buildAdminEmail(input: {
  snapshots: WeeklyAgentSnapshot[];
  rangeLabel: string;
}): { subject: string; html: string; text: string } {
  const cards = input.snapshots
    .map(({ recipient, growth, leadgen, leadgenActivity }) => {
      const growthBlock = growth
        ? `<div style="margin-top:12px"><strong>Growth CRM</strong><br>Consultations: ${growth.consultationsBooked}/${CRM_WEEKLY_CONSULTATIONS_TARGET}<br>Opportunity leads added: ${growth.leadsAdded}/${CRM_WEEKLY_LEADS_ADDED_TARGET}<br>Emails delivered: ${growth.emailsDelivered}/${CRM_WEEKLY_EMAILS_DELIVERED_TARGET}<br>Overall: ${growth.overallPercentage}% — ${escapeHtml(CRM_PERFORMANCE_TIER_LABEL[crmPerformanceTier(growth.overallPercentage)])}</div>`
        : "";
      const leadgenBlock = leadgen
        ? `<div style="margin-top:12px"><strong>Lead Generation CRM</strong><br>Appointments booked: ${leadgen.bookedThisWeek}/${LEADGEN_WEEKLY_APPOINTMENT_TARGET}${leadgenActivity ? `<br>Calls logged: ${leadgenActivity.callsThisWeek}/${LEADGEN_WEEKLY_CALL_TARGET}<br>Emails sent: ${leadgenActivity.emailsThisWeek}/${LEADGEN_WEEKLY_EMAIL_TARGET}` : ""}<br>Overall: ${leadgen.percentage}% — ${escapeHtml(LEADGEN_PERFORMANCE_TIER_LABEL[leadgenPerformanceTier(leadgen.percentage)])}</div>`
        : "";
      return `<div style="margin-top:16px;border:1px solid #dbe4ee;border-radius:14px;padding:16px"><div style="font-size:17px;font-weight:800;color:#0f172a">${escapeHtml(recipient.name)}</div><div style="margin-top:3px;font-size:12px;color:#64748b">${escapeHtml(recipient.email)}</div>${growthBlock}${leadgenBlock}</div>`;
    })
    .join("");

  const textLines = [
    `Winsalot weekly agent performance summary — ${input.rangeLabel}`,
    "",
    ...input.snapshots.flatMap(({ recipient, growth, leadgen, leadgenActivity }) => {
      const lines = [recipient.name, recipient.email];
      if (growth) {
        lines.push(
          `Growth: ${growth.consultationsBooked}/${CRM_WEEKLY_CONSULTATIONS_TARGET} consultations, ${growth.leadsAdded}/${CRM_WEEKLY_LEADS_ADDED_TARGET} opportunity leads, ${growth.emailsDelivered}/${CRM_WEEKLY_EMAILS_DELIVERED_TARGET} emails delivered, ${growth.overallPercentage}% overall`
        );
      }
      if (leadgen) {
        lines.push(`Lead Generation: ${leadgen.bookedThisWeek}/${LEADGEN_WEEKLY_APPOINTMENT_TARGET} appointments, ${leadgen.percentage}% overall`);
        if (leadgenActivity) {
          lines.push(`Lead Generation calls: ${leadgenActivity.callsThisWeek}/${LEADGEN_WEEKLY_CALL_TARGET}`);
          lines.push(`Lead Generation emails sent: ${leadgenActivity.emailsThisWeek}/${LEADGEN_WEEKLY_EMAIL_TARGET}`);
        }
      }
      return [...lines, ""];
    }),
  ];

  return {
    subject: `Admin summary: Winsalot weekly agent performance — ${input.rangeLabel}`,
    html: `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:760px;margin:0 auto;padding:28px 14px">
        <div style="background:#ffffff;border-radius:18px;padding:28px;box-shadow:0 2px 8px rgba(15,23,42,.08)">
          <div style="text-align:center;margin-bottom:18px">
            <img src="${LOGO_URL}" alt="Winsalot Corp." width="150" style="display:inline-block;max-width:150px;height:auto;border:0" />
          </div>
          <h1 style="margin:0 0 8px;font-size:25px;text-align:center">Weekly Admin Performance Summary</h1>
          <p style="margin:0;text-align:center;color:#475569">All active agent results for <strong>${escapeHtml(input.rangeLabel)}</strong>.</p>
          ${cards}
          <p style="margin:24px 0 0;color:#475569;font-size:13px"><strong>Winsalot Corp.</strong><br>Empowering Businesses, One Solution at a Time.</p>
        </div>
      </div>
    </body></html>`,
    text: textLines.join("\n"),
  };
}

export async function runAgentWeeklyReportJob(options: { dryRun?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const admin = getSupabaseAdmin();

  const [{ data: crmAgents }, { data: leadgenAgents }, recordsResult, { data: appointments }, { data: callLogs }, { data: leadgenEmails }] = await Promise.all([
    admin.from("crm_users").select("id, full_name, email").eq("role", "agent").eq("active", true),
    admin.from("leadgen_users").select("id, full_name, email").eq("role", "agent").eq("active", true).neq("email", DEACTIVATED_TEST_AGENT_EMAIL),
    getCrmPerformanceRecords(),
    admin
      .from("leadgen_appointments")
      .select("id, lead_id, business_name, contact_name, appointment_date, appointment_time, status, created_at, booking_agent_id"),
    admin.from("leadgen_call_logs").select("agent_id, created_at"),
    admin.from("leadgen_emails").select("sent_by, sent_at, delivered_at, bounced_at, failed_at").not("sent_by", "is", null),
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
    recipients.set(email, {
      email,
      name: current?.name || agent.full_name || agent.email,
      crmAgentId: current?.crmAgentId,
      leadgenAgentId: agent.id,
    });
  }

  const allAppointments = (appointments ?? []) as LeadgenPerformanceAppointment[];
  const allCallLogs = (callLogs ?? []) as LeadgenKpiCallLogRow[];
  const allLeadgenEmails = (leadgenEmails ?? []) as LeadgenKpiEmailRow[];
  const results: Array<{ email: string; outcome: "sent" | "dry-run" | "failed"; resendId?: string; error?: string }> = [];
  const snapshots: WeeklyAgentSnapshot[] = [];

  for (const recipient of recipients.values()) {
    const growth = recipient.crmAgentId ? computeCrmAgentPerformance(recordsResult, recipient.crmAgentId, now).current : undefined;
    const leadgen = recipient.leadgenAgentId ? computeLeadgenAgentPerformance(allAppointments, recipient.leadgenAgentId, now) : undefined;
    const leadgenActivity = recipient.leadgenAgentId
      ? computeLeadgenAgentActivityKpis(allCallLogs, allLeadgenEmails, [], recipient.leadgenAgentId, now)
      : undefined;
    const email = buildEmail({ recipient, growth, leadgen, leadgenActivity });
    const weekKey = growth?.periodStart ?? leadgen?.weekStart ?? crmDateKey(now);
    snapshots.push({ recipient, growth, leadgen, leadgenActivity });

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
          { name: "category", value: "agent-weekly-report" },
          { name: "report_week", value: weekKey },
        ],
      },
      { idempotencyKey: `agent-weekly-report-${weekKey}-${recipient.email.replace(/[^a-z0-9]+/g, "-")}` }
    );

    if (error) results.push({ email: recipient.email, outcome: "failed", error: error.message });
    else results.push({ email: recipient.email, outcome: "sent", resendId: data?.id });
  }

  const firstSnapshot = snapshots[0];
  const rangeLabel = firstSnapshot?.growth
    ? crmWeeklyRangeLabel(firstSnapshot.growth.periodStart, firstSnapshot.growth.periodEnd)
    : firstSnapshot?.leadgen
      ? leadgenWeekRangeLabel(firstSnapshot.leadgen.weekStart, firstSnapshot.leadgen.weekEnd)
      : leadgenDateKey(now);
  const adminEmailAddress = (process.env.AGENT_REPORT_ADMIN_EMAIL || "info@winsalotcorp.com").trim().toLowerCase();
  const adminEmail = buildAdminEmail({ snapshots, rangeLabel });
  const adminWeekKey = firstSnapshot?.growth?.periodStart ?? firstSnapshot?.leadgen?.weekStart ?? crmDateKey(now);

  if (options.dryRun) {
    results.push({ email: adminEmailAddress, outcome: "dry-run" });
  } else {
    const { data, error } = await getResendClient().emails.send(
      {
        from: getEmailSender("growth"),
        to: adminEmailAddress,
        replyTo: getEmailReplyTo(),
        subject: adminEmail.subject,
        html: adminEmail.html,
        text: adminEmail.text,
        tags: [
          { name: "category", value: "admin-weekly-agent-summary" },
          { name: "report_week", value: adminWeekKey },
        ],
      },
      { idempotencyKey: `admin-weekly-agent-summary-${adminWeekKey}` }
    );
    if (error) results.push({ email: adminEmailAddress, outcome: "failed", error: error.message });
    else results.push({ email: adminEmailAddress, outcome: "sent", resendId: data?.id });
  }

  return {
    reportDate: leadgenDateKey(now),
    agentRecipientCount: recipients.size,
    adminRecipient: adminEmailAddress,
    recipientCount: recipients.size + 1,
    sent: results.filter((result) => result.outcome === "sent").length,
    failed: results.filter((result) => result.outcome === "failed").length,
    dryRun: !!options.dryRun,
    results,
  };
}
