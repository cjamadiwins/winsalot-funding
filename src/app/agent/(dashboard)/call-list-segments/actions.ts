"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CALL_LOG_AUTOMATIC_NOTES, DO_NOT_CALL_OUTCOME, GROWTH_CRM_BUSINESS_CLIENT_NAME, isCallLogOutcome } from "@/lib/call-log";
import { addOrUpdateDncSuppression } from "@/lib/dnc-suppression";
import { getSegmentLead, updateSegmentLeadCallState } from "@/lib/call-list-leads";
import { isAgentAssignedToActiveSegment } from "@/lib/call-list-segments";
import { promoteToGrowthOpportunity } from "@/lib/call-list-promote";

type ActionResult = { error?: string };

// Mirrors createGrowthCallLogAction (src/app/agent/(dashboard)/call-log/
// actions.ts) as closely as possible - same table, same outcome
// vocabulary, same Do Not Call -> shared suppression list integration -
// just also tagged with the Call List lead/segment it came from, and
// followed by a denormalized call_list_leads state update for the
// working list view. This is intentionally a second, thin action rather
// than reusing that one directly, since it needs the extra call_list_*
// linkage and doesn't take its business_name/phone from a free-text
// form field (they come from the lead record itself).
export async function logCallListCallAction(leadId: string, formData: FormData): Promise<ActionResult> {
  const agent = await requireCrmUser();
  const lead = await getSegmentLead(leadId);
  if (!lead) return { error: "This lead no longer exists." };
  if (!(await isAgentAssignedToActiveSegment(lead.segment_id, agent.id))) {
    return { error: "This call list isn't assigned to you." };
  }

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
  const { error } = await supabase.from("crm_call_logs").insert({
    agent_id: agent.id,
    business_name: lead.business_name,
    contact_name: lead.contact_name,
    phone: lead.phone || "",
    outcome,
    notes,
    business_client_name: GROWTH_CRM_BUSINESS_CLIENT_NAME,
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
      sourceCrm: "growth",
      originalAssignment: GROWTH_CRM_BUSINESS_CLIENT_NAME,
      reason: extraDetails || "Requested Do Not Call during outbound call",
      notes: extraDetails || null,
      addedByUserId: agent.id,
      addedByName: agent.full_name || agent.email,
      channels: ["phone"],
    });
    if ("error" in suppression) {
      revalidatePath(`/agent/call-list-segments/${lead.segment_id}`);
      return { error: `Call saved, but adding to the Do Not Contact list failed: ${suppression.error}` };
    }
  }

  revalidatePath(`/agent/call-list-segments/${lead.segment_id}`);
  revalidatePath("/admin/crm/performance/call-notes");
  return {};
}

export async function promoteCallListLeadAction(leadId: string): Promise<{ error?: string; id?: string; linkedExisting?: boolean }> {
  const agent = await requireCrmUser();
  const lead = await getSegmentLead(leadId);
  if (!lead) return { error: "This lead no longer exists." };
  if (!(await isAgentAssignedToActiveSegment(lead.segment_id, agent.id))) {
    return { error: "This call list isn't assigned to you." };
  }
  const result = await promoteToGrowthOpportunity(leadId, agent.id, agent.id);
  if ("error" in result) return { error: result.error };
  revalidatePath("/agent/opportunities");
  return { id: result.id, linkedExisting: result.linkedExisting };
}
