import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDueToday, isOverdue, type CrmFollowUpWithOpportunity, type CrmOpportunityRow, type CrmUserRow } from "@/lib/crm-types";
import { getCrmOpportunityConversionRecords } from "@/lib/crm-conversion-data";
import AdminCrmClient from "./AdminCrmClient";
import AdminFollowUps from "./AdminFollowUps";
import AdminOverdueOpportunitiesPanel from "./AdminOverdueOpportunitiesPanel";
import ResultsByAgentConversion from "@/components/ResultsByAgentConversion";
import DialpadDashboardPreview from "@/components/dialpad/DialpadDashboardPreview";
import { loadDialpadDashboardData } from "@/lib/dialpad-report-data";
import KpiCard from "@/components/crm-ui/KpiCard";
import { effectiveOpportunityCategory, OPPORTUNITY_CATEGORY_KPI_TONE, type CrmOpportunityScoreRow } from "@/lib/opportunity-finder";
import { Flame, Gauge, Snowflake, CalendarClock, Trophy, Users, UserCheck, CalendarCheck, Clock, UserPlus, CalendarPlus, BarChart3 } from "lucide-react";

// The Winsalot Growth CRM's one admin dashboard - every sales opportunity
// (Lead Generation, Business Financing, or both), their stage pipeline,
// and follow-ups across every agent. Replaces the old bid-scraper
// Provider Acquisition dashboard that used to live at this URL (now
// deleted) and the old crm_leads-based Quote Fulfillment dashboard (moved
// here from /admin/crm/leads, which is being removed in a separate
// cleanup pass) - crm_opportunities is the one pipeline table going
// forward, see supabase/migrations/0080-0085.
export default async function AdminCrmPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const supabase = await createSupabaseServerClient();

  // RLS (crm_opportunities_admin_all / crm_users_admin_select_all /
  // crm_followups_admin_all) permits a full read here because this page
  // is already gated by requireCrmAdmin().
  const [
    { data: opportunities, error: opportunitiesError },
    { data: agents, error: agentsError },
    { data: followUps, error: followUpsError },
    conversionRecords,
    dialpadData,
    { data: opportunityScores },
  ] = await Promise.all([
    supabase.from("crm_opportunities").select("*").order("created_at", { ascending: false }),
    supabase.from("crm_users").select("*").order("full_name"),
    supabase
      .from("crm_followups")
      .select("*, crm_opportunities(id, business_name, phone, city, assigned_agent_id, opportunity_type)")
      .eq("status", "pending")
      // crm_followups also holds lead-targeted rows for the now-frozen
      // crm_leads pipeline (lead_id) - this dashboard's follow-ups are
      // opportunity-only, so exclude those explicitly rather than relying
      // on RLS alone (which permits both).
      .not("opportunity_id", "is", null)
      .order("scheduled_at", { ascending: true }),
    // Prospect-to-Client Rate KPI (Results by Agent, below) - a separate
    // service-role read since it needs every agent's opportunities in one
    // shot regardless of RLS scoping, same as the existing biweekly Agent
    // Performance Report's getCrmPerformanceRecords().
    getCrmOpportunityConversionRecords(),
    loadDialpadDashboardData(supabase),
    // Opportunity Finder counters, below - one lightweight read of the
    // scoring table (supabase/migrations/0112), joined against the
    // opportunities already fetched above rather than re-fetching them.
    supabase.from("crm_opportunity_scores").select("opportunity_id, category, priority_override, finder_state"),
  ]);

  const activeAgents = ((agents ?? []) as CrmUserRow[]).filter((agent) => agent.role === "agent" && agent.active);

  const nowMs = new Date().getTime();
  const opportunityById = new Map(((opportunities ?? []) as CrmOpportunityRow[]).map((o) => [o.id, o]));
  const scoreCounts = { high: 0, medium: 0, low: 0, followUpsDue: 0 };
  for (const raw of (opportunityScores ?? []) as Pick<CrmOpportunityScoreRow, "opportunity_id" | "category" | "priority_override" | "finder_state">[]) {
    const effective = effectiveOpportunityCategory(raw);
    if (effective === "high") scoreCounts.high += 1;
    else if (effective === "medium") scoreCounts.medium += 1;
    else if (effective === "low") scoreCounts.low += 1;
    const nextFollowUpAt = opportunityById.get(raw.opportunity_id)?.next_follow_up_at;
    if (nextFollowUpAt && new Date(nextFollowUpAt).getTime() <= nowMs) scoreCounts.followUpsDue += 1;
  }
  // Main KPI row below - the same crm_opportunities rows already fetched
  // above, just five of the most-used counts surfaced at the top of the
  // page (matching the Lead Generation CRM dashboard's layout) instead of
  // only inside AdminCrmClient's fuller 8-card filter grid further down.
  // Each predicate mirrors AdminCrmClient's own card logic exactly (same
  // source array, same rules) rather than a second calculation method.
  const allOpportunities = (opportunities ?? []) as CrmOpportunityRow[];
  const totalOpportunities = allOpportunities.length;
  const interestedOpportunities = allOpportunities.filter((o) => o.stage === "Interested").length;
  const consultationsBooked = allOpportunities.filter((o) => o.stage === "Consultation Booked").length;
  const followUpsDue = allOpportunities.filter((o) => isOverdue(o) || isDueToday(o)).length;
  const convertedCount = allOpportunities.filter((o) => o.stage === "Client Won").length;

  const mainStats = [
    { label: "Total Opportunities", value: totalOpportunities, icon: Users, tone: "blue" as const },
    { label: "Interested Opportunities", value: interestedOpportunities, icon: UserCheck, tone: "indigo" as const },
    { label: "Consultations Booked", value: consultationsBooked, icon: CalendarCheck, tone: "green" as const },
    { label: "Follow-Ups Due", value: followUpsDue, icon: Clock, tone: "amber" as const },
    { label: "Clients Won", value: convertedCount, icon: Trophy, tone: "purple" as const },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Good afternoon, Winsalot Corp.
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sales opportunities, follow-ups, and results across every agent - Lead Generation and Business Financing,
            from initial prospect through to a client won or lost.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/admin/crm/opportunities/new"
            className="flex items-center gap-2 rounded-[11px] bg-[var(--crm-accent,#3e7ef7)] px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-[var(--crm-accent-hover,#2e63d6)]"
          >
            <UserPlus className="h-4 w-4" strokeWidth={2.3} />
            Add Opportunity
          </Link>
          <Link
            href="/admin/crm/appointments?openAdd=1"
            className="flex items-center gap-2 rounded-[11px] border-[1.5px] border-[var(--crm-accent,#3e7ef7)]/30 bg-white px-4 py-2.5 text-[13.5px] font-bold text-[var(--crm-accent,#3e7ef7)] transition hover:bg-[var(--crm-bg-2,#eaf0f6)]"
          >
            <CalendarPlus className="h-4 w-4" strokeWidth={2.3} />
            Book Call / Appointment
          </Link>
          <Link
            href="/admin/crm/clients"
            className="flex items-center gap-2 rounded-[11px] bg-teal-600 px-4 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-teal-700"
          >
            <BarChart3 className="h-4 w-4" strokeWidth={2.3} />
            View Reports
          </Link>
        </div>
      </div>

      {deleted === "opportunity" && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          Opportunity deleted successfully.
        </p>
      )}

      {(opportunitiesError || agentsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load CRM data: {(opportunitiesError ?? agentsError)?.message}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {mainStats.map((stat) => (
          <KpiCard key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} icon={<stat.icon />} />
        ))}
      </div>

      <h2 className="mt-8 text-lg font-bold text-slate-900">Opportunity Finder</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="High Opportunities" value={scoreCounts.high} icon={<Flame />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.high} href="/admin/crm/opportunity-finder?category=high" />
        <KpiCard label="Medium Opportunities" value={scoreCounts.medium} icon={<Gauge />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.medium} href="/admin/crm/opportunity-finder?category=medium" />
        <KpiCard label="Low Opportunities" value={scoreCounts.low} icon={<Snowflake />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.low} href="/admin/crm/opportunity-finder?category=low" />
        <KpiCard label="Follow-Ups Due" value={scoreCounts.followUpsDue} icon={<CalendarClock />} tone="orange" href="/admin/crm/opportunity-finder?followup=due" />
        <KpiCard label="Opportunities Converted" value={convertedCount} icon={<Trophy />} tone="green" href="/admin/crm/opportunity-finder?category=closed" />
      </div>

      <DialpadDashboardPreview
        audience="admin"
        report={dialpadData.selectedReport}
        summaries={dialpadData.summaries}
        fullReportHref="/admin/crm/dialpad"
      />

      {!opportunitiesError && !agentsError && !followUpsError && (
        <div className="mt-6">
          <AdminOverdueOpportunitiesPanel
            opportunities={(opportunities ?? []) as CrmOpportunityRow[]}
            followUps={(followUps ?? []) as CrmFollowUpWithOpportunity[]}
            agents={(agents ?? []) as CrmUserRow[]}
          />
        </div>
      )}

      {!opportunitiesError && !agentsError && (
        <div className="mt-6">
          <AdminCrmClient
            opportunities={(opportunities ?? []) as CrmOpportunityRow[]}
            agents={(agents ?? []) as CrmUserRow[]}
          />
        </div>
      )}

      {!agentsError && (
        <ResultsByAgentConversion
          agents={activeAgents}
          records={conversionRecords}
          serverNowIso={new Date().toISOString()}
          opportunityHrefBase="/admin/crm/opportunities"
        />
      )}

      <h2 className="mt-10 text-lg font-bold text-slate-900">All Agents&apos; Follow-Ups</h2>
      {followUpsError ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load follow-ups: {followUpsError.message}
        </p>
      ) : (
        <div className="mt-3">
          <AdminFollowUps
            followUps={(followUps ?? []) as CrmFollowUpWithOpportunity[]}
            agents={(agents ?? []) as CrmUserRow[]}
          />
        </div>
      )}
    </div>
  );
}
