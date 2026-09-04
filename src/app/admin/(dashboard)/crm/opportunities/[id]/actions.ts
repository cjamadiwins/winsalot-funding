"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { closeOpportunity } from "@/lib/close-opportunity";
import { sendProspectEmail, type SendProspectEmailResult } from "@/lib/send-prospect-email";
import { resubscribeEmail, type ResubscribeResult, type ResubscribeScope } from "@/lib/crm-email-suppression";
import { getWinsalotOfferedSlots, performWinsalotBooking, type WinsalotBookingResult } from "@/lib/winsalot-consultation-book";
import type { BookConsultationInput } from "@/components/BookConsultationModal";
import {
  ACTIVITY_TYPES,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_TYPES,
  type ActivityType,
  type OpportunityStage,
  type OpportunityType,
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
  const opportunityType = String(formData.get("opportunity_type") ?? "").trim();

  if (!businessName || !phone) {
    throw new Error("Business name and phone are required.");
  }
  if (!OPPORTUNITY_STAGES.includes(stage as OpportunityStage)) {
    throw new Error("Invalid stage.");
  }
  if (!OPPORTUNITY_TYPES.includes(opportunityType as OpportunityType)) {
    throw new Error("Invalid opportunity type.");
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
    opportunity_type: opportunityType,
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
    if ((opportunityType === "lead_generation" || opportunityType === "both_services") && !current.proposal_sent_at) {
      update.proposal_sent_at = new Date().toISOString();
    }
    if (
      (opportunityType === "business_financing" || opportunityType === "both_services") &&
      !current.application_submitted_at
    ) {
      update.application_submitted_at = new Date().toISOString();
    }
  }

  const { error } = await supabase.from("crm_opportunities").update(update).eq("id", opportunityId);

  if (error) throw new Error("Failed to save the opportunity.");

  revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
  revalidatePath("/admin/crm");
}

// Administrators may permanently delete an opportunity regardless of its
// stage - Open, Won ("Client Won"), Lost ("Not Interested"), or any other
// closed stage. This used to be blocked for closed stages (kept "for
// reporting"), both here and by a database trigger
// (crm_opportunities_prevent_closed_delete_trigger); both blocks are gone
// now (see migration 0104 for the trigger removal) since admins need to
// be able to remove a record regardless of status - e.g. a test
// opportunity that was mistakenly closed out.
//
// Every foreign key that points at crm_opportunities is ON DELETE CASCADE
// or ON DELETE SET NULL (crm_activities/crm_followups/crm_lead_emails/
// winsalot_appointment_tokens cascade; crm_client_agreements/
// crm_email_suppressions/crm_intake_configs/crm_intake_submissions/
// crm_unsubscribe_tokens/winsalot_appointments set null - see migrations
// 0082, 0085, 0087, 0088, 0097), so a plain delete here can never fail
// with a foreign-key-constraint error; nothing else needs to be deleted
// or unlinked by hand first.
//
// requireCrmAdmin() plus crm_opportunities having no agent delete RLS
// policy at all (only crm_opportunities_admin_all covers delete) keeps
// this admin-only regardless of what calls it.
// Deliberately redirects from inside the action itself, right after
// revalidating, rather than leaving the caller mounted on this now-deleted
// opportunity's own detail page. Calling a Server Action from a still-
// mounted client component without a redirect() makes Next.js
// automatically re-render that same route as part of the action's
// response - which reran this page's loader against an id that no longer
// exists, surfacing a transient error page for an instant before the
// client's own navigation caught up. redirect() throws internally, so it
// must be the last call and nothing after it can run - revalidatePath is
// called first for that reason.
export async function deleteOpportunityAction(opportunityId: string) {
  await requireCrmAdmin();

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("crm_opportunities").delete().eq("id", opportunityId);

  if (error) throw new Error("Failed to delete the opportunity.");

  revalidatePath("/admin/crm");
  redirect("/admin/crm?deleted=opportunity");
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

// "Send Email" (prospect-email system) - the templated consultation invite,
// already reviewed/edited by the admin in ProspectEmailModal. Delegates to
// sendProspectEmail (src/lib/send-prospect-email.ts), shared with the
// agent's equivalent action, so tracking/status-advance logic can't drift
// between roles.
export async function sendProspectEmailAction(
  opportunityId: string,
  input: { subject: string; message: string; ctaText: string }
): Promise<SendProspectEmailResult> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const result = await sendProspectEmail(supabase, { opportunityId, crmUser, ...input });

  revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
  revalidatePath("/admin/crm");
  return result;
}

// Admin-only "Resubscribe" - clears an unsubscribed prospect's
// crm_email_suppressions block after they explicitly ask to receive
// emails again. Gated by requireCrmAdmin() here (agents never reach this
// page's actions.ts at all) and, independently, by
// crm_marketing_enrollments/crm_email_resubscribe_audit's own
// admin-only RLS policies - two separate reasons an agent session could
// never make this write even if it tried. The confirmation checkbox is
// enforced here, not just in the UI, so a hand-crafted request can't
// skip it either.
export async function resubscribeEmailAction(opportunityId: string, formData: FormData): Promise<ResubscribeResult> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const confirmed = formData.get("confirmed") === "on";
  if (!confirmed) {
    return { error: "Confirm that the recipient explicitly requested to receive emails again." };
  }

  const consentMethod = String(formData.get("consent_method") ?? "").trim();
  const consentDate = String(formData.get("consent_date") ?? "").trim();
  const scope = String(formData.get("scope") ?? "permission_only") as ResubscribeScope;
  if (scope !== "permission_only" && scope !== "reenroll_marketing") {
    return { error: "Select a valid resubscribe option." };
  }

  const { data: opportunity } = await supabase.from("crm_opportunities").select("email").eq("id", opportunityId).maybeSingle();
  if (!opportunity?.email?.trim()) {
    return { error: "This business has no email address on file." };
  }

  const result = await resubscribeEmail(supabase, {
    email: opportunity.email,
    opportunityId,
    adminId: crmUser.id,
    adminName: crmUser.full_name || crmUser.email,
    consentMethod,
    consentDate,
    scope,
  });

  if (!result.error) {
    revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
    revalidatePath("/admin/crm/marketing");
  }
  return result;
}

export async function getConsultationOfferedSlotsAction() {
  await requireCrmAdmin();
  return getWinsalotOfferedSlots();
}

// Admin "Book Consultation" - assigns the new appointment to the
// prospect's current assigned agent (if any), letting an admin book on
// behalf of any prospect regardless of who it's assigned to, per the
// brief's "The assigned agent or admin can... book the consultation
// while speaking with the prospect."
export async function bookConsultationAction(opportunityId: string, input: BookConsultationInput): Promise<WinsalotBookingResult> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: opportunity } = await supabase.from("crm_opportunities").select("id, assigned_agent_id").eq("id", opportunityId).maybeSingle();
  if (!opportunity) return { error: "Prospect not found." };

  const result = await performWinsalotBooking({
    opportunityId,
    contactName: input.contactName,
    businessName: input.businessName,
    email: input.email,
    phone: input.phone,
    serviceType: input.serviceType,
    notes: input.notes.trim() ? input.notes.trim() : null,
    startUtcIso: input.startUtcIso,
    prospectTimezone: null,
    bookedBy: "agent",
    bookedByUserId: crmUser.id,
    assignedAgentId: (opportunity.assigned_agent_id as string | null) ?? null,
  });

  revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
  revalidatePath("/admin/crm");
  revalidatePath("/admin/crm/appointments");
  return result;
}
