import Link from "next/link";
import { Users, Clock, AlertTriangle, UserCheck } from "lucide-react";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  LEADGEN_LEAD_STATUS_STYLES,
  LEADGEN_STAT_CARD_STYLES,
  isLeadgenFollowUpDueToday,
  isLeadgenFollowUpOverdue,
  type LeadgenAgentAttendanceRow,
  type LeadgenFollowUpWithLead,
  type LeadgenLeadRow,
} from "@/lib/leadgen-types";
import { computeLeadgenAgentPerformance, leadgenPerformanceTier, leadgenWeekRangeLabel, type LeadgenPerformanceAppointment } from "@/lib/leadgen-performance";
import { computeLeadgenWeeklyIncentive, leadgenCurrentIncentiveWeek, type LeadgenIncentiveAppointment } from "@/lib/leadgen-incentives";
import { deriveWeeklyIncentiveDisplayStatus, isMonthlyIncentiveCapReached, monthStartOfWeek } from "@/lib/agent-incentive-shared";
import { fetchAgentMonthToDateApproved, fetchLedgerRow, fetchWinsalotIncentiveSettings } from "@/lib/agent-incentive-ledger";
import KpiCard from "@/components/crm-ui/KpiCard";
import PerformanceRing from "@/components/crm-ui/PerformanceRing";
import AgentWeeklyIncentiveCard from "@/components/crm-ui/AgentWeeklyIncentiveCard";
import { completeFollowUpAction } from "./leads/[id]/actions";
import LeadgenAttendanceCard from "./LeadgenAttendanceCard";
import LeadToAppointmentRateCard from "./LeadToAppointmentRateCard";

export default async function LeadgenAgentDashboardPage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdmin();

  const { weekStart, weekEnd } = leadgenCurrentIncentiveWeek();
  const monthStart = monthStartOfWeek(weekStart);

  const [
    { data: leads },
    { data: followUps },
    { data: attendanceData, error: attendanceError },
    { data: appointments },
    settings,
    ledgerRow,
    monthToDateApproved,
  ] = await Promise.all([
    supabase.from("leadgen_leads").select("*").order("created_at", { ascending: false }),
    supabase
      .from("leadgen_followups")
      .select("*, leadgen_leads(id, business_name, contact_name, phone, email, status, next_follow_up_at)")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("leadgen_agent_attendance")
      .select("*")
      .eq("agent_id", agent.id)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Same source /leadgen/agent/performance reads, reused here only to
    // surface a read-only ring summary on the dashboard - no calculation
    // logic duplicated or changed. incentive_status is additionally
    // selected for the Weekly Incentive card below.
    supabase
      .from("leadgen_appointments")
      .select("id, business_name, contact_name, appointment_date, appointment_time, status, created_at, booking_agent_id, incentive_status")
      .order("appointment_date", { ascending: false }),
    fetchWinsalotIncentiveSettings(supabase),
    fetchLedgerRow(supabase, "leadgen", agent.email, weekStart),
    // Service-role, narrowly filtered to this signed-in agent's own
    // email - see the header comment on fetchAgentMonthToDateApproved
    // for why RLS alone can't serve a cross-CRM total.
    fetchAgentMonthToDateApproved(admin, agent.email, monthStart),
  ]);

  const myLeads = (leads ?? []) as LeadgenLeadRow[];
  const performance = computeLeadgenAgentPerformance((appointments ?? []) as LeadgenPerformanceAppointment[], agent.id);
  const performanceTier = leadgenPerformanceTier(performance.percentage);
  const openShift = attendanceError ? null : ((attendanceData ?? null) as LeadgenAgentAttendanceRow | null);
  const weeklyIncentive = computeLeadgenWeeklyIncentive(
    (appointments ?? []) as LeadgenIncentiveAppointment[],
    agent.id,
    weekStart,
    weekEnd,
    settings.leadgenWeeklyQuota,
    settings.leadgenWeeklyBonusAmount
  );
  const displayStatus = deriveWeeklyIncentiveDisplayStatus(weeklyIncentive.qualifiedCount, weeklyIncentive.quota, ledgerRow);
  const capReached = isMonthlyIncentiveCapReached(monthToDateApproved, settings.monthlyCap);
  const remainingToCap = Math.max(0, settings.monthlyCap - monthToDateApproved);
  const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  // Only count/show a follow-up if it's still its lead's authoritative
  // upcoming one (lead.next_follow_up_at === this row's scheduled_at) -
  // the same source of truth the Leads page's Due Today/Overdue filters
  // use (isLeadgenNextFollowUpDueToday/Overdue on next_follow_up_at), so
  // this list and its count can never drift out of sync with the Leads
  // page even if a stale "pending" row is ever left behind by a bug
  // elsewhere.
  const allFollowUps = ((followUps ?? []) as LeadgenFollowUpWithLead[]).filter(
    (followUp) => followUp.leadgen_leads?.next_follow_up_at === followUp.scheduled_at
  );
  const dueToday = allFollowUps.filter(isLeadgenFollowUpDueToday);
  const overdue = allFollowUps.filter(isLeadgenFollowUpOverdue);

  const statusCounts = new Map<string, number>();
  for (const lead of myLeads) statusCounts.set(lead.status, (statusCounts.get(lead.status) ?? 0) + 1);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Welcome, {agent.full_name}</h1>
      <p className="mt-1 text-sm text-slate-500">{myLeads.length} leads assigned to you.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          href="/leadgen/agent/leads"
          label="My Leads"
          value={String(myLeads.length)}
          tone={LEADGEN_STAT_CARD_STYLES.leads}
          icon={<Users />}
        />
        <KpiCard
          href="/leadgen/agent/leads?followup=due_today"
          label="Due Today"
          value={String(dueToday.length)}
          tone={LEADGEN_STAT_CARD_STYLES.dueToday}
          icon={<Clock />}
        />
        <KpiCard
          href="/leadgen/agent/leads?followup=overdue"
          label="Overdue"
          value={String(overdue.length)}
          tone={LEADGEN_STAT_CARD_STYLES.overdue}
          icon={<AlertTriangle />}
        />
        <KpiCard
          href={`/leadgen/agent/leads?status=${encodeURIComponent("Interested")}`}
          label="Interested"
          value={String(statusCounts.get("Interested") ?? 0)}
          tone={LEADGEN_STAT_CARD_STYLES.interested}
          icon={<UserCheck />}
        />
      </div>

      <section className="mt-6 flex flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <PerformanceRing percentage={performance.percentage} tier={performanceTier} label="of weekly target" size={112} strokeWidth={10} />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Performance</div>
            <div className="mt-1 text-[15px] font-bold text-[var(--crm-text)]">{performance.bookedThisWeek} booked this week</div>
            <div className="mt-0.5 text-[12.5px] text-slate-500">Week of {leadgenWeekRangeLabel(performance.weekStart, performance.weekEnd)}</div>
          </div>
        </div>
        <Link href="/leadgen/agent/performance" className="whitespace-nowrap text-[13.5px] font-semibold text-sky-600 hover:text-sky-700">
          View full report →
        </Link>
      </section>

      <LeadToAppointmentRateCard
        leads={myLeads.map((lead) => ({ id: lead.id, business_name: lead.business_name, status: lead.status, created_at: lead.created_at }))}
        serverNowIso={new Date().toISOString()}
      />

      <AgentWeeklyIncentiveCard
        crm="leadgen"
        weekLabel={leadgenWeekRangeLabel(weekStart, weekEnd)}
        recordLabel="qualified appointments"
        qualifiedCount={weeklyIncentive.qualifiedCount}
        quota={weeklyIncentive.quota}
        percentage={weeklyIncentive.percentage}
        quotaMet={weeklyIncentive.quotaMet}
        calculatedBonus={weeklyIncentive.calculatedBonus}
        weeklyBonusAmount={settings.leadgenWeeklyBonusAmount}
        displayStatus={displayStatus}
        monthLabel={monthLabel}
        monthToDateApproved={monthToDateApproved}
        monthlyCap={settings.monthlyCap}
        remainingToCap={remainingToCap}
        capReached={capReached}
        historyHref="/leadgen/agent/incentives/history"
      />

      <LeadgenAttendanceCard openShift={openShift} />
      {attendanceError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load attendance: {attendanceError.message}
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FollowUpGroup title="Overdue" items={overdue} emphasis="danger" />
        <FollowUpGroup title="Due Today" items={dueToday} emphasis="warn" />
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Training</h2>
        <p className="mt-2 text-[13.5px] text-slate-600">
          Keep the Brent&apos;s Essentials call script open while dialing to stay consistent on every call.
        </p>
        <Link href="/leadgen/agent/training" className="mt-3 inline-block text-[13.5px] font-semibold text-sky-600 hover:text-sky-700">
          Open Training
        </Link>
      </section>
    </div>
  );
}

function FollowUpGroup({ title, items, emphasis }: { title: string; items: LeadgenFollowUpWithLead[]; emphasis: "danger" | "warn" }) {
  const cardStyle = emphasis === "danger" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50";
  const titleStyle = emphasis === "danger" ? "text-rose-700" : "text-amber-700";

  return (
    <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h2 className={`text-[11.5px] font-semibold uppercase tracking-wide ${titleStyle}`}>
        {title} ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-slate-500">Nothing here.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((followUp) => {
            const lead = followUp.leadgen_leads;
            return (
              <li key={followUp.id} className={`rounded-lg border p-3.5 text-[13.5px] ${cardStyle}`}>
                <div className="flex items-center justify-between">
                  <Link href={`/leadgen/agent/leads/${followUp.lead_id}`} className="font-semibold text-slate-900 hover:text-sky-600">
                    {lead?.business_name ?? "Lead"}
                  </Link>
                  <span className="text-[12px] text-slate-500">{new Date(followUp.scheduled_at).toLocaleString()}</span>
                </div>
                {lead?.status && (
                  <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_LEAD_STATUS_STYLES[lead.status]}`}>
                    {lead.status}
                  </span>
                )}
                {followUp.note && <p className="mt-1.5 text-slate-700">{followUp.note}</p>}
                <form
                  action={async () => {
                    "use server";
                    await completeFollowUpAction(followUp.id, followUp.lead_id);
                  }}
                  className="mt-2"
                >
                  <button type="submit" className="text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800">
                    Mark Completed
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
