"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CALL_LOG_AUTOMATIC_NOTES, isCallLogOutcome } from "@/lib/call-log";

type ActionResult = { error?: string };

export async function createLeadgenCallLogAction(formData: FormData): Promise<ActionResult> {
  const agent = await requireLeadgenAgent();
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
  const { data: allowedCampaign } = await supabase
    .from("leadgen_campaigns")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!allowedCampaign) return { error: "Select a client or business assigned to you." };

  const { error } = await supabase.from("leadgen_call_logs").insert({
    agent_id: agent.id,
    client_id: clientId,
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
