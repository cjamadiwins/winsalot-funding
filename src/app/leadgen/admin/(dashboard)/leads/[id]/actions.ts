"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { buildLeadgenBookingEmailHtml, buildLeadgenConsultationCtaEmail, sendLeadgenEmail, type SendLeadgenEmailResult } from "@/lib/leadgen-email";
import {
  isValidEmail,
  LEADGEN_BOOKING_BUTTON_LABEL,
  LEADGEN_CONSULTATION_CTA_LABEL,
  LEADGEN_LEAD_STATUSES,
  LEADGEN_PROVINCES,
  leadgenServicesButtonLabel,
  resolveLeadgenEmailBranding,
  type LeadgenLeadStatus,
} from "@/lib/leadgen-types";

type ActionResult = { error?: string };

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

export async function updateLeadAction(leadId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const businessName = String(formData.get("business_name") ?? "").trim();
  if (!businessName) return { error: "Business name is required." };

  const province = textOrNull(formData, "province");
  if (province && !LEADGEN_PROVINCES.includes(province as (typeof LEADGEN_PROVINCES)[number])) {
    return { error: "Invalid province." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("leadgen_leads")
    .update({
      business_name: businessName,
      industry: textOrNull(formData, "industry"),
      contact_name: textOrNull(formData, "contact_name"),
      decision_maker_name: textOrNull(formData, "decision_maker_name"),
      phone: textOrNull(formData, "phone"),
      email: textOrNull(formData, "email"),
      website: textOrNull(formData, "website"),
      city: textOrNull(formData, "city"),
      province,
      lead_source: textOrNull(formData, "lead_source"),
      notes: textOrNull(formData, "notes"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) return { error: "Failed to update the lead." };

  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    activity_type: "note",
    notes: `Profile updated by ${adminUser.full_name || adminUser.email}.`,
  });

  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return {};
}

export async function recordCallOutcomeAction(leadId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const callOutcome = String(formData.get("call_outcome") ?? "").trim();
  if (!LEADGEN_LEAD_STATUSES.includes(callOutcome as LeadgenLeadStatus)) return { error: "Select a valid call outcome." };

  const notes = textOrNull(formData, "notes");
  const nextFollowUpRaw = String(formData.get("next_follow_up_at") ?? "").trim();
  const nextFollowUpAt = nextFollowUpRaw ? new Date(nextFollowUpRaw).toISOString() : null;
  const now = new Date().toISOString();

  const supabase = await createSupabaseServerClient();
  const { error: leadError } = await supabase
    .from("leadgen_leads")
    .update({ status: callOutcome, last_contacted_at: now, next_follow_up_at: nextFollowUpAt ?? undefined, updated_at: now })
    .eq("id", leadId);
  if (leadError) return { error: "Failed to update the lead." };

  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    activity_type: "call",
    call_outcome: callOutcome,
    notes: notes ? `${notes}\n\n— logged by ${adminUser.full_name || adminUser.email}` : `Logged by ${adminUser.full_name || adminUser.email}.`,
  });

  if (nextFollowUpAt) {
    const { error: followUpError } = await supabase.from("leadgen_followups").insert({
      lead_id: leadId,
      agent_id: adminUser.id,
      scheduled_at: nextFollowUpAt,
      note: notes,
    });
    if (followUpError) return { error: "Call outcome saved, but failed to schedule the follow-up." };
  }

  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return {};
}

async function recomputeNextFollowUp(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, leadId: string) {
  const { data: pending } = await supabase
    .from("leadgen_followups")
    .select("scheduled_at")
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  await supabase.from("leadgen_leads").update({ next_follow_up_at: pending?.scheduled_at ?? null }).eq("id", leadId);
}

export async function scheduleFollowUpAction(leadId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const raw = String(formData.get("scheduled_at") ?? "").trim();
  if (!raw) return { error: "A follow-up date and time is required." };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { error: "Invalid date/time." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_followups").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    scheduled_at: date.toISOString(),
    note: textOrNull(formData, "note"),
  });
  if (error) return { error: "Failed to schedule the follow-up." };

  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    activity_type: "follow_up_scheduled",
    notes: `Follow-up scheduled for ${date.toLocaleString()} by ${adminUser.full_name || adminUser.email}.`,
  });

  await recomputeNextFollowUp(supabase, leadId);

  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return {};
}

export async function completeFollowUpAction(followUpId: string, leadId: string): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("leadgen_followups")
    .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: adminUser.id })
    .eq("id", followUpId);
  if (error) return { error: "Failed to mark the follow-up completed." };

  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    activity_type: "follow_up_completed",
    notes: `Follow-up marked completed by ${adminUser.full_name || adminUser.email}.`,
  });

  await recomputeNextFollowUp(supabase, leadId);

  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return {};
}

// The centerpiece "Send Consultation Email" workflow (brief). Validates
// the recipient, sends + logs via the shared sendLeadgenEmail helper,
// then advances the lead's status and last-contacted timestamp and logs
// a dedicated "Consultation email sent" activity entry - all only on a
// verified successful send (an email that fails to send never touches
// the lead's status).
export async function sendConsultationEmailAction(leadId: string, formData: FormData): Promise<SendLeadgenEmailResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: lead } = await supabase
    .from("leadgen_leads")
    .select("client_id, campaign_id, leadgen_clients(name, slug, booking_link)")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { emailId: "", error: "Lead not found." };

  const toEmail = String(formData.get("to_email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const submittedBookingUrl = String(formData.get("booking_url") ?? "").trim() || null;

  type EmbeddedClient = { name: string; slug: string; booking_link: string | null };
  const clientEmbed = lead.leadgen_clients as unknown as EmbeddedClient | EmbeddedClient[] | null;
  const embeddedClient = Array.isArray(clientEmbed) ? clientEmbed[0] : clientEmbed;
  // The client's saved Consultation Booking Link (or its campaign-level
  // override, submitted from the client-side preview) - never the
  // Brent's Essentials website fallback. resolveLeadgenEmailBranding is
  // deliberately not used here, since it would substitute that fallback
  // URL for a blank link instead of blocking the send below.
  const bookingUrl = submittedBookingUrl ?? embeddedClient?.booking_link?.trim() ?? null;

  if (!toEmail) return { emailId: "", error: "This lead has no email address on file. Add one before sending." };
  if (!isValidEmail(toEmail)) return { emailId: "", error: "Enter a valid email address." };
  if (!subject) return { emailId: "", error: "A subject is required." };
  if (!body) return { emailId: "", error: "An email body is required." };
  if (!bookingUrl) return { emailId: "", error: "Please add a Consultation Booking Link in Client Settings before sending this email." };

  const rendered = buildLeadgenConsultationCtaEmail(body, bookingUrl, LEADGEN_CONSULTATION_CTA_LABEL);

  const result = await sendLeadgenEmail(supabase, {
    clientId: lead.client_id,
    campaignId: lead.campaign_id,
    leadId,
    templateKey: "consultation_information",
    toEmail,
    subject,
    body,
    text: rendered.text,
    html: rendered.html,
    sentBy: adminUser.id,
    clientVisible: false,
  });

  if (result.error) return result;

  const now = new Date().toISOString();
  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    activity_type: "consultation_email_sent",
    call_outcome: "Consultation Information Sent",
    notes: `Consultation email sent to ${toEmail} by ${adminUser.full_name || adminUser.email}.`,
    occurred_at: now,
  });

  await supabase.from("leadgen_leads").update({ status: "Consultation Information Sent", last_contacted_at: now, updated_at: now }).eq("id", leadId);

  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return result;
}

// "Send 15-Minute Consultation Invitation" - a second, distinct
// one-click prospect email (separate template/copy from the original
// Send Consultation Email above, kept side-by-side so neither breaks the
// other). Same validate -> send -> log -> advance-status shape.
export async function sendConsultationInvitationAction(leadId: string, formData: FormData): Promise<SendLeadgenEmailResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: lead } = await supabase
    .from("leadgen_leads")
    .select("client_id, campaign_id, leadgen_clients(name, slug, booking_link, services_info_link)")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { emailId: "", error: "Lead not found." };

  const toEmail = String(formData.get("to_email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const submittedBookingUrl = String(formData.get("booking_url") ?? "").trim() || null;
  const submittedServicesUrl = String(formData.get("services_url") ?? "").trim() || null;
  type EmbeddedClient = { name: string; slug: string; booking_link: string | null; services_info_link: string | null };
  const clientEmbed = lead.leadgen_clients as unknown as EmbeddedClient | EmbeddedClient[] | null;
  const embeddedClient = Array.isArray(clientEmbed) ? clientEmbed[0] : clientEmbed;
  // Server-side safety net mirroring resolveLeadgenEmailBranding on the
  // client: re-validates against the DB row even if the submitted form
  // values were somehow blank, so a Brent's Essentials email can never go
  // out with an empty name or missing booking/services button.
  const branding = embeddedClient
    ? resolveLeadgenEmailBranding(embeddedClient, submittedBookingUrl ?? embeddedClient.booking_link, submittedServicesUrl ?? embeddedClient.services_info_link)
    : { clientName: "us", bookingUrl: submittedBookingUrl, servicesUrl: submittedServicesUrl };

  if (!toEmail) return { emailId: "", error: "This lead has no email address on file. Add one before sending." };
  if (!isValidEmail(toEmail)) return { emailId: "", error: "Enter a valid email address." };
  if (!subject) return { emailId: "", error: "A subject is required." };
  if (!body) return { emailId: "", error: "An email body is required." };

  const result = await sendLeadgenEmail(supabase, {
    clientId: lead.client_id,
    campaignId: lead.campaign_id,
    leadId,
    templateKey: "consultation_invitation",
    toEmail,
    subject,
    body,
    html: buildLeadgenBookingEmailHtml(body, [
      { url: branding.bookingUrl, label: LEADGEN_BOOKING_BUTTON_LABEL, style: "booking" },
      { url: branding.servicesUrl, label: leadgenServicesButtonLabel(branding.clientName) },
    ]),
    sentBy: adminUser.id,
    clientVisible: false,
  });

  if (result.error) return result;

  const now = new Date().toISOString();
  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    activity_type: "consultation_invitation_sent",
    call_outcome: "Consultation Information Sent",
    notes: `15-Minute Consultation Invitation sent to ${toEmail} by ${adminUser.full_name || adminUser.email} (Admin).`,
    occurred_at: now,
  });

  await supabase.from("leadgen_leads").update({ status: "Consultation Information Sent", last_contacted_at: now, updated_at: now }).eq("id", leadId);

  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return result;
}

// Manual "Send Follow-Up Email" - unlike the invitation above, this
// never forces the lead's status back to "Consultation Information
// Sent": a follow-up may be sent well after the lead has already moved
// on to a further status (e.g. "Interested" or "Appointment booked"),
// and resetting that would be a regression, not a status update. Still
// updates last_contacted_at and logs its own distinct activity type.
export async function sendConsultationFollowUpAction(leadId: string, formData: FormData): Promise<SendLeadgenEmailResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: lead } = await supabase
    .from("leadgen_leads")
    .select("client_id, campaign_id, leadgen_clients(name, slug, booking_link, services_info_link)")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { emailId: "", error: "Lead not found." };

  const toEmail = String(formData.get("to_email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const submittedBookingUrl = String(formData.get("booking_url") ?? "").trim() || null;
  const submittedServicesUrl = String(formData.get("services_url") ?? "").trim() || null;
  type EmbeddedClient = { name: string; slug: string; booking_link: string | null; services_info_link: string | null };
  const clientEmbed = lead.leadgen_clients as unknown as EmbeddedClient | EmbeddedClient[] | null;
  const embeddedClient = Array.isArray(clientEmbed) ? clientEmbed[0] : clientEmbed;
  // Server-side safety net mirroring resolveLeadgenEmailBranding on the
  // client: re-validates against the DB row even if the submitted form
  // values were somehow blank, so a Brent's Essentials email can never go
  // out with an empty name or missing booking/services button.
  const branding = embeddedClient
    ? resolveLeadgenEmailBranding(embeddedClient, submittedBookingUrl ?? embeddedClient.booking_link, submittedServicesUrl ?? embeddedClient.services_info_link)
    : { clientName: "us", bookingUrl: submittedBookingUrl, servicesUrl: submittedServicesUrl };

  if (!toEmail) return { emailId: "", error: "This lead has no email address on file. Add one before sending." };
  if (!isValidEmail(toEmail)) return { emailId: "", error: "Enter a valid email address." };
  if (!subject) return { emailId: "", error: "A subject is required." };
  if (!body) return { emailId: "", error: "An email body is required." };

  const result = await sendLeadgenEmail(supabase, {
    clientId: lead.client_id,
    campaignId: lead.campaign_id,
    leadId,
    templateKey: "consultation_follow_up",
    toEmail,
    subject,
    body,
    html: buildLeadgenBookingEmailHtml(body, [
      { url: branding.bookingUrl, label: LEADGEN_BOOKING_BUTTON_LABEL, style: "booking" },
      { url: branding.servicesUrl, label: leadgenServicesButtonLabel(branding.clientName) },
    ]),
    sentBy: adminUser.id,
    clientVisible: false,
  });

  if (result.error) return result;

  const now = new Date().toISOString();
  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: adminUser.id,
    activity_type: "consultation_follow_up_sent",
    notes: `Consultation follow-up email sent to ${toEmail} by ${adminUser.full_name || adminUser.email} (Admin).`,
    occurred_at: now,
  });

  await supabase.from("leadgen_leads").update({ last_contacted_at: now, updated_at: now }).eq("id", leadId);

  revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return result;
}
