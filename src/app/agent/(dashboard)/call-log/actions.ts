"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CALL_LOG_AUTOMATIC_NOTES, isCallLogOutcome } from "@/lib/call-log";

type ActionResult = { error?: string };

export async function createGrowthCallLogAction(formData: FormData): Promise<ActionResult> {
  const agent = await requireCrmUser();
  const clientId = String(formData.get("client_id") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const extraDetails = String(formData.get("extra_details") ?? "").trim();

  if (!clientId) return { error: "Client / Business is required." };
  if (!businessName || !phone) return { error: "Business name called and phone number are required." };
  if (!isCallLogOutcome(outcome)) return { error: "Select a valid call result." };

  const automaticNote = CALL_LOG_AUTOMATIC_NOTES[outcome];
  const notes = extraDetails ? `${automaticNote} — ${extraDetails}` : automaticNote;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("crm_call_logs").insert({
    agent_id: agent.id,
    client_id: clientId,
    business_name: businessName,
    phone,
    outcome,
    notes,
  });

  if (error) return { error: `Failed to save the call: ${error.message}` };

  revalidatePath("/agent/call-log");
  revalidatePath("/admin/crm/performance/call-notes");
  return {};
}
