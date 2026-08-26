"use server";

import { refresh, revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import { closeOpportunity } from "@/lib/close-opportunity";
import {
  AGENT_SETTABLE_STAGES,
  OPPORTUNITY_TYPES,
  type OpportunityStage,
  type OpportunityType,
} from "@/lib/crm-types";

// Every action returns { error } instead of throwing, matching the rest of
// the CRM's agent/admin actions (see e.g. the admin opportunities
// actions.ts) - a thrown Server Action error gets redacted to a generic
// message in production, which would swallow our own deliberate ones too.
// closeOpportunityAction/the follow-up actions below throw instead (they
// mirror followup-actions.ts's existing convention, called from
// components that already wrap them in try/catch via runAction).
type ActionResult = { error?: string };

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function numberOrNull(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function isoOrNull(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function revalidateOpportunity(id: string) {
  revalidatePath(`/agent/opportunities/${id}`);
  revalidatePath("/agent/dashboard");
}

// The plain stage dropdown only ever offers AGENT_SETTABLE_STAGES (the six
// non-closing stages) - Client Won/Not Interested are only reachable
// through closeOpportunityAction below. Migration 0081's
// crm_opportunities_restrict_agent_stage_trigger enforces this
// independently at the database level; this check just gives a clear
// message instead of a raw Postgres exception if the dropdown is somehow
// bypassed.
//
// Whenever the stage changes *to* "Proposal or Application Sent", also
// stamps proposal_sent_at (Lead Generation/Both Services) and/or
// application_submitted_at (Business Financing/Both Services) the first
// time it's reached - the performance dashboard's Proposals Sent/
// Applications Submitted metrics bucket by these timestamps, not just the
// opportunity's current stage (see crm-performance.ts).
export async function updateOpportunityStageAction(id: string, stage: string): Promise<ActionResult> {
  await requireCrmUser();
  if (!AGENT_SETTABLE_STAGES.includes(stage as OpportunityStage)) {
    return { error: "You don't have permission to set this stage." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: current } = await supabase
    .from("crm_opportunities")
    .select("opportunity_type, proposal_sent_at, application_submitted_at")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { error: "Opportunity not found." };

  const update: Record<string, unknown> = { stage };
  if (stage === "Proposal or Application Sent") {
    const type = current.opportunity_type as OpportunityType;
    const now = new Date().toISOString();
    if ((type === "lead_generation" || type === "both_services") && !current.proposal_sent_at) {
      update.proposal_sent_at = now;
    }
    if ((type === "business_financing" || type === "both_services") && !current.application_submitted_at) {
      update.application_submitted_at = now;
    }
  }

  const { error } = await supabase.from("crm_opportunities").update(update).eq("id", id);
  if (error) return { error: "Failed to update the stage." };

  revalidateOpportunity(id);
  return {};
}

// The type-conditional field editor (OpportunityFieldsForm) posts every
// field regardless of the currently-selected type - the ones that don't
// apply to the chosen opportunity_type are simply blank/unchecked and get
// written as null/false, which is harmless since the UI never displays a
// field group that isn't relevant to the record's type.
export async function updateOpportunityFieldsAction(id: string, formData: FormData): Promise<ActionResult> {
  await requireCrmUser();

  const opportunityTypeRaw = String(formData.get("opportunity_type") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!OPPORTUNITY_TYPES.includes(opportunityTypeRaw as OpportunityType)) {
    return { error: "Choose an opportunity type." };
  }
  if (!businessName || !phone) {
    return { error: "Business name and phone are required." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("crm_opportunities")
    .update({
      opportunity_type: opportunityTypeRaw,
      business_name: businessName,
      contact_name: textOrNull(formData, "contact_name"),
      phone,
      email: textOrNull(formData, "email"),
      city: textOrNull(formData, "city"),
      province_state: textOrNull(formData, "province_state"),
      notes: textOrNull(formData, "notes"),

      industry: textOrNull(formData, "industry"),
      target_customers: textOrNull(formData, "target_customers"),
      current_marketing_method: textOrNull(formData, "current_marketing_method"),
      appointments_wanted: numberOrNull(formData, "appointments_wanted"),
      estimated_monthly_budget: numberOrNull(formData, "estimated_monthly_budget"),
      consultation_date: isoOrNull(formData, "consultation_date"),

      business_structure: textOrNull(formData, "business_structure"),
      time_in_business: textOrNull(formData, "time_in_business"),
      average_monthly_revenue: numberOrNull(formData, "average_monthly_revenue"),
      financing_amount_requested: numberOrNull(formData, "financing_amount_requested"),
      bank_statements_available: formData.get("bank_statements_available") === "on",
      application_status: textOrNull(formData, "application_status"),
    })
    .eq("id", id);

  if (error) return { error: "Failed to save the opportunity." };

  revalidateOpportunity(id);
  return {};
}

// Activity timeline entry (call/email/text/voicemail/note/outcome) with an
// optional follow-up date - mirrors the pattern already established by the
// admin opportunities actions.ts. Inserting into crm_followups
// automatically keeps crm_opportunities.next_follow_up_at in sync via
// migration 0082's trigger, so no manual update of that column is needed
// here.
export async function addOpportunityActivityAction(id: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const activityType = String(formData.get("activity_type") ?? "call").trim();
  const notes = textOrNull(formData, "notes");
  const nextFollowUpAt = isoOrNull(formData, "next_follow_up_at");

  const { error: activityError } = await supabase.from("crm_activities").insert({
    opportunity_id: id,
    agent_id: crmUser.id,
    activity_type: activityType,
    notes,
    next_follow_up_at: nextFollowUpAt,
  });
  if (activityError) return { error: "Failed to save the note." };

  if (nextFollowUpAt) {
    const { error: followUpError } = await supabase.from("crm_followups").insert({
      opportunity_id: id,
      scheduled_by: crmUser.id,
      scheduled_at: nextFollowUpAt,
    });
    if (followUpError) return { error: "Note saved, but failed to schedule the follow-up." };
  }

  const { error: lastContactedError } = await supabase
    .from("crm_opportunities")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", id);
  if (lastContactedError) return { error: "Note saved, but failed to update the last-contacted date." };

  revalidateOpportunity(id);
  return {};
}

function parseScheduledAt(formData: FormData): string {
  const raw = String(formData.get("scheduled_at") ?? "").trim();
  if (!raw) throw new Error("A callback date and time is required.");
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date/time.");
  return date.toISOString();
}

// The following four follow-up actions are shared by the opportunity
// detail page's own Scheduled Callbacks section AND the dashboard's
// Follow-Up Calendar / Overdue Opportunities quick-action panel (imported
// directly from this module) - one place owns the crm_followups/
// crm_activities write pattern for opportunities, mirroring how
// followup-actions.ts already does this for leads.

export async function scheduleOpportunityFollowUpAction(id: string, formData: FormData) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const scheduledAt = parseScheduledAt(formData);
  const note = textOrNull(formData, "note");

  const { error } = await supabase.from("crm_followups").insert({
    opportunity_id: id,
    scheduled_by: crmUser.id,
    scheduled_at: scheduledAt,
    note,
  });
  if (error) throw new Error("Failed to schedule the callback.");

  revalidateOpportunity(id);
  refresh();
}

// A reschedule always requires a reason and always leaves a permanent
// record on the activity timeline of the old due date, the new one, and
// why - same rationale as the lead pipeline's rescheduleFollowUpAction.
export async function rescheduleOpportunityFollowUpAction(
  followUpId: string,
  opportunityId: string,
  formData: FormData
) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const scheduledAt = parseScheduledAt(formData);
  const reason = textOrNull(formData, "note");
  if (!reason) throw new Error("A reason for rescheduling is required.");

  const { data: existing, error: fetchError } = await supabase
    .from("crm_followups")
    .select("scheduled_at")
    .eq("id", followUpId)
    .maybeSingle();
  if (fetchError || !existing) throw new Error("Follow-up not found.");

  const { error } = await supabase
    .from("crm_followups")
    .update({
      scheduled_at: scheduledAt,
      note: reason,
      status: "pending",
      completed_at: null,
      completed_by: null,
    })
    .eq("id", followUpId);
  if (error) throw new Error("Failed to reschedule the callback.");

  const agentName = crmUser.full_name || crmUser.email;
  const { error: activityError } = await supabase.from("crm_activities").insert({
    opportunity_id: opportunityId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Follow-up rescheduled by ${agentName}. Was due ${new Date(
      existing.scheduled_at
    ).toLocaleString()}, now due ${new Date(scheduledAt).toLocaleString()}. Reason: ${reason}`,
    next_follow_up_at: scheduledAt,
  });
  if (activityError) {
    throw new Error("Callback rescheduled, but failed to log it on the activity timeline.");
  }

  revalidateOpportunity(opportunityId);
  refresh();
}

export async function completeOpportunityFollowUpAction(followUpId: string, opportunityId: string) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_followups")
    .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: crmUser.id })
    .eq("id", followUpId);
  if (error) throw new Error("Failed to mark the callback completed.");

  const agentName = crmUser.full_name || crmUser.email;
  const { error: activityError } = await supabase.from("crm_activities").insert({
    opportunity_id: opportunityId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: `Follow-up completed by ${agentName}.`,
  });
  if (activityError) {
    throw new Error("Callback marked completed, but failed to log it on the activity timeline.");
  }

  revalidateOpportunity(opportunityId);
  refresh();
}

export async function addOpportunityFollowUpNoteAction(opportunityId: string, note: string) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const trimmed = note.trim();
  if (!trimmed) throw new Error("Note cannot be empty.");

  const { error } = await supabase.from("crm_activities").insert({
    opportunity_id: opportunityId,
    agent_id: crmUser.id,
    activity_type: "note",
    notes: trimmed,
  });
  if (error) throw new Error("Failed to save the note.");

  revalidateOpportunity(opportunityId);
  refresh();
}

// The only path to Client Won/Not Interested - always requires a reason
// (enforced again by migration 0081's crm_opportunities_closed_reason_required
// check). Delegates to closeOpportunity() (src/lib/close-opportunity.ts),
// shared with the admin side, so the rule only lives in one place.
export async function closeOpportunityAction(opportunityId: string, outcome: string, reason: string) {
  const crmUser = await requireCrmUser();
  await closeOpportunity(opportunityId, crmUser, outcome, reason);
  revalidateOpportunity(opportunityId);
  refresh();
}
