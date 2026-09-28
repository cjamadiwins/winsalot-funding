import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmClientAgreementRow } from "@/lib/crm-agreement-types";
import { resolveNextPerformancePaymentStage, type LeadgenConversionPaymentTriggerRow } from "@/lib/leadgen-conversions";

// The DB-writing half of the generic performance-payment-trigger
// algorithm - split out from lib/leadgen-conversions.ts (which has no
// "server-only"/Supabase-client code so it can be imported directly by
// client components for its labels/styles/constants) since this function
// actually writes to the database and must never end up in a client
// bundle.
//
// Atomically fires the next eligible performance-payment stage for a
// Growth CRM agreement and records the permanent audit-trail row. Uses a
// conditional UPDATE ... WHERE <guards> (checking rows-affected) rather
// than read-then-write, so a duplicate/concurrent confirmation can never
// fire the same stage twice - leadgen_conversion_payment_triggers' unique
// constraint on conversion_id is the second, independent backstop (a
// single conversion record can trigger at most one payment stage, ever).
// Returns null if nothing was triggered: not a PBF agreement, both stages
// already fired, or a concurrent request already claimed this exact stage
// transition first.
export async function triggerPerformancePaymentIfEligible(
  admin: SupabaseClient,
  input: {
    conversionId: string;
    clientId: string;
    campaignId: string | null;
    crmClientId: string;
    agreement: CrmClientAgreementRow;
    confirmedBy: string;
  }
): Promise<LeadgenConversionPaymentTriggerRow | null> {
  const plan = resolveNextPerformancePaymentStage(input.agreement);
  if (!plan) return null;

  let query = admin
    .from("crm_client_agreements")
    .update({ [plan.setColumn]: "converted", [plan.setDateColumn]: new Date().toISOString() })
    .eq("id", input.agreement.id);
  for (const guard of plan.guards) {
    query = query.eq(guard.column, guard.equals);
  }
  const { data: updatedRows, error: updateError } = await query.select("id");
  if (updateError || !updatedRows || updatedRows.length === 0) return null;

  const { data: triggerRow, error: insertError } = await admin
    .from("leadgen_conversion_payment_triggers")
    .insert({
      conversion_id: input.conversionId,
      client_id: input.clientId,
      campaign_id: input.campaignId,
      crm_client_id: input.crmClientId,
      crm_agreement_id: input.agreement.id,
      conversion_number: plan.conversionNumber,
      payment_stage_label: plan.stageLabel,
      amount_triggered: plan.amount,
      currency: plan.currency,
      confirmed_by: input.confirmedBy,
    })
    .select("*")
    .single();

  if (insertError || !triggerRow) return null;
  return triggerRow as LeadgenConversionPaymentTriggerRow;
}
