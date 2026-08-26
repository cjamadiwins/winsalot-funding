import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  monthStartOfWeek,
  normalizeIncentiveEmail,
  toWinsalotIncentiveSettings,
  type WinsalotAgentIncentiveLedgerRow,
  type WinsalotIncentiveCrm,
  type WinsalotIncentiveSettings,
  type WinsalotIncentiveSettingsRow,
} from "./agent-incentive-shared";

// Weekly Agent Incentive - the shared, server-only read/write layer over
// the three central tables from supabase/migrations/0059_agent_
// incentive_ledger.sql. Used by BOTH CRMs' admin Server Actions
// (src/app/leadgen/admin/(dashboard)/incentives/actions.ts and
// src/app/admin/(dashboard)/crm/incentives/actions.ts) so the cross-CRM
// ₦25,000/month cap check (brief: "their total approved incentive across
// both CRMs must still not exceed ₦25,000... display a warning and block
// approval if a payment would exceed the agent's monthly limit") is
// implemented exactly once, in exactly one place, and can never drift
// between the two CRMs' admin UIs.
//
// Every function here takes the caller's own Supabase client rather than
// creating one - an admin action passes its session-scoped client (RLS
// still applies: winsalot_agent_incentive_ledger's admin_all policy
// requires crm_user_role/leadgen_user_role = 'admin'), while an agent
// dashboard page reading its own cross-CRM month-to-date total passes
// the service-role client narrowly filtered to that one agent's own
// email (see fetchAgentMonthToDateApproved below) - RLS alone cannot do
// that read because the same real person's Winsalot Growth CRM and Lead Gen CRM
// logins are different auth.uid()s with no shared identity to match a
// single agent_select_own policy against.

const LEDGER_TABLE = "winsalot_agent_incentive_ledger";
const AUDIT_TABLE = "winsalot_agent_incentive_audit";
const SETTINGS_TABLE = "winsalot_incentive_settings";
const SETTINGS_ID = "00000000-0000-0000-0000-000000000002";

export async function fetchWinsalotIncentiveSettings(supabase: SupabaseClient): Promise<WinsalotIncentiveSettings> {
  const { data } = await supabase.from(SETTINGS_TABLE).select("*").maybeSingle();
  return toWinsalotIncentiveSettings(data as WinsalotIncentiveSettingsRow | null);
}

export async function updateWinsalotIncentiveSettings(
  supabase: SupabaseClient,
  updates: Partial<{
    leadgen_weekly_quota: number;
    leadgen_weekly_bonus_amount: number;
    crm_weekly_quota: number;
    crm_weekly_bonus_amount: number;
    monthly_cap: number;
  }>,
  updatedByName: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .update({ ...updates, updated_at: new Date().toISOString(), updated_by_name: updatedByName })
    .eq("id", SETTINGS_ID);
  if (error) return { error: "Failed to update incentive settings." };
  return {};
}

export type ApproveWeeklyIncentiveBonusParams = {
  crm: WinsalotIncentiveCrm;
  sourceLeadgenUserId: string | null;
  sourceCrmUserId: string | null;
  agentEmail: string;
  agentName: string;
  weekStart: string;
  weekEnd: string;
  qualifiedCount: number;
  weeklyQuota: number;
  calculatedBonus: number;
  requestedApprovedTotal: number;
  reason: string | null;
  monthlyCap: number;
  performedByName: string;
};

// Recomputes nothing itself - qualifiedCount/calculatedBonus must already
// have been computed live from the source CRM's own qualifying records
// by the caller (computeLeadgenWeeklyIncentive / computeCrmWeeklyIncentive),
// never trusted from client input. This function's own job is strictly
// the ledger upsert, the cross-CRM cap check, and the audit entry.
export async function approveWeeklyIncentiveBonus(
  supabase: SupabaseClient,
  params: ApproveWeeklyIncentiveBonusParams
): Promise<{ error?: string }> {
  if (!Number.isFinite(params.requestedApprovedTotal) || params.requestedApprovedTotal < 0) {
    return { error: "Approved bonus must be zero or a positive number." };
  }

  // Brief: "Approve the weekly ₦5,000 incentive only after at least 4
  // results are verified." qualifiedCount is already the *verified*
  // total (only appointments/quotes an admin marked Qualified count at
  // all - see computeLeadgenWeeklyIncentive/computeCrmWeeklyIncentive),
  // so this is a pure workflow gate on top of unchanged math: a below-
  // quota week already calculates to a ₦0 bonus, this just also refuses
  // to let an admin record an "approval" for it.
  if (params.qualifiedCount < params.weeklyQuota) {
    return { error: "Cannot approve: the weekly quota has not been met yet." };
  }

  const email = normalizeIncentiveEmail(params.agentEmail);
  const monthStart = monthStartOfWeek(params.weekStart);
  const isAdjustment = params.requestedApprovedTotal !== params.calculatedBonus;
  if (isAdjustment && !params.reason) {
    return { error: "A reason is required when the approved bonus differs from the calculated bonus." };
  }

  const { data: existing } = await supabase
    .from(LEDGER_TABLE)
    .select("id, approved_total, status")
    .eq("crm", params.crm)
    .eq("agent_email", email)
    .eq("week_start", params.weekStart)
    .maybeSingle();

  if (existing?.status === "paid") {
    return { error: "This bonus has already been paid and can no longer be adjusted." };
  }

  // Cross-CRM monthly cap (brief: "If the same agent works in both CRMs,
  // their total approved incentive across both CRMs must still not
  // exceed ₦25,000... Display a warning and block approval if a payment
  // would exceed the agent's ₦25,000 monthly limit") - sum every OTHER
  // approved/paid row for this email in this calendar month, across
  // both crm values, and refuse if this approval would push the total
  // over the cap.
  const { data: monthRows } = await supabase
    .from(LEDGER_TABLE)
    .select("id, approved_total")
    .eq("agent_email", email)
    .eq("month_start", monthStart)
    .in("status", ["approved", "paid"]);

  const otherApprovedThisMonth = ((monthRows ?? []) as Array<{ id: string; approved_total: number | null }>)
    .filter((row) => row.id !== existing?.id)
    .reduce((sum, row) => sum + (row.approved_total ?? 0), 0);

  const newMonthTotal = otherApprovedThisMonth + params.requestedApprovedTotal;
  if (newMonthTotal > params.monthlyCap) {
    return {
      error: `Blocked: approving this bonus would bring ${params.agentName}'s total approved incentive for ${monthStart.slice(0, 7)} to ₦${newMonthTotal.toLocaleString()}, exceeding the ₦${params.monthlyCap.toLocaleString()} monthly cap (₦${otherApprovedThisMonth.toLocaleString()} already approved this month across both CRMs).`,
    };
  }

  const now = new Date().toISOString();
  const { data: saved, error } = await supabase
    .from(LEDGER_TABLE)
    .upsert(
      {
        crm: params.crm,
        source_leadgen_user_id: params.sourceLeadgenUserId,
        source_crm_user_id: params.sourceCrmUserId,
        agent_email: email,
        agent_name: params.agentName,
        week_start: params.weekStart,
        week_end: params.weekEnd,
        month_start: monthStart,
        qualified_count: params.qualifiedCount,
        weekly_quota: params.weeklyQuota,
        quota_met: params.qualifiedCount >= params.weeklyQuota,
        calculated_bonus: params.calculatedBonus,
        approved_total: params.requestedApprovedTotal,
        adjustment_reason: isAdjustment ? params.reason : null,
        status: "approved",
        approved_by_name: params.performedByName,
        approved_at: now,
        // Explicitly cleared in case this row was previously rejected -
        // an upsert only touches the columns listed here, so a prior
        // rejected_by_name/rejected_at would otherwise survive and
        // violate the rejection-pairing constraint (status != 'rejected'
        // requires both null).
        rejected_by_name: null,
        rejected_at: null,
        updated_at: now,
      },
      { onConflict: "crm,agent_email,week_start" }
    )
    .select("id")
    .single();

  if (error || !saved) return { error: "Failed to approve the bonus." };

  await supabase.from(AUDIT_TABLE).insert({
    ledger_id: saved.id,
    crm: params.crm,
    agent_email: email,
    agent_name: params.agentName,
    week_start: params.weekStart,
    week_end: params.weekEnd,
    action: isAdjustment ? "adjusted" : "approved",
    previous_total: existing?.approved_total ?? null,
    new_total: params.requestedApprovedTotal,
    reason: params.reason,
    performed_by_name: params.performedByName,
  });

  return {};
}

export type RejectWeeklyIncentiveBonusParams = {
  crm: WinsalotIncentiveCrm;
  sourceLeadgenUserId: string | null;
  sourceCrmUserId: string | null;
  agentEmail: string;
  agentName: string;
  weekStart: string;
  weekEnd: string;
  qualifiedCount: number;
  weeklyQuota: number;
  calculatedBonus: number;
  reason: string;
  performedByName: string;
};

// Brief: "Reject the weekly incentive with a required explanation." Like
// approveWeeklyIncentiveBonus, recomputes nothing - qualifiedCount/
// calculatedBonus are only recorded for the audit trail, never
// recalculated here. A rejected week has no approved_total (never paid),
// but can still be later approved if an admin reverses the decision
// (approveWeeklyIncentiveBonus explicitly clears rejected_by_name/at
// when that happens).
export async function rejectWeeklyIncentiveBonus(
  supabase: SupabaseClient,
  params: RejectWeeklyIncentiveBonusParams
): Promise<{ error?: string }> {
  if (!params.reason.trim()) {
    return { error: "A reason is required to reject this week's incentive." };
  }

  const email = normalizeIncentiveEmail(params.agentEmail);
  const monthStart = monthStartOfWeek(params.weekStart);

  const { data: existing } = await supabase
    .from(LEDGER_TABLE)
    .select("id, approved_total, status")
    .eq("crm", params.crm)
    .eq("agent_email", email)
    .eq("week_start", params.weekStart)
    .maybeSingle();

  if (existing?.status === "paid") {
    return { error: "This bonus has already been paid and can no longer be rejected." };
  }

  const now = new Date().toISOString();
  const { data: saved, error } = await supabase
    .from(LEDGER_TABLE)
    .upsert(
      {
        crm: params.crm,
        source_leadgen_user_id: params.sourceLeadgenUserId,
        source_crm_user_id: params.sourceCrmUserId,
        agent_email: email,
        agent_name: params.agentName,
        week_start: params.weekStart,
        week_end: params.weekEnd,
        month_start: monthStart,
        qualified_count: params.qualifiedCount,
        weekly_quota: params.weeklyQuota,
        quota_met: params.qualifiedCount >= params.weeklyQuota,
        calculated_bonus: params.calculatedBonus,
        approved_total: null,
        adjustment_reason: params.reason,
        status: "rejected",
        approved_by_name: null,
        approved_at: null,
        rejected_by_name: params.performedByName,
        rejected_at: now,
        updated_at: now,
      },
      { onConflict: "crm,agent_email,week_start" }
    )
    .select("id")
    .single();

  if (error || !saved) return { error: "Failed to reject this week's incentive." };

  await supabase.from(AUDIT_TABLE).insert({
    ledger_id: saved.id,
    crm: params.crm,
    agent_email: email,
    agent_name: params.agentName,
    week_start: params.weekStart,
    week_end: params.weekEnd,
    action: "rejected",
    previous_total: existing?.approved_total ?? null,
    new_total: 0,
    reason: params.reason,
    performed_by_name: params.performedByName,
  });

  return {};
}

export async function markIncentiveBonusPaid(
  supabase: SupabaseClient,
  ledgerId: string,
  performedByName: string,
  paymentDate: string | null,
  paymentReference: string | null
): Promise<{ error?: string }> {
  const { data: existing } = await supabase
    .from(LEDGER_TABLE)
    .select("id, crm, agent_email, agent_name, week_start, week_end, approved_total, status")
    .eq("id", ledgerId)
    .maybeSingle();

  if (!existing) return { error: "Bonus record not found." };
  if (existing.status !== "approved") return { error: "Only an approved bonus can be marked as paid." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(LEDGER_TABLE)
    .update({
      status: "paid",
      paid_by_name: performedByName,
      paid_at: now,
      payment_date: paymentDate,
      payment_reference: paymentReference,
      updated_at: now,
    })
    .eq("id", ledgerId);

  if (error) return { error: "Failed to mark this bonus as paid." };

  await supabase.from(AUDIT_TABLE).insert({
    ledger_id: existing.id,
    crm: existing.crm,
    agent_email: existing.agent_email,
    agent_name: existing.agent_name,
    week_start: existing.week_start,
    week_end: existing.week_end,
    action: "paid",
    previous_total: existing.approved_total,
    new_total: existing.approved_total,
    reason: null,
    performed_by_name: performedByName,
  });

  return {};
}

// This one agent's own approved+paid total for one calendar month,
// summed across BOTH CRMs (brief: "Month-to-date approved incentive" /
// "Remaining amount before the ₦25,000 monthly cap" on the agent's own
// Weekly Incentive card). Takes the service-role client and filters
// strictly to this one email - see the file header for why RLS alone
// cannot serve this particular read, and note this function must only
// ever be called with an email the caller has already authenticated as
// belonging to the current signed-in agent (requireLeadgenAgent()/
// requireAgent()), never an arbitrary/user-supplied email.
export async function fetchAgentMonthToDateApproved(supabase: SupabaseClient, agentEmail: string, monthStart: string): Promise<number> {
  const email = normalizeIncentiveEmail(agentEmail);
  const { data } = await supabase
    .from(LEDGER_TABLE)
    .select("approved_total")
    .eq("agent_email", email)
    .eq("month_start", monthStart)
    .in("status", ["approved", "paid"]);
  return ((data ?? []) as Array<{ approved_total: number | null }>).reduce((sum, row) => sum + (row.approved_total ?? 0), 0);
}

export async function fetchLedgerRow(
  supabase: SupabaseClient,
  crm: WinsalotIncentiveCrm,
  agentEmail: string,
  weekStart: string
): Promise<WinsalotAgentIncentiveLedgerRow | null> {
  const { data } = await supabase
    .from(LEDGER_TABLE)
    .select("*")
    .eq("crm", crm)
    .eq("agent_email", normalizeIncentiveEmail(agentEmail))
    .eq("week_start", weekStart)
    .maybeSingle();
  return (data as WinsalotAgentIncentiveLedgerRow | null) ?? null;
}
