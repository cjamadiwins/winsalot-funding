import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addDays, leadgenDateKey, leadgenMondayOf, leadgenWeekRangeLabel } from "@/lib/leadgen-performance";
import { computeLeadgenWeeklyIncentive, type LeadgenIncentiveAppointment } from "@/lib/leadgen-incentives";
import { monthStartOfWeek, normalizeIncentiveEmail, toWinsalotIncentiveSettings, type WinsalotAgentIncentiveLedgerRow, type WinsalotIncentiveSettingsRow } from "@/lib/agent-incentive-shared";
import type { LeadgenUserRow } from "@/lib/leadgen-types";
import AdminWeeklyIncentivesClient, { type AdminIncentiveRow, type AuditRow } from "@/components/crm-ui/AdminWeeklyIncentivesClient";
import { approveLeadgenWeeklyBonusAction, markLeadgenBonusPaidAction, updateLeadgenIncentiveSettingsAction } from "./actions";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

// Admin's "Agent Incentives" section for the Lead Gen CRM half of the
// Weekly Agent Incentive feature - shares AdminWeeklyIncentivesClient
// (and the underlying winsalot_agent_incentive_ledger table) with the
// Cleaning CRM's own /admin/crm/incentives page, so the approve/adjust/
// pay flow and the cross-CRM ₦25,000 monthly cap can never drift between
// the two admin UIs.
export default async function LeadgenAdminIncentivesPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const { week } = await searchParams;

  const todayKey = leadgenDateKey(new Date());
  const weekStart = leadgenMondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : todayKey);
  const weekEnd = addDays(weekStart, 6);
  const monthStart = monthStartOfWeek(weekStart);

  const [{ data: agents }, { data: appointments }, { data: settingsRow }, { data: weekLedgerRows }, { data: monthLedgerRows }, { data: auditRows }] =
    await Promise.all([
      admin
        .from("leadgen_users")
        .select("id, full_name, email")
        .eq("role", "agent")
        .eq("active", true)
        .neq("email", DEACTIVATED_TEST_AGENT_EMAIL)
        .order("full_name"),
      admin.from("leadgen_appointments").select("id, created_at, booking_agent_id, incentive_status"),
      admin.from("winsalot_incentive_settings").select("*").maybeSingle(),
      admin.from("winsalot_agent_incentive_ledger").select("*").eq("crm", "leadgen").eq("week_start", weekStart),
      admin.from("winsalot_agent_incentive_ledger").select("agent_email, crm, week_start, approved_total, status").eq("month_start", monthStart),
      admin.from("winsalot_agent_incentive_audit").select("*").eq("crm", "leadgen").order("occurred_at", { ascending: false }).limit(100),
    ]);

  const allAgents = (agents ?? []) as Pick<LeadgenUserRow, "id" | "full_name" | "email">[];
  const allAppointments = (appointments ?? []) as LeadgenIncentiveAppointment[];
  const settings = toWinsalotIncentiveSettings(settingsRow as WinsalotIncentiveSettingsRow | null);
  const ledgerByAgent = new Map(
    ((weekLedgerRows ?? []) as WinsalotAgentIncentiveLedgerRow[]).map((row) => [normalizeIncentiveEmail(row.agent_email), row])
  );

  // This agent's approved+paid total for the month, across BOTH CRMs,
  // excluding this exact (leadgen, weekStart) row - the same "other"
  // total the cross-CRM cap check itself excludes, so what's shown here
  // always matches what the approve action will actually enforce.
  const monthToDateOtherByEmail = new Map<string, number>();
  for (const row of (monthLedgerRows ?? []) as Array<Pick<WinsalotAgentIncentiveLedgerRow, "agent_email" | "crm" | "week_start" | "approved_total" | "status">>) {
    if (row.status === "pending") continue;
    if (row.crm === "leadgen" && row.week_start === weekStart) continue;
    const email = normalizeIncentiveEmail(row.agent_email);
    monthToDateOtherByEmail.set(email, (monthToDateOtherByEmail.get(email) ?? 0) + (row.approved_total ?? 0));
  }

  const rows: AdminIncentiveRow[] = allAgents.map((agent) => {
    const calc = computeLeadgenWeeklyIncentive(allAppointments, agent.id, weekStart, weekEnd, settings.leadgenWeeklyQuota, settings.leadgenWeeklyBonusAmount);
    const email = normalizeIncentiveEmail(agent.email);
    return {
      agentId: agent.id,
      agentName: agent.full_name || agent.email,
      qualifiedCount: calc.qualifiedCount,
      quota: calc.quota,
      quotaMet: calc.quotaMet,
      calculatedBonus: calc.calculatedBonus,
      ledgerRow: ledgerByAgent.get(email) ?? null,
      monthToDateApprovedOther: monthToDateOtherByEmail.get(email) ?? 0,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Agent Incentives</h1>
      <p className="mt-1 text-sm text-slate-500">
        Weekly Incentive: a flat bonus for meeting the weekly qualified-appointment quota. No partial bonus for missing it.
        Only appointments an admin has reviewed as Qualified count.
      </p>

      <AdminWeeklyIncentivesClient
        recordLabel="Qualified Appointments"
        weekLabel={leadgenWeekRangeLabel(weekStart, weekEnd)}
        prevWeekHref={`?week=${addDays(weekStart, -7)}`}
        nextWeekHref={`?week=${addDays(weekStart, 7)}`}
        monthLabel={new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        settings={settings}
        quotaFieldName="leadgen_weekly_quota"
        amountFieldName="leadgen_weekly_bonus_amount"
        rows={rows}
        auditRows={(auditRows ?? []) as AuditRow[]}
        approveAction={approveLeadgenWeeklyBonusAction.bind(null, weekStart, weekEnd)}
        markPaidAction={markLeadgenBonusPaidAction}
        updateSettingsAction={updateLeadgenIncentiveSettingsAction}
      />
    </div>
  );
}
