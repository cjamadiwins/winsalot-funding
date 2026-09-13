"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser } from "@/lib/crm-auth";
import { addOrUpdateDncSuppression, type DncChannel } from "@/lib/dnc-suppression";

type ActionResult = { error?: string; success?: string };

// Agent-facing counterpart to the admin actions in
// ../../admin/(dashboard)/crm/do-not-contact/actions.ts - deliberately a
// separate, narrower file rather than a shared import, so the agent
// dashboard's bundle only ever references this one action. Item 3: any
// signed-in Growth CRM user (agent or admin - requireCrmUser() is the same
// gate every other /agent/* action uses) may add a restriction; there is
// no removeSuppressionAction/reactivateSuppressionAction/editSuppressionAction/
// importDncCsvAction/getAuditLogAction exported here at all - not "hidden
// in the UI" but genuinely absent from this file, so there is no
// client-reachable Server Action id for an agent session to invoke even
// via a crafted request. Those remain admin-only, gated by
// requireCrmAdmin()/requireLeadgenAdmin() in their own files.
export async function addAgentDncSuppressionAction(formData: FormData): Promise<ActionResult> {
  const agent = await requireCrmUser();
  const channels = formData.getAll("channels").filter((c): c is DncChannel => c === "phone" || c === "sms" || c === "email");

  const result = await addOrUpdateDncSuppression({
    contactName: String(formData.get("contact_name") ?? "").trim() || null,
    businessName: String(formData.get("business_name") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    sourceCrm: "growth",
    reason: String(formData.get("reason") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim() || null,
    // The audit trail (crm_dnc_audit_log) records this agent as
    // performed_by/performed_by_name on the 'added' entry - see
    // addOrUpdateDncSuppression in src/lib/dnc-suppression.ts.
    addedByUserId: agent.id,
    addedByName: agent.full_name || agent.email,
    channels,
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/agent/dashboard");
  return { success: "Added to the Do Not Contact list." };
}
