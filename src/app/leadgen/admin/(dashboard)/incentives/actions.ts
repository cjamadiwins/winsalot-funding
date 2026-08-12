"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeLeadgenWeeklyIncentive, type LeadgenIncentiveAppointment } from "@/lib/leadgen-incentives";
import {
  approveWeeklyIncentiveBonus,
  fetchWinsalotIncentiveSettings,
  markIncentiveBonusPaid,
  rejectWeeklyIncentiveBonus,
  updateWinsalotIncentiveSettings,
} from "@/lib/agent-incentive-ledger";

type ActionResult = { error?: string };

async function fetchIncentiveAppointments(): Promise<LeadgenIncentiveAppointment[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("leadgen_appointments").select("id, created_at, booking_agent_id, incentive_status");
  return (data ?? []) as LeadgenIncentiveAppointment[];
}

// Bound with (weekStart, weekEnd) via .bind() when passed to
// AdminWeeklyIncentivesClient (see page.tsx) - the client component
// calls it as (agentId, formData), the shape .bind(null, weekStart,
// weekEnd) produces from this four-argument function.
export async function approveLeadgenWeeklyBonusAction(
  weekStart: string,
  weekEnd: string,
  agentId: string,
  formData: FormData
): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: agent }, appointments, settings] = await Promise.all([
    supabase.from("leadgen_users").select("id, full_name, email").eq("id", agentId).maybeSingle(),
    fetchIncentiveAppointments(),
    fetchWinsalotIncentiveSettings(supabase),
  ]);

  if (!agent) return { error: "Agent not found." };

  const calc = computeLeadgenWeeklyIncentive(appointments, agentId, weekStart, weekEnd, settings.leadgenWeeklyQuota, settings.leadgenWeeklyBonusAmount);

  const approvedTotalRaw = String(formData.get("approved_total") ?? "").trim();
  const requestedApprovedTotal = approvedTotalRaw ? Number(approvedTotalRaw) : calc.calculatedBonus;
  const reason = String(formData.get("adjustment_reason") ?? "").trim() || null;

  const result = await approveWeeklyIncentiveBonus(supabase, {
    crm: "leadgen",
    sourceLeadgenUserId: agentId,
    sourceCrmUserId: null,
    agentEmail: agent.email,
    agentName: agent.full_name || agent.email,
    weekStart,
    weekEnd,
    qualifiedCount: calc.qualifiedCount,
    weeklyQuota: settings.leadgenWeeklyQuota,
    calculatedBonus: calc.calculatedBonus,
    requestedApprovedTotal,
    reason,
    monthlyCap: settings.monthlyCap,
    performedByName: adminUser.full_name || adminUser.email,
  });

  if (result.error) return result;

  revalidatePath("/leadgen/admin/incentives");
  revalidatePath("/leadgen/agent");
  return {};
}

// Bound with (weekStart, weekEnd) via .bind(), same shape as
// approveLeadgenWeeklyBonusAction above.
export async function rejectLeadgenWeeklyBonusAction(weekStart: string, weekEnd: string, agentId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: agent }, appointments, settings] = await Promise.all([
    supabase.from("leadgen_users").select("id, full_name, email").eq("id", agentId).maybeSingle(),
    fetchIncentiveAppointments(),
    fetchWinsalotIncentiveSettings(supabase),
  ]);

  if (!agent) return { error: "Agent not found." };

  const calc = computeLeadgenWeeklyIncentive(appointments, agentId, weekStart, weekEnd, settings.leadgenWeeklyQuota, settings.leadgenWeeklyBonusAmount);
  const reason = String(formData.get("rejection_reason") ?? "").trim();

  const result = await rejectWeeklyIncentiveBonus(supabase, {
    crm: "leadgen",
    sourceLeadgenUserId: agentId,
    sourceCrmUserId: null,
    agentEmail: agent.email,
    agentName: agent.full_name || agent.email,
    weekStart,
    weekEnd,
    qualifiedCount: calc.qualifiedCount,
    weeklyQuota: settings.leadgenWeeklyQuota,
    calculatedBonus: calc.calculatedBonus,
    reason,
    performedByName: adminUser.full_name || adminUser.email,
  });

  if (result.error) return result;

  revalidatePath("/leadgen/admin/incentives");
  revalidatePath("/leadgen/agent");
  return {};
}

export async function markLeadgenBonusPaidAction(ledgerId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const paymentDate = String(formData.get("payment_date") ?? "").trim() || null;
  const paymentReference = String(formData.get("payment_reference") ?? "").trim() || null;

  const result = await markIncentiveBonusPaid(supabase, ledgerId, adminUser.full_name || adminUser.email, paymentDate, paymentReference);
  if (result.error) return result;

  revalidatePath("/leadgen/admin/incentives");
  revalidatePath("/leadgen/agent");
  return {};
}

export async function updateLeadgenIncentiveSettingsAction(formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();

  const weeklyQuota = Number(formData.get("leadgen_weekly_quota"));
  const weeklyBonusAmount = Number(formData.get("leadgen_weekly_bonus_amount"));
  const monthlyCap = Number(formData.get("monthly_cap"));

  if (!Number.isFinite(weeklyQuota) || !Number.isInteger(weeklyQuota) || weeklyQuota <= 0) {
    return { error: "Weekly quota must be a whole number greater than 0." };
  }
  if (!Number.isFinite(weeklyBonusAmount) || weeklyBonusAmount < 0) return { error: "Weekly bonus must be zero or a positive number." };
  if (!Number.isFinite(monthlyCap) || monthlyCap < 0) return { error: "Monthly cap must be zero or a positive number." };

  const supabase = await createSupabaseServerClient();
  const result = await updateWinsalotIncentiveSettings(
    supabase,
    { leadgen_weekly_quota: weeklyQuota, leadgen_weekly_bonus_amount: weeklyBonusAmount, monthly_cap: monthlyCap },
    adminUser.full_name || adminUser.email
  );
  if (result.error) return result;

  revalidatePath("/leadgen/admin/incentives");
  revalidatePath("/leadgen/agent");
  revalidatePath("/admin/crm/incentives");
  revalidatePath("/agent/dashboard");
  return {};
}
