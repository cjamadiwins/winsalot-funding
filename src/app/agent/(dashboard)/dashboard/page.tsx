import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { AgentAttendanceRow, CrmFollowUpWithLead, CrmLeadRow } from "@/lib/crm-types";
import type { ProviderFollowUpWithLead } from "@/lib/provider-types";
import { getCrmPerformanceRecords } from "@/lib/crm-performance-data";
import { computeCrmAgentPerformance, crmPerformanceTier, crmBiweeklyRangeLabel } from "@/lib/crm-performance";
import PerformanceRing from "@/components/crm-ui/PerformanceRing";
import AgentDashboardClient from "./AgentDashboardClient";
import FollowUpCalendar from "./FollowUpCalendar";
import OverdueLeadsPanel from "./OverdueLeadsPanel";
import ProviderFollowUps from "./ProviderFollowUps";
import AttendanceCard from "./AttendanceCard";

export default async function AgentDashboardPage({
  searchParams,
}: {
  // stage/followup are set by the "My Leads" stat cards below (see
  // AgentDashboardClient.tsx) to pre-filter the list on the same page -
  // same convention as the Leads CRM's clickable dashboard cards.
  searchParams: Promise<{ stage?: string; followup?: string }>;
}) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();
  const { stage, followup } = await searchParams;

  // RLS (crm_leads_agent_select_own / crm_followups_agent_select_own_lead)
  // already restricts both of these to leads assigned to the signed-in
  // agent, so no extra filtering is needed here.
  const [
    { data: leadsData, error: leadsError },
    { data: followUpsData, error: followUpsError },
    { data: providerFollowUpsData, error: providerFollowUpsError },
    { data: attendanceData, error: attendanceError },
  ] = await Promise.all([
    supabase.from("crm_leads").select("*").order("created_at", { ascending: false }),
    supabase
      .from("crm_followups")
      .select("*, crm_leads(id, business_name, phone, city, assigned_agent_id)")
      .eq("status", "pending")
      // crm_followups also holds opportunity- and provider-lead-targeted
      // rows (migrations 0013/0026) - this dashboard's Follow-Up Calendar
      // is lead-only, so exclude those explicitly rather than relying on
      // RLS alone (which permits all three target types).
      .not("lead_id", "is", null)
      .order("scheduled_at", { ascending: true }),
    // Provider Acquisition's own "Provider Follow-ups" section (brief
    // section 9) - deliberately a separate query/section from the
    // Follow-Up Calendar above, never mixed with customer-lead callbacks.
    supabase
      .from("crm_followups")
      .select(
        "*, provider_leads(id, business_name, contact_person, phone, email, status, assigned_agent_id, intake_completed_at, cleaning_provider_id)"
      )
      .eq("status", "pending")
      .not("provider_lead_id", "is", null)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("agent_attendance")
      .select("*")
      .eq("agent_id", crmUser.id)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const leads = (leadsData ?? []) as CrmLeadRow[];
  const followUps = (followUpsData ?? []) as CrmFollowUpWithLead[];
  const providerFollowUps = (providerFollowUpsData ?? []) as ProviderFollowUpWithLead[];
  const openShift = attendanceError ? null : ((attendanceData ?? null) as AgentAttendanceRow | null);

  // Same helpers /agent/performance uses (getCrmPerformanceRecords +
  // computeCrmAgentPerformance) - reused here purely to surface a
  // read-only ring summary on the dashboard; no calculation logic
  // duplicated or changed.
  const performanceRecords = await getCrmPerformanceRecords(crmUser.id);
  const performance = computeCrmAgentPerformance(performanceRecords, crmUser.id);
  const performanceTier = crmPerformanceTier(performance.current.overallPercentage);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Welcome back, {crmUser.full_name || crmUser.email}.
          </p>
        </div>
        <Link
          href="/agent/leads/new"
          className="whitespace-nowrap rounded-full bg-[var(--color-accent)] px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          + Add Lead
        </Link>
      </div>

      <section className="mt-6 flex flex-col items-center gap-5 rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <PerformanceRing percentage={performance.current.overallPercentage} tier={performanceTier} label="of biweekly target" size={112} strokeWidth={10} />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">Performance</div>
            <div className="mt-1 text-[15px] font-bold text-[var(--crm-text)]">
              {performance.current.quotesSent} quotes sent · {performance.current.quotesReceived} received
            </div>
            <div className="mt-0.5 text-[12.5px] text-[var(--crm-text-muted)]">
              Period: {crmBiweeklyRangeLabel(performance.current.periodStart, performance.current.periodEnd)}
            </div>
          </div>
        </div>
        <Link href="/agent/performance" className="whitespace-nowrap text-[13.5px] font-semibold text-[var(--crm-accent)] hover:opacity-80">
          View full report →
        </Link>
      </section>

      <AttendanceCard openShift={openShift} />
      {attendanceError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load attendance: {attendanceError.message}
        </p>
      )}

      {!leadsError && !followUpsError && (
        <div className="mt-8">
          <OverdueLeadsPanel leads={leads} followUps={followUps} />
        </div>
      )}

      <h2 className="mt-8 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">
        Follow-Up Calendar
      </h2>
      {followUpsError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load your follow-up calendar: {followUpsError.message}
        </p>
      )}
      {!followUpsError && (
        <div className="mt-3">
          <FollowUpCalendar followUps={followUps} leads={leads} />
        </div>
      )}

      <h2 className="mt-10 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">
        Provider Follow-ups
      </h2>
      {providerFollowUpsError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load provider follow-ups: {providerFollowUpsError.message}
        </p>
      )}
      {!providerFollowUpsError && (
        <div className="mt-3">
          <ProviderFollowUps followUps={providerFollowUps} />
        </div>
      )}

      <h2 id="my-leads" className="mt-10 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">
        My Leads
      </h2>

      {leadsError && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load leads: {leadsError.message}
        </p>
      )}

      {!leadsError && (
        <AgentDashboardClient
          // Force a remount when the URL filter changes, since Next.js
          // reuses this client component across same-route navigations -
          // without this, clicking a different stat card while already
          // on the dashboard wouldn't re-seed the filter state below.
          key={`${stage ?? "all"}|${followup ?? "all"}`}
          leads={leads}
          initialStageFilter={stage}
          initialFollowUpFilter={followup === "due_today" || followup === "overdue" ? followup : undefined}
        />
      )}
    </div>
  );
}
