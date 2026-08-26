"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeCrmWeeklyIncentive } from "@/lib/crm-incentives";
import { getCrmIncentiveAppointments } from "@/lib/crm-incentive-data";
import {
  approveWeeklyIncentiveBonus,
  fetchWinsalotIncentiveSettings,
  markIncentiveBonusPaid,
  rejectWeeklyIncentiveBonus,
  updateWinsalotIncentiveSettings,
} from "@/lib/agent-incentive-ledger";

type ActionResult = { error?: string };

// Bound with (weekStart, weekEnd) via .bind() when passed to
// AdminWeeklyIncentivesClient (see page.tsx) - mirrors leadgen's
// approveLeadgenWeeklyBonusAction exactly, differing only in which
// CRM-specific data source it recomputes qualifiedCount from.
export async function approveCrmWeeklyBonusAction(weekStart: string, weekEnd: string, agentId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdmin();

  const [{ data: agent }, appointments, settings] = await Promise.all([
    admin.from("crm_users").select("id, full_name, email").eq("id", agentId).maybeSingle(),
    getCrmIncentiveAppointments(agentId),
    fetchWinsalotIncentiveSettings(supabase),
  ]);

  if (!agent) return { error: "Agent not found." };

  const calc = computeCrmWeeklyIncentive(appointments, agentId, weekStart, weekEnd, settings.crmWeeklyQuota, settings.crmWeeklyBonusAmount);

  const approvedTotalRaw = String(formData.get("approved_total") ?? "").trim();
  const requestedApprovedTotal = approvedTotalRaw ? Number(approvedTotalRaw) : calc.calculatedBonus;
  const reason = String(formData.get("adjustment_reason") ?? "").trim() || null;

  const result = await approveWeeklyIncentiveBonus(supabase, {
    crm: "cleaning",
    sourceLeadgenUserId: null,
    sourceCrmUserId: agentId,
    agentEmail: agent.email,
    agentName: agent.full_name || agent.email,
    weekStart,
    weekEnd,
    qualifiedCount: calc.qualifiedCount,
    weeklyQuota: settings.crmWeeklyQuota,
    calculatedBonus: calc.calculatedBonus,
    requestedApprovedTotal,
    reason,
    monthlyCap: settings.monthlyCap,
    performedByName: adminUser.full_name || adminUser.email,
  });

  if (result.error) return result;

  revalidatePath("/admin/crm/incentives");
  revalidatePath("/agent/dashboard");
  return {};
}

// Bound with (weekStart, weekEnd) via .bind(), same shape as
// approveCrmWeeklyBonusAction above.
export async function rejectCrmWeeklyBonusAction(weekStart: string, weekEnd: string, agentId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdmin();

  const [{ data: agent }, appointments, settings] = await Promise.all([
    admin.from("crm_users").select("id, full_name, email").eq("id", agentId).maybeSingle(),
    getCrmIncentiveAppointments(agentId),
    fetchWinsalotIncentiveSettings(supabase),
  ]);

  if (!agent) return { error: "Agent not found." };

  const calc = computeCrmWeeklyIncentive(appointments, agentId, weekStart, weekEnd, settings.crmWeeklyQuota, settings.crmWeeklyBonusAmount);
  const reason = String(formData.get("rejection_reason") ?? "").trim();

  const result = await rejectWeeklyIncentiveBonus(supabase, {
    crm: "cleaning",
    sourceLeadgenUserId: null,
    sourceCrmUserId: agentId,
    agentEmail: agent.email,
    agentName: agent.full_name || agent.email,
    weekStart,
    weekEnd,
    qualifiedCount: calc.qualifiedCount,
    weeklyQuota: settings.crmWeeklyQuota,
    calculatedBonus: calc.calculatedBonus,
    reason,
    performedByName: adminUser.full_name || adminUser.email,
  });

  if (result.error) return result;

  revalidatePath("/admin/crm/incentives");
  revalidatePath("/agent/dashboard");
  return {};
}

export async function markCrmBonusPaidAction(ledgerId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const paymentDate = String(formData.get("payment_date") ?? "").trim() || null;
  const paymentReference = String(formData.get("payment_reference") ?? "").trim() || null;

  const result = await markIncentiveBonusPaid(supabase, ledgerId, adminUser.full_name || adminUser.email, paymentDate, paymentReference);
  if (result.error) return result;

  revalidatePath("/admin/crm/incentives");
  revalidatePath("/agent/dashboard");
  return {};
}

export async function updateCrmIncentiveSettingsAction(formData: FormData): Promise<ActionResult> {
  const adminUser = await requireCrmAdmin();

  const weeklyQuota = Number(formData.get("crm_weekly_quota"));
  const weeklyBonusAmount = Number(formData.get("crm_weekly_bonus_amount"));
  const monthlyCap = Number(formData.get("monthly_cap"));

  if (!Number.isFinite(weeklyQuota) || !Number.isInteger(weeklyQuota) || weeklyQuota <= 0) {
    return { error: "Weekly quota must be a whole number greater than 0." };
  }
  if (!Number.isFinite(weeklyBonusAmount) || weeklyBonusAmount < 0) return { error: "Weekly bonus must be zero or a positive number." };
  if (!Number.isFinite(monthlyCap) || monthlyCap < 0) return { error: "Monthly cap must be zero or a positive number." };

  const supabase = await createSupabaseServerClient();
  const result = await updateWinsalotIncentiveSettings(
    supabase,
    { crm_weekly_quota: weeklyQuota, crm_weekly_bonus_amount: weeklyBonusAmount, monthly_cap: monthlyCap },
    adminUser.full_name || adminUser.email
  );
  if (result.error) return result;

  revalidatePath("/admin/crm/incentives");
  revalidatePath("/agent/dashboard");
  revalidatePath("/leadgen/admin/incentives");
  revalidatePath("/leadgen/agent");
  return {};
}
