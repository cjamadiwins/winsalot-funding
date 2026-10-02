import "server-only";
import { getResendClient } from "./resend";
import { getSupabaseAdmin } from "./supabase-admin";
import { getEmailSender, getEmailReplyTo } from "./email-senders";
import { formatCurrency, formatPayPeriodLabel, type PayrollCurrency, type PayrollRecord, type PayrollEmailNotification } from "./payroll";

export type PayrollCrm = "growth" | "leadgen";
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Explicit allowlist: never serialize the payroll row or its internal audit reasons.
export function buildPayrollPaidEmail(record: PayrollRecord, agentName: string, currency: PayrollCurrency, crm: PayrollCrm) {
  const payUrl = crm === "leadgen" ? "https://leads.winsalotcorp.com/leadgen/agent/pay" : "https://growth.winsalotcorp.com/agent/pay";
  const money = (amount: number) => formatCurrency(amount, currency);
  const rows = [
    ["Pay period", formatPayPeriodLabel(record.pay_period_start, record.pay_period_end)],
    ["Payment date", record.actual_payment_date ?? ""],
    ["Payment method", record.payment_method ?? ""],
    ["Gross wage earnings", money(record.base_pay_earned)],
    ["Incentive / bonus", money(record.bonus_commission)],
    ["Internet allowance", money(record.internet_allowance)],
    ["Other additions", money(record.other_additions)],
    ["Holiday pay", money(record.holiday_pay)],
    ["Deductions", money(record.deductions)],
    ["Final amount payable", money(record.total_pay)],
    ["Notes for agent", record.admin_notes || "None"],
  ];
  const subject = `Winsalot Corp. — Payroll paid (${record.payday})`;
  const text = `Hello ${agentName},\n\nYour payroll has been marked Paid.\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nView your payroll statement: ${payUrl}\nSign in and select this pay period, then Print / Save as PDF.\n\nWinsalot Corp.`;
  const html = `<div style="max-width:600px;margin:auto;font-family:Arial,sans-serif;color:#0f172a"><h2>Winsalot Corp.</h2><h3>Payroll paid</h3><p>Hello ${escapeHtml(agentName)},</p><p>Your payroll has been marked Paid.</p><table style="width:100%;border-collapse:collapse">${rows.map(([label, value]) => `<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(label)}</th><td style="padding:8px;border-bottom:1px solid #e2e8f0;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`).join("")}</table><p><a href="${payUrl}">View your payroll statement</a></p><p>Sign in and select this pay period, then Print / Save as PDF.</p></div>`;
  return { subject, text, html };
}

// Called only by authenticated Admin Paid actions after the conditional update
// succeeds. One durable claim per agent/pay period across both record stores.
// Failed/ambiguous attempts are retained for review; never blindly retried.
export async function sendPayrollPaidEmail(crm: PayrollCrm, record: PayrollRecord, actor: { id: string; full_name: string | null; email: string }) {
  if (record.status !== "paid") return;
  const prefix = crm === "growth" ? "crm" : "leadgen";
  let notificationId: string | undefined;
  let sendAttempted = false;
  let recipient: string | null = null;
  let providerId: string | null = null;
  try {
    const db = getSupabaseAdmin();
    const { data: claim, error } = await db.from("payroll_email_notifications").insert({
      source_crm: crm, source_payroll_id: record.id, agent_id: record.agent_id,
      pay_period_start: record.pay_period_start, pay_period_end: record.pay_period_end,
      finalized_by: actor.id, status: "pending", status_at: new Date().toISOString(),
    }).select("id").single();
    if (error?.code === "23505") return; // Shared agent/pay-period and record-level duplicate guards.
    if (error || !claim) throw new Error(error?.message || "Could not reserve payroll email audit entry.");
    notificationId = claim.id;
    // Records paid before this feature have no claim. A later reopening is
    // a correction, not authority to send a new payment notification.
    const { count: paidCount, error: historyError } = await db.from(`${prefix}_payroll_audit_log`)
      .select("id", { count: "exact", head: true }).eq("payroll_id", record.id).eq("action", "marked_paid");
    if (historyError) throw new Error("Could not verify prior payment history.");
    if ((paidCount ?? 0) > 1 || record.reopened_at) {
      const { error: skipError } = await db.from("payroll_email_notifications").update({ status: "suppressed", status_at: new Date().toISOString(), error: "Reopened payment: automatic notification suppressed for Admin review." }).eq("id", notificationId);
      if (skipError) throw new Error(skipError.message);
      return;
    }
    const { data: agent, error: agentError } = await db.from(`${prefix}_users`).select("email, full_name, payroll_currency").eq("id", record.agent_id).single();
    if (agentError || !agent?.email) throw new Error("Agent email could not be loaded.");
    recipient = agent.email;
    const message = buildPayrollPaidEmail(record, agent.full_name || agent.email, agent.payroll_currency || "NGN", crm);
    const { error: recipientLogError } = await db.from("payroll_email_notifications")
      .update({ to_email: agent.email }).eq("id", notificationId);
    if (recipientLogError) throw new Error("Could not log payroll email recipient.");
    sendAttempted = true;
    const { data, error: sendError } = await getResendClient().emails.send({
      from: getEmailSender("payroll"),
      replyTo: getEmailReplyTo(),
      to: agent.email, ...message,
      tags: [{ name: "winsalot_payroll_notification", value: notificationId! }],
    }, { idempotencyKey: `winsalot-payroll/${record.agent_id}/${record.pay_period_start}/${record.pay_period_end}` });
    providerId = data?.id ?? null;
    const details = { status: data?.id && !sendError ? "sent" : "failed", status_at: new Date().toISOString(), to_email: agent.email, resend_email_id: data?.id ?? null, error: sendError?.message ?? (!data?.id ? "No provider message ID returned." : null) };
    const { error: logError } = await db.from("payroll_email_notifications").update(details).eq("id", notificationId).eq("status", "pending");
    if (logError) throw new Error(`Email result could not be logged: ${logError.message}`);
  } catch (error) {
    // Do not undo payment or tell Admin payment failed when only email failed.
    console.error(`[payroll-email] ${crm}/${record.id}`, error);
    if (notificationId) {
      const { error: logError } = await getSupabaseAdmin().from("payroll_email_notifications").update({ status: sendAttempted ? "unknown" : "failed", to_email: recipient, resend_email_id: providerId, status_at: new Date().toISOString(), error: error instanceof Error ? error.message : "Payroll email failed." }).eq("id", notificationId).eq("status", "pending");
      if (logError) console.error("[payroll-email] failure notification could not be updated", logError);
    }
  }
}

// Call only after the page's existing Admin authorization. Filter to payroll
// periods already visible through that page's session/RLS query.
export async function loadPayrollEmailNotifications(records: PayrollRecord[]): Promise<PayrollEmailNotification[]> {
  if (!records.length) return [];
  const { data, error } = await getSupabaseAdmin().from("payroll_email_notifications")
    .select("id, agent_id, pay_period_start, pay_period_end, source_crm, source_payroll_id, status, status_at, to_email, resend_email_id, error")
    .in("agent_id", [...new Set(records.map((r) => r.agent_id))]);
  if (error) throw new Error(`Payroll notification history could not be loaded: ${error.message}`);
  return (data ?? []).filter((n) => records.some((r) => r.agent_id === n.agent_id && r.pay_period_start === n.pay_period_start && r.pay_period_end === n.pay_period_end));
}
