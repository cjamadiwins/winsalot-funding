"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { LEADGEN_OPPORTUNITY_OUTCOMES, type LeadgenOpportunityOutcome } from "@/lib/leadgen-types";

type ActionResult = { error?: string };

// "Client Consultation Outcome" (brief section 6). Runs on the client's
// own RLS-scoped session, not the service-role client - the actual
// enforcement is leadgen_client_opportunities_client_update_own (RLS,
// scoped to this client's own client_id) plus a column-level GRANT that
// only allows UPDATE on client_outcome/closed_date/deal_value/updated_at
// (migration 20260924214016), so this action can never touch lead_id,
// appointment_id, or another client's row even if this code had a bug.
// Never deletes or recreates the opportunity row - only ever updates the
// same one, so its history (created_at, the original appointment/lead
// link) is preserved.
export async function submitOpportunityOutcomeAction(opportunityId: string, formData: FormData): Promise<ActionResult> {
  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const outcome = String(formData.get("client_outcome") ?? "");
  if (!LEADGEN_OPPORTUNITY_OUTCOMES.includes(outcome as LeadgenOpportunityOutcome)) {
    return { error: "Select a valid outcome." };
  }

  const closedDateRaw = String(formData.get("closed_date") ?? "").trim();
  const dealValueRaw = String(formData.get("deal_value") ?? "").trim();

  // The DB CHECK constraints already forbid closed_date/deal_value unless
  // client_outcome = 'Won', but validating here first gives a clear error
  // message instead of a raw constraint-violation message from Postgres.
  if (outcome !== "Won" && (closedDateRaw || dealValueRaw)) {
    return { error: "Closed date and deal value can only be set when the outcome is Won." };
  }

  const dealValue = dealValueRaw ? Number(dealValueRaw) : null;
  if (dealValueRaw && (!Number.isFinite(dealValue) || (dealValue ?? 0) < 0)) {
    return { error: "Enter a valid deal value." };
  }

  const { error } = await supabase
    .from("leadgen_client_opportunities")
    .update({
      client_outcome: outcome,
      closed_date: outcome === "Won" ? closedDateRaw || null : null,
      deal_value: outcome === "Won" ? dealValue : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .eq("client_id", client.id);
  if (error) return { error: `Failed to update outcome: ${error.message}` };

  revalidatePath("/client/pipeline");
  revalidatePath("/client/dashboard");
  return {};
}
