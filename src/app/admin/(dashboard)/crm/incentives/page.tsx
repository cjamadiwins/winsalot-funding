import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addDays, crmDateKey } from "@/lib/crm-performance";
import { computeCrmWeeklyIncentive, computeCrmWeeklyRecordCounts, crmMondayOf } from "@/lib/crm-incentives";
import { getCrmIncentiveOpportunities } from "@/lib/crm-incentive-data";
import {
  monthStartOfWeek,
  normalizeIncentiveEmail,
  toWinsalotIncentiveSettings,
  type WinsalotAgentIncentiveLedgerRow,
  type WinsalotIncentiveSettingsRow,
} from "@/lib/agent-incentive-shared";
import type { CrmUserRow } from "@/lib/crm-types";
import AdminWeeklyIncentivesClient, { type AdminIncentiveRow, type AuditRow } from "@/components/crm-ui/AdminWeeklyIncentivesClient";
import { approveCrmWeeklyBonusAction, markCrmBonusPaidAction, rejectCrmWeeklyBonusAction, updateCrmIncentiveSettingsAction } from "./actions";

function formatDateRangeLabel(startKey: string, endKey: string): string {
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = new Date(ey, em - 1, ed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${start} – ${end}`;
}

// Admin's "Agent Incentives" section for the Winsalot Growth CRM half of the
// Weekly Agent Incentive feature - see src/app/leadgen/admin/(dashboard)/
// incentives/page.tsx for the Lead Gen CRM half; both share
// AdminWeeklyIncentivesClient and the central winsalot_agent_incentive_*
// tables (migration 0059) so the approve/adjust/pay flow and the
// cross-CRM ₦25,000 monthly cap can never drift between the two.
export default async function AdminCrmIncentivesPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireCrmAdmin();
  const admin = getSupabaseAdmin();
  const { week } = await searchParams;

  const todayKey = crmDateKey(new Date());
  const weekStart = crmMondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : todayKey);
  const weekEnd = addDays(weekStart, 6);
  const monthStart = monthStartOfWeek(weekStart);

  const [{ data: agents }, quotes, { data: settingsRow }, { data: weekLedgerRows }, { data: monthLedgerRows }, { data: auditRows }] = await Promise.all([
    admin.from("crm_users").select("id, full_name, email").eq("role", "agent").eq("active", true).order("full_name"),
    getCrmIncentiveOpportunities(),
    admin.from("winsalot_incentive_settings").select("*").maybeSingle(),
    admin.from("winsalot_agent_incentive_ledger").select("*").eq("crm", "cleaning").eq("week_start", weekStart),
    admin.from("winsalot_agent_incentive_ledger").select("agent_email, crm, week_start, approved_total, status").eq("month_start", monthStart),
    admin.from("winsalot_agent_incentive_audit").select("*").eq("crm", "cleaning").order("occurred_at", { ascending: false }).limit(100),
  ]);

  const allAgents = (agents ?? []) as Pick<CrmUserRow, "id" | "full_name" | "email">[];
  const settings = toWinsalotIncentiveSettings(settingsRow as WinsalotIncentiveSettingsRow | null);
  const ledgerByAgent = new Map(
    ((weekLedgerRows ?? []) as WinsalotAgentIncentiveLedgerRow[]).map((row) => [normalizeIncentiveEmail(row.agent_email), row])
  );

  const monthToDateOtherByEmail = new Map<string, number>();
  for (const row of (monthLedgerRows ?? []) as Array<Pick<WinsalotAgentIncentiveLedgerRow, "agent_email" | "crm" | "week_start" | "approved_total" | "status">>) {
    if (row.status === "pending") continue;
    if (row.crm === "cleaning" && row.week_start === weekStart) continue;
    const email = normalizeIncentiveEmail(row.agent_email);
    monthToDateOtherByEmail.set(email, (monthToDateOtherByEmail.get(email) ?? 0) + (row.approved_total ?? 0));
  }

  const rows: AdminIncentiveRow[] = allAgents.map((agent) => {
    const calc = computeCrmWeeklyIncentive(quotes, agent.id, weekStart, weekEnd, settings.crmWeeklyQuota, settings.crmWeeklyBonusAmount);
    const counts = computeCrmWeeklyRecordCounts(quotes, agent.id, weekStart, weekEnd);
    const email = normalizeIncentiveEmail(agent.email);
    return {
      agentId: agent.id,
      agentName: agent.full_name || agent.email,
      rawCount: counts.rawCount,
      qualifiedCount: calc.qualifiedCount,
      rejectedCount: counts.rejectedCount,
      quota: calc.quota,
      quotaMet: calc.quotaMet,
      calculatedBonus: calc.calculatedBonus,
      ledgerRow: ledgerByAgent.get(email) ?? null,
      monthToDateApprovedOther: monthToDateOtherByEmail.get(email) ?? 0,
    };
  });

  const weekLabel = formatDateRangeLabel(weekStart, weekEnd);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Agent Incentives</h1>
      <p className="mt-1 text-sm text-slate-500">
        Weekly Incentive: a flat bonus for meeting the weekly clients-won quota. No partial bonus for missing it.
        Only opportunities closed as Client Won count.
      </p>

      <AdminWeeklyIncentivesClient
        crm="cleaning"
        recordLabel="Clients Won"
        recordsHref="/admin/crm"
        weekLabel={weekLabel}
        prevWeekHref={`?week=${addDays(weekStart, -7)}`}
        nextWeekHref={`?week=${addDays(weekStart, 7)}`}
        monthLabel={new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        settings={settings}
        quotaFieldName="crm_weekly_quota"
        amountFieldName="crm_weekly_bonus_amount"
        rows={rows}
        auditRows={(auditRows ?? []) as AuditRow[]}
        approveAction={approveCrmWeeklyBonusAction.bind(null, weekStart, weekEnd)}
        rejectAction={rejectCrmWeeklyBonusAction.bind(null, weekStart, weekEnd)}
        markPaidAction={markCrmBonusPaidAction}
        updateSettingsAction={updateCrmIncentiveSettingsAction}
      />
    </div>
  );
}
