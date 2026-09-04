"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CALL_LOG_AUTOMATIC_NOTES, isCallLogOutcome } from "@/lib/call-log";

type ActionResult = { error?: string };

export async function createLeadgenCallLogAction(formData: FormData): Promise<ActionResult> {
  const agent = await requireLeadgenAgent();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const extraDetails = String(formData.get("extra_details") ?? "").trim();

  if (!businessName || !phone) return { error: "Business name and phone number are required." };
  if (!isCallLogOutcome(outcome)) return { error: "Select a valid call result." };

  const automaticNote = CALL_LOG_AUTOMATIC_NOTES[outcome];
  const notes = extraDetails ? `${automaticNote} — ${extraDetails}` : automaticNote;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_call_logs").insert({
    agent_id: agent.id,
    business_name: businessName,
    phone,
    outcome,
    notes,
  });

  if (error) return { error: `Failed to save the call: ${error.message}` };

  revalidatePath("/leadgen/agent/call-log");
  revalidatePath("/leadgen/admin/performance/call-notes");
  return {};
}
