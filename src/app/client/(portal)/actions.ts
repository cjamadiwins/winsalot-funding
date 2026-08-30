"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { LEADGEN_LEAD_CLIENT_FEEDBACK_OPTIONS, type LeadgenLeadClientFeedbackOption } from "@/lib/leadgen-types";

export async function signOutClientAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/client");
}

type ActionResult = { error?: string };

// Client Feedback (brief "CLIENT FEEDBACK") - insert-only from this side;
// RLS (leadgen_lead_client_feedback_client_insert_own, migration 0114)
// independently re-checks that the lead actually belongs to this client's
// own client_id, so a tampered leadId can never attach feedback to
// another client's lead even if this check were ever bypassed.
export async function submitLeadFeedbackAction(leadId: string, formData: FormData): Promise<ActionResult> {
  const { user, client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const feedback = String(formData.get("feedback") ?? "").trim();
  if (!LEADGEN_LEAD_CLIENT_FEEDBACK_OPTIONS.includes(feedback as LeadgenLeadClientFeedbackOption)) {
    return { error: "Select a valid feedback option." };
  }
  const note = String(formData.get("note") ?? "").trim() || null;

  const { data: lead } = await supabase.from("leadgen_leads").select("id").eq("id", leadId).eq("client_id", client.id).maybeSingle();
  if (!lead) return { error: "Lead not found." };

  const { error } = await supabase.from("leadgen_lead_client_feedback").insert({
    lead_id: leadId,
    client_id: client.id,
    submitted_by: user.id,
    submitted_by_name: user.full_name || user.email,
    feedback,
    note,
  });
  if (error) return { error: `Failed to submit feedback: ${error.message}` };

  revalidatePath(`/client/leads/${leadId}`);
  return {};
}
