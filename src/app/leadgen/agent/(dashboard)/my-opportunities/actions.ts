"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { OPPORTUNITY_AGENT_STATUSES, type OpportunityAgentStatus } from "@/lib/opportunity-finder";
import { recordCallOutcomeAction } from "../leads/[id]/actions";

type ActionResult = { error?: string };

// Board View's compact "Add Note" quick-form. Same reasoning as the
// admin side's addBoardLeadNoteAction: Lead Gen CRM has no standalone
// "just add a note" action, only recordCallOutcomeAction (the same one
// the lead detail page's own "Record Call Outcome" form calls, already
// RLS-scoped to this agent's own leads) - reused here with call_outcome
// defaulted to the lead's current status so the pipeline stage doesn't
// change.
export async function addBoardLeadNoteAction(leadId: string, note: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase.from("leadgen_leads").select("status").eq("id", leadId).maybeSingle();
  if (!lead) return { error: "Lead not found." };

  const formData = new FormData();
  formData.set("call_outcome", lead.status);
  formData.set("notes", note);
  const result = await recordCallOutcomeAction(leadId, formData);
  if (result.error) return result;
  revalidatePath("/leadgen/agent/my-opportunities");
  return {};
}

// RLS (leadgen_opportunity_scores_agent_update_own) plus the before-update
// trigger (leadgen_opportunity_scores_before_update, migration 0113)
// together enforce that an agent can only ever change their own
// agent_status here - no other column, and no row not assigned to them.
export async function setMyLeadgenOpportunityStatusAction(scoreId: string, status: OpportunityAgentStatus): Promise<ActionResult> {
  await requireLeadgenAgent();
  if (!OPPORTUNITY_AGENT_STATUSES.includes(status)) return { error: "Invalid status." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_opportunity_scores").update({ agent_status: status }).eq("id", scoreId);
  if (error) return { error: "Failed to update this opportunity's status." };

  revalidatePath("/leadgen/agent/my-opportunities");
  return {};
}
