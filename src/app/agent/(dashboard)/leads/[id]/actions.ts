"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import { sendQuoteRequestEmailForLead } from "@/lib/send-quote-request-email";
import { sendFollowUpEmailForLead } from "@/lib/send-follow-up-email";
import {
  ACTIVITY_TYPES,
  AGENT_SETTABLE_STAGES,
  type ActivityType,
  type LeadStage,
} from "@/lib/crm-types";

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

// RLS (crm_leads_agent_update_own) restricts this to leads assigned to the
// signed-in agent - an agent can never touch someone else's lead here even
// if they guess its id.
export async function updateLeadDetailsAction(leadId: string, formData: FormData) {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const serviceRequested = String(formData.get("service_requested") ?? "").trim();

  if (!businessName || !phone || !city || !serviceRequested) {
    throw new Error("Business name, phone, city, and service requested are required.");
  }

  const { error } = await supabase
    .from("crm_leads")
    .update({
      business_name: businessName,
      contact_name: textOrNull(formData, "contact_name"),
      phone,
      email: textOrNull(formData, "email"),
      city,
      service_address: textOrNull(formData, "service_address"),
      service_requested: serviceRequested,
      property_type: textOrNull(formData, "property_type"),
      approximate_size: textOrNull(formData, "approximate_size"),
      cleaning_frequency: textOrNull(formData, "cleaning_frequency"),
      preferred_start_date: textOrNull(formData, "preferred_start_date"),
      best_time_to_contact: textOrNull(formData, "best_time_to_contact"),
      lead_source: textOrNull(formData, "lead_source"),
      notes: textOrNull(formData, "notes"),
    })
    .eq("id", leadId);

  if (error) throw new Error("Failed to save the lead.");

  revalidatePath(`/agent/leads/${leadId}`);
}

// The database also enforces this (migration 0009's BEFORE UPDATE
// trigger) - this check exists so an agent gets a clear message instead
// of a raw Postgres exception if they try anyway.
export async function updateLeadStageAction(leadId: string, stage: string) {
  await requireCrmUser();

  if (!AGENT_SETTABLE_STAGES.includes(stage as LeadStage)) {
    throw new Error("You don't have permission to set a lead to this stage.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("crm_leads")
    .update({ stage })
    .eq("id", leadId);

  if (error) throw new Error("Failed to update the stage.");

  revalidatePath(`/agent/leads/${leadId}`);
}

export async function addActivityAction(leadId: string, formData: FormData) {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const activityType = String(formData.get("activity_type") ?? "").trim();
  if (!ACTIVITY_TYPES.includes(activityType as ActivityType)) {
    throw new Error("Please select a valid activity type.");
  }

  const notes = textOrNull(formData, "notes");
  const nextFollowUpRaw = String(formData.get("next_follow_up_at") ?? "").trim();
  const nextFollowUpAt = nextFollowUpRaw ? new Date(nextFollowUpRaw).toISOString() : null;

  const { error: activityError } = await supabase.from("crm_activities").insert({
    lead_id: leadId,
    agent_id: crmUser.id,
    activity_type: activityType,
    notes,
    next_follow_up_at: nextFollowUpAt,
  });

  if (activityError) throw new Error("Failed to save the activity.");

  // A follow-up date logged here creates a real Follow-Up Calendar entry
  // (crm_followups) rather than writing crm_leads.next_follow_up_at
  // directly - that column is now derived automatically (migration 0011)
  // from whichever pending callback is soonest, so it stays correct
  // either way this gets scheduled.
  if (nextFollowUpAt) {
    const { error: followUpError } = await supabase.from("crm_followups").insert({
      lead_id: leadId,
      scheduled_by: crmUser.id,
      scheduled_at: nextFollowUpAt,
    });
    if (followUpError) {
      throw new Error("Activity saved, but failed to schedule the follow-up callback.");
    }
  }

  const { error: leadError } = await supabase
    .from("crm_leads")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", leadId);

  if (leadError) throw new Error("Activity saved, but failed to update the lead's last-contacted date.");

  revalidatePath(`/agent/leads/${leadId}`);
  revalidatePath("/agent/dashboard");
}

// Sends the "Get a Free Cleaning Quote" prospecting email to this lead's
// saved address and logs it on the activity timeline. RLS
// (crm_leads_agent_select_own) means this throws "Lead not found" for a
// lead that exists but isn't assigned to this agent, same as every other
// read on this page.
export async function sendQuoteRequestEmailAction(leadId: string): Promise<{ email: string }> {
  const crmUser = await requireCrmUser();
  const result = await sendQuoteRequestEmailForLead(leadId, crmUser);

  revalidatePath(`/agent/leads/${leadId}`);
  revalidatePath("/agent/dashboard");

  return result;
}

// Sends the follow-up nudge email to a lead who was already sent a quote
// request but hasn't completed it, and logs it on the activity timeline —
// same tracking/RLS scoping as sendQuoteRequestEmailAction above.
export async function sendFollowUpEmailAction(leadId: string): Promise<{ email: string }> {
  const crmUser = await requireCrmUser();
  const result = await sendFollowUpEmailForLead(leadId, crmUser);

  revalidatePath(`/agent/leads/${leadId}`);
  revalidatePath("/agent/dashboard");

  return result;
}
