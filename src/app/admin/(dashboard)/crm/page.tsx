import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { isDueToday, isOverdue, OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_STYLES, type CrmFollowUpWithOpportunity, type CrmOpportunityRow, type CrmUserRow } from "@/lib/crm-types";
import OpportunityPipelineSummaryCard from "@/components/crm-ui/OpportunityPipelineSummaryCard";
import { getCrmOpportunityConversionRecords } from "@/lib/crm-conversion-data";
import AdminCrmClient from "./AdminCrmClient";
import AdminFollowUps from "./AdminFollowUps";
import AdminOverdueOpportunitiesPanel from "./AdminOverdueOpportunitiesPanel";
import ResultsByAgentConversion from "@/components/ResultsByAgentConversion";
import DialpadDashboardPreview from "@/components/dialpad/DialpadDashboardPreview";
import { loadDialpadDashboardData } from "@/lib/dialpad-report-data";
import KpiCard from "@/components/crm-ui/KpiCard";
import { effectiveOpportunityCategory, opportunityPriorityLevel, OPPORTUNITY_CATEGORY_KPI_TONE, type CrmOpportunityScoreRow } from "@/lib/opportunity-finder";
import { Flame, Gauge, Snowflake, CalendarClock, Trophy, Users, UserCheck, CalendarCheck, Clock, UserPlus, CalendarPlus, BarChart3 } from "lucide-react";
import { loadAdminOpportunityFinderData } from "@/lib/admin-opportunity-finder-data";
import OpportunityFinderModalTrigger from "./opportunity-finder/OpportunityFinderModalTrigger";
import CrmOpportunityRecordsModal from "@/components/crm-ui/CrmOpportunityRecordsModal";
import CrmConsultationRecordsModal from "@/components/crm-ui/CrmConsultationRecordsModal";
import { addBoardOpportunityNoteAction } from "./opportunity-finder/actions";
import { completeFollowUpAction, rescheduleFollowUpAction, scheduleFollowUpAction } from "./followup-actions";
import { getCrmPerformanceRecords } from "@/lib/crm-performance-data";
import { computeCrmAgentPerformance, crmWeeklyRangeLabel, crmPerformanceTier } from "@/lib/crm-performance";
import AdminPerformanceGaugeGrid from "@/components/crm-ui/AdminPerformanceGaugeGrid";
import { GROWTH_CRM_GAUGE_SEGMENTS } from "@/lib/performance-gauge";
import { buildOpportunityCardRecords, sortByMostRecentlyWon, sortByMostUrgentFollowUp } from "@/lib/crm-dashboard-records";
import { getBookedConsultationRecords, sortConsultationsUpcomingFirst } from "@/lib/winsalot-consultation-data";

// The Winsalot Growth CRM's one admin dashboard - every sales opportunity
// (Lead Generation, Business Financing, or both), their stage pipeline,
// and follow-ups across every agent. Replaces the old bid-scraper
// Provider Acquisition dashboard that used to live at this URL (now
// deleted) and the old crm_leads-based Quote Fulfillment dashboard (moved
// here from /admin/crm/leads, which is being removed in a separate
// cleanup pass) - crm_opportunities is the one pipeline table going
// forward, see supabase/migrations/0080-0085.
export default async function AdminCrmPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireCrmAdmin();
  const { deleted } = await searchParams;
  const supabase = await createSupabaseServerClient();

  // RLS (crm_opportunities_admin_all / crm_users_admin_select_all /
  // crm_followups_admin_all / winsalot_appointments_admin_all) permits a
  // full read here because this page is already gated by requireCrmAdmin().
  const [
    { data: opportunities, error: opportunitiesError },
    { data: agents, error: agentsError },
    { data: followUps, error: followUpsError },
    conversionRecords,
    dialpadData,
    { data: opportunityScores },
    performanceRecords,
    consultationRecordsRaw,
    opportunityFinderData,
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
    // shot regardless of RLS scoping, same as the existing weekly Agent
    // Performance Report's getCrmPerformanceRecords().
    getCrmOpportunityConversionRecords(),
    loadDialpadDashboardData(supabase),
    // Opportunity Finder counters, below - one lightweight read of the
    // scoring table (supabase/migrations/0112), joined against the
    // opportunities already fetched above rather than re-fetching them.
    supabase.from("crm_opportunity_scores").select("*").order("score", { ascending: false }),
    getCrmPerformanceRecords(),
    // Consultations Booked (below) - a genuine winsalot_appointments row
    // with status='booked', not just an opportunity whose stage happens to
    // read "Consultation Booked" (see winsalot-consultation-data.ts).
    getBookedConsultationRecords(supabase),
    // Opportunity Finder dashboard modal (below) - the exact same rows,
    // agents, clients, and industries dataset the standalone Opportunity
    // Finder page loads, so the modal is never a lighter/different dataset.
    loadAdminOpportunityFinderData(),
  ]);

  const activeAgents = ((agents ?? []) as CrmUserRow[]).filter((agent) => agent.role === "agent" && agent.active);

  const scoreCounts = { hot: 0, warm: 0, followUp: 0, retry: 0 };
  const scoredOpportunities = (opportunityScores ?? []) as CrmOpportunityScoreRow[];
  for (const raw of scoredOpportunities) {
    const effective = effectiveOpportunityCategory(raw);
    if (effective === "hot") scoreCounts.hot += 1;
    else if (effective === "warm") scoreCounts.warm += 1;
    else if (effective === "follow_up") scoreCounts.followUp += 1;
    else if (effective === "retry") scoreCounts.retry += 1;
  }
  const allOpportunities = (opportunities ?? []) as CrmOpportunityRow[];
  const agentNameById = new Map(activeAgents.map((agent) => [agent.id, agent.full_name || agent.email] as const));

  // Main KPI row below (and AdminCrmClient's own fuller 8-card grid
  // further down) - one enriched copy of every opportunity (agent name,
  // latest call outcome/note from Opportunity Finder's signals, earliest
  // pending follow-up id), then each card's own count AND its drill-down
  // modal's rows are both `.filter()`ed from this exact same array, so a
  // card's number can never disagree with what clicking it shows.
  const enrichedOpportunities = buildOpportunityCardRecords(allOpportunities, {
    scores: scoredOpportunities,
    followUps: (followUps ?? []) as CrmFollowUpWithOpportunity[],
    agentNameById,
  });
  const interestedRecords = enrichedOpportunities.filter((o) => o.stage === "Interested");
  const followUpsDueRecords = sortByMostUrgentFollowUp(enrichedOpportunities.filter((o) => isOverdue(o) || isDueToday(o)));
  const wonRecords = sortByMostRecentlyWon(enrichedOpportunities.filter((o) => o.stage === "Client Won"));
  // Consultations Booked - a real winsalot_appointments row with
  // status='booked', not an opportunity stage (see the fetch above).
  const consultationRecords = sortConsultationsUpcomingFirst(consultationRecordsRaw);
  // Opportunity Finder dashboard modal's trigger "N Hot" badge - same
  // numeric-score-based "hot" definition (opportunityPriorityLevel) the
  // modal's own list uses, counted over active (not dismissed) rows only.
  const opportunityFinderHotCount = opportunityFinderData.rows.filter(
    (row) => row.score.finder_state === "active" && opportunityPriorityLevel(row.score.score) === "hot"
  ).length;

  // Opportunity Pipeline summary card (below) - stage counts from the
  // same allOpportunities array already fetched above, no new query.
  const pipelineStageCounts = OPPORTUNITY_STAGES.map((stage) => ({
    label: stage,
    count: allOpportunities.filter((o) => o.stage === stage).length,
    styleClass: OPPORTUNITY_STAGE_STYLES[stage],
  }));

  const performanceGaugeRows = activeAgents.map((agent) => {
    const performance = computeCrmAgentPerformance(performanceRecords, agent.id).current;
    return {
      id: agent.id,
      agentName: agent.full_name || agent.email,
      score: performance.overallPercentage,
      tier: crmPerformanceTier(performance.overallPercentage),
      summary: `${performance.consultationsBooked} consultations · ${performance.leadsAdded} leads added`,
      periodLabel: crmWeeklyRangeLabel(performance.periodStart, performance.periodEnd),
    };
  });

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
            href="/admin/crm/performance"
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
        <CrmOpportunityRecordsModal
          label="Total Opportunities"
          tone="blue"
          icon={<Users />}
          records={enrichedOpportunities}
          opportunityHrefBase="/admin/crm/opportunities"
          recordNoun="opportunity"
          onAddNote={addBoardOpportunityNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onReschedule={rescheduleFollowUpAction}
        />
        <CrmOpportunityRecordsModal
          label="Interested Opportunities"
          tone="indigo"
          icon={<UserCheck />}
          records={interestedRecords}
          opportunityHrefBase="/admin/crm/opportunities"
          recordNoun="opportunity"
          emptyMessage="No interested opportunities right now."
          onAddNote={addBoardOpportunityNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onReschedule={rescheduleFollowUpAction}
        />
        <CrmConsultationRecordsModal
          label="Consultations Booked"
          tone="green"
          icon={<CalendarCheck />}
          records={consultationRecords}
          opportunityHrefBase="/admin/crm/opportunities"
          appointmentsHref="/admin/crm/appointments"
        />
        <CrmOpportunityRecordsModal
          label="Follow-Ups Due"
          tone="amber"
          icon={<Clock />}
          records={followUpsDueRecords}
          opportunityHrefBase="/admin/crm/opportunities"
          recordNoun="follow-up"
          emptyMessage="No follow-ups due right now."
          onAddNote={addBoardOpportunityNoteAction}
          onCompleteFollowUp={completeFollowUpAction}
          onReschedule={rescheduleFollowUpAction}
        />
        <CrmOpportunityRecordsModal
          label="Clients Won"
          tone="purple"
          icon={<Trophy />}
          records={wonRecords}
          opportunityHrefBase="/admin/crm/opportunities"
          recordNoun="client"
          emptyMessage="No clients won yet."
          onAddNote={addBoardOpportunityNoteAction}
        />
      </div>

      <h2 className="mt-8 text-lg font-bold text-slate-900">Opportunity Finder</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Hot" value={scoreCounts.hot} icon={<Flame />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.hot} href="/admin/crm/opportunity-finder?category=hot" />
        <KpiCard label="Warm" value={scoreCounts.warm} icon={<Gauge />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.warm} href="/admin/crm/opportunity-finder?category=warm" />
        <KpiCard label="Follow-Up" value={scoreCounts.followUp} icon={<CalendarClock />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.follow_up} href="/admin/crm/opportunity-finder?category=follow_up" />
        <KpiCard label="Retry" value={scoreCounts.retry} icon={<Snowflake />} tone={OPPORTUNITY_CATEGORY_KPI_TONE.retry} href="/admin/crm/opportunity-finder?category=retry" />
        {/* "Opportunities Converted" is the same definition and the same
            records as the "Clients Won" card above (stage === "Client
            Won") - it used to link to the Opportunity Finder's own
            category=closed filter, which is a different, broader concept
            (won, not-interested, OR an appointment booked with nothing
            else outstanding - see opportunity-finder.ts), so a converted
            count here could disagree with what that page showed. Reusing
            the exact same wonRecords array fixes that. */}
        <CrmOpportunityRecordsModal
          label="Opportunities Converted"
          tone="green"
          icon={<Trophy />}
          records={wonRecords}
          opportunityHrefBase="/admin/crm/opportunities"
          recordNoun="client"
          emptyMessage="No clients won yet."
          onAddNote={addBoardOpportunityNoteAction}
        />
      </div>

      <OpportunityFinderModalTrigger
        rows={opportunityFinderData.rows}
        agents={opportunityFinderData.agents}
        clients={opportunityFinderData.clients}
        industries={opportunityFinderData.industries}
        onAddNote={addBoardOpportunityNoteAction}
        onScheduleCallback={scheduleFollowUpAction}
        onCompleteFollowUp={completeFollowUpAction}
        hotCount={opportunityFinderHotCount}
      />

      <OpportunityPipelineSummaryCard stageCounts={pipelineStageCounts} boardHref="/admin/crm/opportunity-finder?view=board" />

      <AdminPerformanceGaugeGrid rows={performanceGaugeRows} reportHref="/admin/crm/performance" segments={GROWTH_CRM_GAUGE_SEGMENTS} />

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
            opportunities={enrichedOpportunities}
            consultationRecords={consultationRecords}
            agents={(agents ?? []) as CrmUserRow[]}
            onAddNote={addBoardOpportunityNoteAction}
            onCompleteFollowUp={completeFollowUpAction}
            onReschedule={rescheduleFollowUpAction}
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
