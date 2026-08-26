import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmFollowUpWithOpportunity, CrmOpportunityRow, CrmUserRow } from "@/lib/crm-types";
import { getCrmOpportunityConversionRecords } from "@/lib/crm-conversion-data";
import AdminCrmClient from "./AdminCrmClient";
import AdminFollowUps from "./AdminFollowUps";
import AdminOverdueOpportunitiesPanel from "./AdminOverdueOpportunitiesPanel";
import ResultsByAgentConversion from "@/components/ResultsByAgentConversion";

// The Winsalot Growth CRM's one admin dashboard - every sales opportunity
// (Lead Generation, Business Financing, or both), their stage pipeline,
// and follow-ups across every agent. Replaces the old bid-scraper
// Provider Acquisition dashboard that used to live at this URL (now
// deleted) and the old crm_leads-based Quote Fulfillment dashboard (moved
// here from /admin/crm/leads, which is being removed in a separate
// cleanup pass) - crm_opportunities is the one pipeline table going
// forward, see supabase/migrations/0080-0085.
export default async function AdminCrmPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  // RLS (crm_opportunities_admin_all / crm_users_admin_select_all /
  // crm_followups_admin_all) permits a full read here because this page
  // is already gated by requireCrmAdmin().
  const [
    { data: opportunities, error: opportunitiesError },
    { data: agents, error: agentsError },
    { data: followUps, error: followUpsError },
    conversionRecords,
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
  ]);

  const activeAgents = ((agents ?? []) as CrmUserRow[]).filter((agent) => agent.role === "agent" && agent.active);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">CRM</h1>
      <p className="mt-1 text-sm text-slate-500">
        Sales opportunities, follow-ups, and results across every agent - Lead Generation and Business Financing,
        from initial prospect through to a client won or lost.
      </p>

      {(opportunitiesError || agentsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load CRM data: {(opportunitiesError ?? agentsError)?.message}
        </p>
      )}

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
