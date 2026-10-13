"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { proposalPreparedActivityNotes, validatePreparedProposal } from "@/lib/leadgen-proposal";

// An agent PREPARES a proposal request for a lead assigned to them; it is saved
// as a draft awaiting Admin approval. This action never sends an email and never
// changes the Proposal Status - only Admin can approve and send (see the admin
// proposal-actions.ts). The lead is read through the agent's own session, so RLS
// returns nothing for a lead that isn't assigned to them (including Henry's and
// Goodness's colleagues' leads); the draft itself is written with the service role
// only after that ownership check, because agents hold no write grant on it.

export type PrepareProposalResult = { error?: string };

export async function prepareProposalRequestAction(leadId: string, formData: FormData): Promise<PrepareProposalResult> {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const validationError = validatePreparedProposal({ subject, body });
  if (validationError) return { error: validationError };

  const { data: lead } = await supabase.from("leadgen_leads").select("id, client_id, assigned_agent_id").eq("id", leadId).maybeSingle();
  if (!lead || lead.assigned_agent_id !== agent.id) return { error: "Lead not found." };

  const { data: client } = await supabase.from("leadgen_clients").select("id, name, active").eq("id", lead.client_id).maybeSingle();
  if (!client) return { error: "This lead's client could not be found." };
  if (!client.active) return { error: `${client.name} isn't an active client, so a proposal can't be requested from it.` };

  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("leadgen_proposal_drafts")
    .upsert({ lead_id: leadId, client_id: lead.client_id, subject, body, prepared_by: agent.id, prepared_at: now, updated_at: now }, { onConflict: "lead_id" });
  if (error) return { error: "Failed to save the proposal request." };

  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: agent.id,
    activity_type: "proposal_prepared",
    notes: proposalPreparedActivityNotes({ clientName: client.name, subject, preparedBy: agent.full_name || agent.email }),
  });

  revalidatePath(`/leadgen/agent/leads/${leadId}`);
  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  revalidatePath("/leadgen/admin");
  return {};
}
