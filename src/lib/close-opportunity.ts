import "server-only";
import { createSupabaseServerClient } from "./supabase-server";
import { CLOSE_OUTCOMES, stageForCloseOutcome, type CloseOutcome, type CrmUserRow } from "./crm-types";

// Shared by both the admin (/admin/crm/opportunities/[id]) and agent
// (/agent/opportunities/[id]) "Close Opportunity" actions - the only path
// either role has to reach "Client Won"/"Not Interested", so the reason
// requirement lives in exactly one place. RLS
// (crm_opportunities_agent_update_own for an agent, crm_opportunities_admin_all
// for an admin) scopes which opportunity this can actually touch;
// migration 0081's crm_opportunities_closed_reason_required check is the
// database-level backstop if this ever got bypassed.
export async function closeOpportunity(
  opportunityId: string,
  crmUser: CrmUserRow,
  outcome: string,
  reason: string
): Promise<void> {
  if (!CLOSE_OUTCOMES.includes(outcome as CloseOutcome)) {
    throw new Error("Invalid close outcome.");
  }

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("A closing reason or short note is required.");
  }

  const stage = stageForCloseOutcome(outcome as CloseOutcome);
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_opportunities")
    .update({
      stage,
      closed_reason: trimmedReason,
      closed_at: new Date().toISOString(),
      closed_by: crmUser.id,
    })
    .eq("id", opportunityId);

  if (error) throw new Error("Failed to close the opportunity.");

  await supabase.from("crm_activities").insert({
    opportunity_id: opportunityId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Opportunity closed — ${stage}. ${trimmedReason}`,
  });
}
