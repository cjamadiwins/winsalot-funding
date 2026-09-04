"use server";

import { revalidatePath } from "next/cache";
import { requireCrmSubcontractor } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CALL_LOG_AUTOMATIC_NOTES, GROWTH_CRM_BUSINESS_CLIENT_NAME, isCallLogOutcome } from "@/lib/call-log";

type ActionResult = { error?: string };

// Subcontractor twin of src/app/agent/(dashboard)/call-log/actions.ts -
// same fixed Winsalot Corp. business/client value (brief section G's
// call-logging training: subcontractors prospect on Winsalot Corp.'s own
// behalf, same as agents; their client *assignment* is a separate payroll
// concept). Row-level security (crm_call_logs_subcontractor_insert_own,
// migration 0136) also requires crm_subcontractor_permissions.add_call_logs
// to be true for this insert to succeed, regardless of this page/nav item
// being reachable.
export async function createSubcontractorCallLogAction(formData: FormData): Promise<ActionResult> {
  const me = await requireCrmSubcontractor();
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
    agent_id: me.id,
    business_name: businessName,
    phone,
    outcome,
    notes,
    business_client_name: GROWTH_CRM_BUSINESS_CLIENT_NAME,
  });

  if (error) return { error: `Failed to save the call: ${error.message}` };

  revalidatePath("/subcontractor/call-log");
  revalidatePath("/admin/crm/performance/call-notes");
  return {};
}
