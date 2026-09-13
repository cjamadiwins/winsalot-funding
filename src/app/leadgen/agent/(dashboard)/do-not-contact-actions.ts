"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { addOrUpdateDncSuppression, type DncChannel } from "@/lib/dnc-suppression";

type ActionResult = { error?: string; success?: string };

// Agent-facing counterpart to the admin actions in
// ../../admin/(dashboard)/do-not-contact/actions.ts - see the identical
// rationale in the Growth CRM's own agent do-not-contact-actions.ts: a
// deliberately narrow file exporting only the one add action, so there is
// no remove/reactivate/edit/import/history Server Action id reachable
// from the agent dashboard's bundle at all. requireLeadgenAgent() (not
// requireLeadgenAdmin()) is the whole gate here.
export async function addAgentDncSuppressionAction(formData: FormData): Promise<ActionResult> {
  const agent = await requireLeadgenAgent();
  const channels = formData.getAll("channels").filter((c): c is DncChannel => c === "phone" || c === "sms" || c === "email");

  const result = await addOrUpdateDncSuppression({
    contactName: String(formData.get("contact_name") ?? "").trim() || null,
    businessName: String(formData.get("business_name") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    sourceCrm: "lead_generation",
    reason: String(formData.get("reason") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim() || null,
    // The audit trail (crm_dnc_audit_log) records this agent as
    // performed_by/performed_by_name on the 'added' entry.
    addedByUserId: agent.id,
    addedByName: agent.full_name || agent.email,
    channels,
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/leadgen/agent");
  return { success: "Added to the Do Not Contact list." };
}
