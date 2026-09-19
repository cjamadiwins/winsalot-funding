"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CALL_LOG_AUTOMATIC_NOTES, DO_NOT_CALL_OUTCOME, isCallLogOutcome } from "@/lib/call-log";
import { addOrUpdateDncSuppression } from "@/lib/dnc-suppression";
import { getSegmentLead, updateSegmentLeadCallState } from "@/lib/call-list-leads";
import { getSegment, isAgentAssignedToActiveSegment } from "@/lib/call-list-segments";
import { promoteToLeadgenLead } from "@/lib/call-list-promote";

type ActionResult = { error?: string };

// Mirrors createLeadgenCallLogAction (src/app/leadgen/agent/(dashboard)/
// call-log/actions.ts) as closely as possible - same table, same outcome
// vocabulary, same Do Not Call -> shared suppression list integration,
// same required client_id lookup - just also tagged with the Call List
// lead/segment it came from, and followed by a denormalized
// call_list_leads state update for the working list view. This is
// intentionally a second, thin action rather than reusing that one
// directly, since it needs the extra call_list_* linkage, resolves its
// client_id from the segment's linked campaign instead of a free-text
// form field, and doesn't take its business_name/phone from the form
// either (they come from the lead record itself).
export async function logCallListCallAction(leadId: string, formData: FormData): Promise<ActionResult> {
  const agent = await requireLeadgenAgent();
  const lead = await getSegmentLead(leadId);
  if (!lead) return { error: "This lead no longer exists." };
  if (!(await isAgentAssignedToActiveSegment(lead.segment_id, agent.id))) {
    return { error: "This call list isn't assigned to you." };
  }

  const segment = await getSegment(lead.segment_id);
  if (!segment || !segment.leadgen_campaign_id) {
    return { error: "This segment isn't linked to a campaign." };
  }

  const admin = getSupabaseAdmin();
  const { data: campaign } = await admin.from("leadgen_campaigns").select("client_id").eq("id", segment.leadgen_campaign_id).maybeSingle();
  if (!campaign) return { error: "The campaign linked to this segment no longer exists." };
  const { data: client } = await admin.from("leadgen_clients").select("id, name").eq("id", campaign.client_id).maybeSingle();
  if (!client) return { error: "The client linked to this segment no longer exists." };

  const outcome = String(formData.get("outcome") ?? "").trim();
  const extraDetails = String(formData.get("notes") ?? "").trim();
  const callbackAtRaw = String(formData.get("callback_at") ?? "").trim();
  const appointmentAtRaw = String(formData.get("appointment_at") ?? "").trim();

  if (!isCallLogOutcome(outcome)) return { error: "Select a valid call result." };

  const automaticNote = CALL_LOG_AUTOMATIC_NOTES[outcome];
  const notes = extraDetails ? `${automaticNote} — ${extraDetails}` : automaticNote;
  const callbackAt = callbackAtRaw ? new Date(callbackAtRaw).toISOString() : null;
  const appointmentAt = appointmentAtRaw ? new Date(appointmentAtRaw).toISOString() : null;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_call_logs").insert({
    agent_id: agent.id,
    business_name: lead.business_name,
    contact_name: lead.contact_name,
    phone: lead.phone || "",
    outcome,
    notes,
    client_id: client.id,
    call_list_segment_id: lead.segment_id,
    call_list_lead_id: lead.id,
    callback_at: callbackAt,
    appointment_at: appointmentAt,
  });
  if (error) return { error: `Failed to save the call: ${error.message}` };

  const now = new Date().toISOString();
  await updateSegmentLeadCallState(lead.id, { lastOutcome: outcome, lastContactedAt: now, callbackAt });

  if (outcome === DO_NOT_CALL_OUTCOME) {
    const suppression = await addOrUpdateDncSuppression({
      businessName: lead.business_name,
      contactName: lead.contact_name,
      phone: lead.phone,
      email: lead.email,
      sourceCrm: "lead_generation",
      originalAssignment: client.name,
      reason: extraDetails || "Requested Do Not Call during outbound call",
      notes: extraDetails || null,
      addedByUserId: agent.id,
      addedByName: agent.full_name || agent.email,
      channels: ["phone"],
    });
    if ("error" in suppression) {
      revalidatePath(`/leadgen/agent/call-list-segments/${lead.segment_id}`);
      return { error: `Call saved, but adding to the Do Not Contact list failed: ${suppression.error}` };
    }
  }

  revalidatePath(`/leadgen/agent/call-list-segments/${lead.segment_id}`);
  revalidatePath("/leadgen/admin/performance/call-notes");
  return {};
}

export async function promoteCallListLeadAction(leadId: string): Promise<{ error?: string; id?: string; linkedExisting?: boolean }> {
  const agent = await requireLeadgenAgent();
  const lead = await getSegmentLead(leadId);
  if (!lead) return { error: "This lead no longer exists." };
  if (!(await isAgentAssignedToActiveSegment(lead.segment_id, agent.id))) {
    return { error: "This call list isn't assigned to you." };
  }
  const result = await promoteToLeadgenLead(leadId, agent.id, agent.id);
  if ("error" in result) return { error: result.error };
  revalidatePath("/leadgen/agent/leads");
  return { id: result.id, linkedExisting: result.linkedExisting };
}
