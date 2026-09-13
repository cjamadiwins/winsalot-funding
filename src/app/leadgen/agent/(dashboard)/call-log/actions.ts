"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CALL_LOG_AUTOMATIC_NOTES, DO_NOT_CALL_OUTCOME, isCallLogOutcome } from "@/lib/call-log";
import { addOrUpdateDncSuppression } from "@/lib/dnc-suppression";

type ActionResult = { error?: string };

export async function createLeadgenCallLogAction(formData: FormData): Promise<ActionResult> {
  const agent = await requireLeadgenAgent();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const extraDetails = String(formData.get("extra_details") ?? "").trim();
  const clientId = String(formData.get("client_id") ?? "").trim();

  if (!businessName || !phone) return { error: "Business name and phone number are required." };
  if (!isCallLogOutcome(outcome)) return { error: "Select a valid call result." };
  if (!clientId) return { error: "Select a Business / Client." };

  const automaticNote = CALL_LOG_AUTOMATIC_NOTES[outcome];
  const notes = extraDetails ? `${automaticNote} — ${extraDetails}` : automaticNote;
  const supabase = await createSupabaseServerClient();
  // Verify the id is one of this CRM's own clients (and that RLS lets the
  // agent see it) before trusting it - the FK alone would just reject an
  // invalid id, but a client belonging to a row this agent has no
  // business referencing deserves a clear error, not a generic DB failure.
  const { data: client } = await supabase.from("leadgen_clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Select a valid Business / Client." };

  const { error } = await supabase.from("leadgen_call_logs").insert({
    agent_id: agent.id,
    business_name: businessName,
    phone,
    outcome,
    notes,
    client_id: clientId,
  });

  if (error) return { error: `Failed to save the call: ${error.message}` };

  // Never blocks/undoes the call log save above (Item 2: "Do not delete
  // the prospect, call logs..."); a suppression failure here surfaces as
  // an error banner rather than silently dropping the restriction.
  if (outcome === DO_NOT_CALL_OUTCOME) {
    const suppression = await addOrUpdateDncSuppression({
      businessName,
      phone,
      sourceCrm: "lead_generation",
      originalAssignment: client.name,
      reason: "Requested Do Not Call during outbound call",
      notes: extraDetails || null,
      addedByUserId: agent.id,
      addedByName: agent.full_name || agent.email,
      channels: ["phone"],
    });
    if ("error" in suppression) {
      revalidatePath("/leadgen/agent/call-log");
      revalidatePath("/leadgen/admin/performance/call-notes");
      return { error: `Call saved, but adding to the Do Not Contact list failed: ${suppression.error}` };
    }
  }

  revalidatePath("/leadgen/agent/call-log");
  revalidatePath("/leadgen/admin/performance/call-notes");
  return {};
}
