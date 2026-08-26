"use server";

import { refresh, revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { closeOpportunity } from "@/lib/close-opportunity";
import {
  ACTIVITY_TYPES,
  CLOSED_STAGES,
  OPPORTUNITY_STAGES,
  type ActivityType,
  type OpportunityStage,
} from "@/lib/crm-types";

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function numberOrNull(formData: FormData, key: string): number | null {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// Full field editor for the admin Opportunity Details form - shared core
// fields plus both type-specific field groups (only the ones relevant to
// this opportunity's opportunity_type are ever shown/submitted by the
// client, but writing every column here regardless is harmless since the
// unused ones are already null and stay null).
//
// The stage select here uses the full OPPORTUNITY_STAGES list (unlike the
// agent's AGENT_SETTABLE_STAGES-only dropdown) per the old admin-vs-agent
// asymmetry - admin isn't blocked by crm_opportunities_restrict_agent_stage
// (migration 0081's trigger only fires for role='agent'). Note this
// doesn't bypass crm_opportunities_closed_reason_required though: setting
// stage to a closing stage through this plain form (with no closed_reason
// collected here) will fail at the database level exactly like the old
// crm_leads admin form did - closing an opportunity is only ever meant to
// happen through closeOpportunityAction below (the dedicated Close
// Opportunity panel).
export async function updateOpportunityAction(opportunityId: string, formData: FormData) {
  await requireCrmAdmin();

  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const stage = String(formData.get("stage") ?? "").trim();

  if (!businessName || !phone) {
    throw new Error("Business name and phone are required.");
  }
  if (!OPPORTUNITY_STAGES.includes(stage as OpportunityStage)) {
    throw new Error("Invalid stage.");
  }

  const assignedAgentId = String(formData.get("assigned_agent_id") ?? "").trim() || null;

  const supabase = await createSupabaseServerClient();

  const { data: current, error: currentError } = await supabase
    .from("crm_opportunities")
    .select("opportunity_type, proposal_sent_at, application_submitted_at")
    .eq("id", opportunityId)
    .maybeSingle();

  if (currentError || !current) throw new Error("Opportunity not found.");

  const update: Record<string, unknown> = {
    business_name: businessName,
    contact_name: textOrNull(formData, "contact_name"),
    phone,
    email: textOrNull(formData, "email"),
    city: textOrNull(formData, "city"),
    province_state: textOrNull(formData, "province_state"),
    notes: textOrNull(formData, "notes"),
    stage,
    assigned_agent_id: assignedAgentId,

    industry: textOrNull(formData, "industry"),
    target_customers: textOrNull(formData, "target_customers"),
    current_marketing_method: textOrNull(formData, "current_marketing_method"),
    appointments_wanted: numberOrNull(formData, "appointments_wanted"),
    estimated_monthly_budget: numberOrNull(formData, "estimated_monthly_budget"),
    consultation_date: dateOrNull(formData, "consultation_date"),

    business_structure: textOrNull(formData, "business_structure"),
    time_in_business: textOrNull(formData, "time_in_business"),
    average_monthly_revenue: numberOrNull(formData, "average_monthly_revenue"),
    financing_amount_requested: numberOrNull(formData, "financing_amount_requested"),
    bank_statements_available: formData.has("bank_statements_available")
      ? formData.get("bank_statements_available") === "true"
      : null,
    application_status: textOrNull(formData, "application_status"),
  };

  // The performance dashboard's "Proposals sent" / "Applications
  // submitted" metrics read these timestamps, set once, the first time an
  // opportunity enters this stage - never overwritten on a later save (see
  // crm-performance.ts, migration 0080's column comment).
  if (stage === "Proposal or Application Sent") {
    const type = current.opportunity_type as string;
    if ((type === "lead_generation" || type === "both_services") && !current.proposal_sent_at) {
      update.proposal_sent_at = new Date().toISOString();
    }
    if ((type === "business_financing" || type === "both_services") && !current.application_submitted_at) {
      update.application_submitted_at = new Date().toISOString();
    }
  }

  const { error } = await supabase.from("crm_opportunities").update(update).eq("id", opportunityId);

  if (error) throw new Error("Failed to save the opportunity.");

  revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
  revalidatePath("/admin/crm");
}

// Closed opportunities are never deleted (kept searchable/visible for
// reporting) - this check gives a clear message before the attempt is
// even made; the database enforces it too regardless
// (crm_opportunities_prevent_closed_delete_trigger, migration 0081), so
// this can't be bypassed by calling the action directly.
export async function deleteOpportunityAction(opportunityId: string) {
  await requireCrmAdmin();

  const supabase = await createSupabaseServerClient();

  const { data: opportunity } = await supabase
    .from("crm_opportunities")
    .select("stage")
    .eq("id", opportunityId)
    .maybeSingle();

  if (opportunity && CLOSED_STAGES.includes(opportunity.stage as OpportunityStage)) {
    throw new Error("Closed opportunities cannot be deleted. They're kept for reporting.");
  }

  const { error } = await supabase.from("crm_opportunities").delete().eq("id", opportunityId);

  if (error) throw new Error("Failed to delete the opportunity.");

  revalidatePath("/admin/crm");
}

export async function addActivityAction(opportunityId: string, formData: FormData) {
  const crmUser = await requireCrmAdmin();

  const activityType = String(formData.get("activity_type") ?? "").trim();
  if (!ACTIVITY_TYPES.includes(activityType as ActivityType)) {
    throw new Error("Please select a valid activity type.");
  }

  const notes = textOrNull(formData, "notes");
  const nextFollowUpRaw = String(formData.get("next_follow_up_at") ?? "").trim();
  const nextFollowUpAt = nextFollowUpRaw ? new Date(nextFollowUpRaw).toISOString() : null;

  const supabase = await createSupabaseServerClient();
  const { error: activityError } = await supabase.from("crm_activities").insert({
    opportunity_id: opportunityId,
    agent_id: crmUser.id,
    activity_type: activityType,
    notes,
    next_follow_up_at: nextFollowUpAt,
  });

  if (activityError) throw new Error("Failed to save the activity.");

  // A follow-up date logged here creates a real Follow-Up Calendar entry
  // (crm_followups) rather than writing crm_opportunities.next_follow_up_at
  // directly - that column is derived automatically (migration 0082) from
  // whichever pending callback is soonest.
  if (nextFollowUpAt) {
    const { error: followUpError } = await supabase.from("crm_followups").insert({
      opportunity_id: opportunityId,
      scheduled_by: crmUser.id,
      scheduled_at: nextFollowUpAt,
    });
    if (followUpError) {
      throw new Error("Activity saved, but failed to schedule the follow-up callback.");
    }
  }

  const { error: opportunityError } = await supabase
    .from("crm_opportunities")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", opportunityId);

  if (opportunityError) {
    throw new Error("Activity saved, but failed to update the opportunity's last-contacted date.");
  }

  revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
  revalidatePath("/admin/crm");
}

// Admin equivalent of the agent's Close Opportunity panel - same reason
// requirement, same shared helper (src/lib/close-opportunity.ts), so both
// roles produce identical activity/reporting records regardless of who
// closes the opportunity.
export async function closeOpportunityAction(opportunityId: string, outcome: string, reason: string) {
  const crmUser = await requireCrmAdmin();
  await closeOpportunity(opportunityId, crmUser, outcome, reason);

  revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
  revalidatePath("/admin/crm");
  refresh();
}
