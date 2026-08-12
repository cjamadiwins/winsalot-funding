// Weekly Agent Incentive: tiny pure helpers shared by BOTH CRMs' own
// calculation libs (lib/leadgen-incentives.ts for the Lead Gen CRM,
// lib/crm-incentives.ts for the Cleaning CRM) and by the central ledger
// (supabase/migrations/0059_agent_incentive_ledger.sql,
// lib/agent-incentive-ledger.ts). Deliberately tiny and CRM-agnostic -
// it has no idea what a "qualified appointment" or "qualified quote" is,
// only "given a qualified count and a quota, what does this week's flat
// bonus come out to."

// Brief: "0-3 qualifying records: ₦0. 4 or more: the full weekly bonus
// for that week. No partial bonus is awarded for missing the weekly
// quota." - a flat yes/no bonus, never prorated.
export function computeWeeklyIncentiveBonus(
  qualifiedCount: number,
  weeklyQuota: number,
  weeklyBonusAmount: number
): { quotaMet: boolean; calculatedBonus: number } {
  const quotaMet = qualifiedCount >= weeklyQuota;
  return { quotaMet, calculatedBonus: quotaMet ? weeklyBonusAmount : 0 };
}

// A Mon-Sun week belongs to whichever calendar month contains its
// Monday (same partition rule leadgen-performance-history.ts already
// uses for the existing Monthly Performance view) - this is what the
// ₦25,000-per-calendar-month cap is measured against.
export function monthStartOfWeek(weekStart: string): string {
  return `${weekStart.slice(0, 7)}-01`;
}

export type WinsalotIncentiveSettings = {
  leadgenWeeklyQuota: number;
  leadgenWeeklyBonusAmount: number;
  crmWeeklyQuota: number;
  crmWeeklyBonusAmount: number;
  monthlyCap: number;
};

// Mirrors the defaults seeded by migration 0059 - used only as a
// fallback if the settings row is ever unreadable, so a page never
// crashes outright; the database row (admin-editable) is always the
// source of truth in production.
export const DEFAULT_WINSALOT_INCENTIVE_SETTINGS: WinsalotIncentiveSettings = {
  leadgenWeeklyQuota: 4,
  leadgenWeeklyBonusAmount: 5000,
  crmWeeklyQuota: 4,
  crmWeeklyBonusAmount: 5000,
  monthlyCap: 25000,
};

// Shape of the single row in winsalot_incentive_settings (migration 0059).
export type WinsalotIncentiveSettingsRow = {
  id: string;
  leadgen_weekly_quota: number;
  leadgen_weekly_bonus_amount: number;
  crm_weekly_quota: number;
  crm_weekly_bonus_amount: number;
  monthly_cap: number;
  updated_at: string;
  updated_by_name: string | null;
};

export function toWinsalotIncentiveSettings(row: WinsalotIncentiveSettingsRow | null | undefined): WinsalotIncentiveSettings {
  if (!row) return DEFAULT_WINSALOT_INCENTIVE_SETTINGS;
  return {
    leadgenWeeklyQuota: row.leadgen_weekly_quota,
    leadgenWeeklyBonusAmount: row.leadgen_weekly_bonus_amount,
    crmWeeklyQuota: row.crm_weekly_quota,
    crmWeeklyBonusAmount: row.crm_weekly_bonus_amount,
    monthlyCap: row.monthly_cap,
  };
}

export type WinsalotIncentiveCrm = "leadgen" | "cleaning";

export type WinsalotLedgerRowStatus = "pending" | "approved" | "paid";

// Shape of a row in winsalot_agent_incentive_ledger (migration 0059).
export type WinsalotAgentIncentiveLedgerRow = {
  id: string;
  crm: WinsalotIncentiveCrm;
  source_leadgen_user_id: string | null;
  source_crm_user_id: string | null;
  agent_email: string;
  agent_name: string;
  week_start: string;
  week_end: string;
  month_start: string;
  qualified_count: number;
  weekly_quota: number;
  quota_met: boolean;
  calculated_bonus: number;
  approved_total: number | null;
  adjustment_reason: string | null;
  status: WinsalotLedgerRowStatus;
  approved_by_name: string | null;
  approved_at: string | null;
  paid_by_name: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

// Display status for a period, layering "no admin action has happened
// yet for this period" (not_calculated - no ledger row exists) on top of
// the database's own status values.
export type WinsalotIncentivePeriodStatus = "not_calculated" | WinsalotLedgerRowStatus;

export function winsalotIncentivePeriodStatus(
  ledgerRow: Pick<WinsalotAgentIncentiveLedgerRow, "status"> | null | undefined
): WinsalotIncentivePeriodStatus {
  return ledgerRow?.status ?? "not_calculated";
}

export const WINSALOT_INCENTIVE_STATUS_LABEL: Record<WinsalotIncentivePeriodStatus, string> = {
  not_calculated: "Awaiting Admin Review",
  pending: "Pending Approval",
  approved: "Approved",
  paid: "Paid",
};

export const WINSALOT_INCENTIVE_STATUS_STYLES: Record<WinsalotIncentivePeriodStatus, string> = {
  not_calculated: "bg-slate-100 text-slate-600",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
};

export function normalizeIncentiveEmail(email: string): string {
  return email.trim().toLowerCase();
}
