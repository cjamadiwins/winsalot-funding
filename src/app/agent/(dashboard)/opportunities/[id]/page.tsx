import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type {
  ActiveCleaningOpportunityRow,
  OpportunityActivityRow,
  OpportunityFollowUpRow,
} from "@/lib/opportunities/types";
import AgentOpportunityDetailClient from "./AgentOpportunityDetailClient";

export default async function AgentOpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const crmUser = await requireCrmUser();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // RLS (active_cleaning_opportunities_agent_select_own) returns nothing
  // for an opportunity not currently assigned to this agent - handled the
  // same way as a missing lead on /agent/leads/[id].
  const [{ data: opportunity }, { data: activities }, { data: followUps }] = await Promise.all([
    supabase.from("active_cleaning_opportunities").select("*").eq("id", id).maybeSingle(),
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
    <AgentOpportunityDetailClient
      opportunity={opportunity as ActiveCleaningOpportunityRow}
      activities={(activities ?? []) as OpportunityActivityRow[]}
      followUps={(followUps ?? []) as OpportunityFollowUpRow[]}
      currentAgentId={crmUser.id}
    />
  );
}
