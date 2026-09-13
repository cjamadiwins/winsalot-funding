"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CALL_LOG_AUTOMATIC_NOTES, DO_NOT_CALL_OUTCOME, GROWTH_CRM_BUSINESS_CLIENT_NAME, isCallLogOutcome } from "@/lib/call-log";
import { addOrUpdateDncSuppression } from "@/lib/dnc-suppression";

type ActionResult = { error?: string };

export async function createGrowthCallLogAction(formData: FormData): Promise<ActionResult> {
  const agent = await requireCrmUser();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const extraDetails = String(formData.get("extra_details") ?? "").trim();

  if (!businessName || !phone) return { error: "Business name and phone number are required." };
  if (!isCallLogOutcome(outcome)) return { error: "Select a valid call result." };

  const automaticNote = CALL_LOG_AUTOMATIC_NOTES[outcome];
  const notes = extraDetails ? `${automaticNote} — ${extraDetails}` : automaticNote;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("crm_call_logs").insert({
    agent_id: agent.id,
    business_name: businessName,
    phone,
    outcome,
    notes,
    // Growth CRM agents always prospect on Winsalot Corp.'s own behalf -
    // never trust a client-supplied value for this even though the form
    // field is read-only, since it's a plain HTML input an API call could
    // bypass; the database also pins this via a check constraint.
    business_client_name: GROWTH_CRM_BUSINESS_CLIENT_NAME,
  });

  if (error) return { error: `Failed to save the call: ${error.message}` };

  // Never blocks/undoes the call log save above - the call was already
  // recorded (Item 2: "Do not delete the prospect, call logs..."); a
  // suppression failure here would only mean the Do Not Call list didn't
  // get this entry, surfaced as an error banner rather than silently
  // dropped.
  if (outcome === DO_NOT_CALL_OUTCOME) {
    const suppression = await addOrUpdateDncSuppression({
      businessName,
      phone,
      sourceCrm: "growth",
      originalAssignment: GROWTH_CRM_BUSINESS_CLIENT_NAME,
      reason: "Requested Do Not Call during outbound call",
      notes: extraDetails || null,
      addedByUserId: agent.id,
      addedByName: agent.full_name || agent.email,
      channels: ["phone"],
    });
    if ("error" in suppression) {
      revalidatePath("/agent/call-log");
      revalidatePath("/admin/crm/performance/call-notes");
      return { error: `Call saved, but adding to the Do Not Contact list failed: ${suppression.error}` };
    }
  }

  revalidatePath("/agent/call-log");
  revalidatePath("/admin/crm/performance/call-notes");
  return {};
}
