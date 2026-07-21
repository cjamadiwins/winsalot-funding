"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { sendQuoteRequestEmailForLead } from "@/lib/send-quote-request-email";
import { ACTIVITY_TYPES, LEAD_STAGES, type ActivityType, type LeadStage } from "@/lib/crm-types";

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

export async function updateLeadAction(leadId: string, formData: FormData) {
  await requireCrmAdmin();

  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const serviceRequested = String(formData.get("service_requested") ?? "").trim();
  const stage = String(formData.get("stage") ?? "").trim();
  const assignedAgentId = String(formData.get("assigned_agent_id") ?? "").trim() || null;

  if (!businessName || !phone || !city || !serviceRequested) {
    throw new Error("Business name, phone, city, and service requested are required.");
  }
  if (!LEAD_STAGES.includes(stage as LeadStage)) {
    throw new Error("Invalid stage.");
  }

  const supabase = await createSupabaseServerClient();
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
      stage,
      assigned_agent_id: assignedAgentId,
    })
    .eq("id", leadId);

  if (error) throw new Error("Failed to save the lead.");

  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/admin/crm");
}

export async function deleteLeadAction(leadId: string) {
  await requireCrmAdmin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("crm_leads").delete().eq("id", leadId);

  if (error) throw new Error("Failed to delete the lead.");

  revalidatePath("/admin/crm");
}

export async function addActivityAction(leadId: string, formData: FormData) {
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
    lead_id: leadId,
    agent_id: crmUser.id,
    activity_type: activityType,
    notes,
    next_follow_up_at: nextFollowUpAt,
  });

  if (activityError) throw new Error("Failed to save the activity.");

  // A follow-up date logged here creates a real Follow-Up Calendar entry
  // (crm_followups) rather than writing crm_leads.next_follow_up_at
  // directly - that column is derived automatically (migration 0011) from
  // whichever pending callback is soonest.
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

  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/admin/crm");
}

// Sends the "Get a Free Cleaning Quote" prospecting email to this lead's
// saved address and logs it on the activity timeline. Distinct from
// finalApproveLeadAction / RequestWorkflowPanel's "Send Quote to
// Customer" — this never touches quote_requests, it's purely a CRM-side
// nudge pointing the lead at the public quote form.
export async function sendQuoteRequestEmailAction(leadId: string): Promise<{ email: string }> {
  const crmUser = await requireCrmAdmin();
  const result = await sendQuoteRequestEmailForLead(leadId, crmUser);

  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/admin/crm");

  return result;
}

export type QuoteRequestSearchResult = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  city: string;
  status: string;
  created_at: string;
};

// Search is admin-only (requireCrmAdmin) and only ever reachable from this
// page, so using the service-role client here doesn't add a new way to
// read quote_requests - quote_requests itself still has no RLS policies
// of its own (see migration 0003), same as every other admin read.
export async function searchQuoteRequestsAction(query: string): Promise<QuoteRequestSearchResult[]> {
  await requireCrmAdmin();

  const trimmed = query.trim();
  if (!trimmed) return [];

  // .or() filters are comma-separated, so strip characters that would
  // otherwise be parsed as filter/value delimiters instead of literal
  // search text (a comma or parenthesis in the search box shouldn't break
  // the query).
  const safe = trimmed.replace(/[,()]/g, "");
  if (!safe) return [];

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("quote_requests")
    .select("id, full_name, phone, email, city, status, created_at")
    .or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error("Search failed.");

  return data ?? [];
}

export async function linkQuoteAction(leadId: string, quoteRequestId: string) {
  await requireCrmAdmin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("crm_leads")
    .update({ quote_request_id: quoteRequestId })
    .eq("id", leadId);

  if (error) throw new Error("Failed to link the quote request.");

  revalidatePath(`/admin/crm/leads/${leadId}`);
}

export async function unlinkQuoteAction(leadId: string) {
  await requireCrmAdmin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("crm_leads")
    .update({ quote_request_id: null })
    .eq("id", leadId);

  if (error) throw new Error("Failed to unlink the quote request.");

  revalidatePath(`/admin/crm/leads/${leadId}`);
}

// The dedicated "final approval" step: after the customer has accepted or
// declined, the admin clicks this to formally close out the CRM
// opportunity. This is a CRM-only action - it doesn't touch the linked
// quote_requests row at all, only crm_leads.stage. Distinct from the
// existing pre-send "Approve" step in RequestWorkflowPanel (which
// approves the quote's price/content before it's ever sent).
export async function finalApproveLeadAction(leadId: string) {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: lead } = await supabase
    .from("crm_leads")
    .select("quote_request_id")
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) throw new Error("Lead not found.");
  if (!lead.quote_request_id) {
    throw new Error("This lead isn't linked to a quote request yet.");
  }

  const admin = getSupabaseAdmin();
  const { data: quote } = await admin
    .from("quote_requests")
    .select("customer_response")
    .eq("id", lead.quote_request_id)
    .maybeSingle();

  if (!quote?.customer_response) {
    throw new Error("The customer hasn't responded to the quote yet.");
  }

  const { error: updateError } = await supabase
    .from("crm_leads")
    .update({ stage: "Closed/completed" })
    .eq("id", leadId);

  if (updateError) throw new Error("Failed to close the opportunity.");

  await supabase.from("crm_activities").insert({
    lead_id: leadId,
    agent_id: crmUser.id,
    activity_type: "outcome",
    notes: "Admin gave final approval — opportunity closed.",
  });

  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/admin/crm");
}
