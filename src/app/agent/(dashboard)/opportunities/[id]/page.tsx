import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { CrmActivityRow, CrmFollowUpRow, CrmOpportunityRow } from "@/lib/crm-types";
import OpportunityDetailClient from "./OpportunityDetailClient";

export default async function AgentOpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const crmUser = await requireCrmUser();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // RLS (crm_opportunities_agent_select_own) returns nothing for an
  // opportunity not currently assigned to this agent.
  const [{ data: opportunity }, { data: activities }, { data: followUps }] = await Promise.all([
    supabase.from("crm_opportunities").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("crm_activities")
      .select("*")
      .eq("opportunity_id", id)
      .order("occurred_at", { ascending: false }),
    supabase.from("crm_followups").select("*").eq("opportunity_id", id).order("scheduled_at", { ascending: true }),
  ]);

  if (!opportunity) {
    notFound();
  }

  return (
    <OpportunityDetailClient
      opportunity={opportunity as CrmOpportunityRow}
      activities={(activities ?? []) as CrmActivityRow[]}
      followUps={(followUps ?? []) as CrmFollowUpRow[]}
      currentAgentId={crmUser.id}
    />
  );
}
