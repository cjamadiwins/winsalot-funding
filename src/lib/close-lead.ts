import "server-only";
import { createSupabaseServerClient } from "./supabase-server";
import { CLOSE_OUTCOMES, stageForCloseOutcome, type CloseOutcome, type CrmUserRow } from "./crm-types";

// Shared by both the admin (/admin/crm/leads/[id]) and agent
// (/agent/leads/[id]) "Close Lead" actions - the only path either role has
// to reach "Closed – Won"/"Closed – Lost", so the reason requirement lives
// in exactly one place. RLS (crm_leads_agent_update_own for an agent,
// crm_leads_admin_all for an admin) scopes which lead this can actually
// touch; migration 0024's crm_leads_closed_reason_required check is the
// database-level backstop if this ever got bypassed.
export async function closeLeadForLead(
  leadId: string,
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
    .from("crm_leads")
    .update({
      stage,
      closed_reason: trimmedReason,
      closed_at: new Date().toISOString(),
      closed_by: crmUser.id,
    })
    .eq("id", leadId);

  if (error) throw new Error("Failed to close the lead.");

  await supabase.from("crm_activities").insert({
    lead_id: leadId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Lead closed — ${stage}. ${trimmedReason}`,
  });
}
