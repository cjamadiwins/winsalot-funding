"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
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

// Agent-scoped mirror of the admin lead-detail actions
// (../../../admin/(dashboard)/leads/[id]/actions.ts) - deliberately a
// separate file gated by requireLeadgenAgent() rather than a shared
// import, so an agent's access can never accidentally widen if the admin
// file changes. RLS (leadgen_leads_agent_update_own,
// leadgen_lead_activities_agent_insert_own_lead, etc. - migration
// 0031_leadgen_crm.sql) is the actual enforcement: every query below
// runs through the session-scoped client, so an id that isn't actually
// assigned to this agent simply matches zero rows rather than ever
// exposing or mutating someone else's lead.

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

export async function updateLeadAction(leadId: string, formData: FormData): Promise<ActionResult> {
  const agent = await requireLeadgenAgent();
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
    agent_id: agent.id,
    activity_type: "note",
    notes: `Profile updated by ${agent.full_name || agent.email}.`,
  });

  revalidatePath(`/leadgen/agent/leads/${leadId}`);
  return {};
}

export async function recordCallOutcomeAction(leadId: string, formData: FormData): Promise<ActionResult> {
  const agent = await requireLeadgenAgent();
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
    agent_id: agent.id,
    activity_type: "call",
    call_outcome: callOutcome,
    notes: notes ? `${notes}\n\n— logged by ${agent.full_name || agent.email}` : `Logged by ${agent.full_name || agent.email}.`,
  });

  if (nextFollowUpAt) {
    const { error: followUpError } = await supabase.from("leadgen_followups").insert({
      lead_id: leadId,
      agent_id: agent.id,
      scheduled_at: nextFollowUpAt,
      note: notes,
    });
    if (followUpError) return { error: "Call outcome saved, but failed to schedule the follow-up." };
  }

  revalidatePath(`/leadgen/agent/leads/${leadId}`);
  revalidatePath("/leadgen/agent");
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
  const agent = await requireLeadgenAgent();
  const raw = String(formData.get("scheduled_at") ?? "").trim();
  if (!raw) return { error: "A follow-up date and time is required." };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { error: "Invalid date/time." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("leadgen_followups").insert({
    lead_id: leadId,
    agent_id: agent.id,
    scheduled_at: date.toISOString(),
    note: textOrNull(formData, "note"),
  });
  if (error) return { error: "Failed to schedule the follow-up." };

  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: agent.id,
    activity_type: "follow_up_scheduled",
    notes: `Follow-up scheduled for ${date.toLocaleString()} by ${agent.full_name || agent.email}.`,
  });

  await recomputeNextFollowUp(supabase, leadId);

  revalidatePath(`/leadgen/agent/leads/${leadId}`);
  revalidatePath("/leadgen/agent");
  return {};
}

export async function completeFollowUpAction(followUpId: string, leadId: string): Promise<ActionResult> {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("leadgen_followups")
    .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: agent.id })
    .eq("id", followUpId);
  if (error) return { error: "Failed to mark the follow-up completed." };

  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: agent.id,
    activity_type: "follow_up_completed",
    notes: `Follow-up marked completed by ${agent.full_name || agent.email}.`,
  });

  await recomputeNextFollowUp(supabase, leadId);

  revalidatePath(`/leadgen/agent/leads/${leadId}`);
  revalidatePath("/leadgen/agent");
  return {};
}

// Brief: "Agent: Can send consultation emails only for leads assigned to
// them" - the RLS insert policy on leadgen_emails
// (leadgen_emails_agent_insert_own_lead) independently enforces this
// too, so even a crafted request for someone else's lead id can't
// succeed at the database level.
export async function sendConsultationEmailAction(leadId: string, formData: FormData): Promise<SendLeadgenEmailResult> {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: lead } = await supabase
    .from("leadgen_leads")
    .select("client_id, campaign_id, leadgen_clients(name, slug, booking_link)")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { emailId: "", error: "Lead not found, or it isn't assigned to you." };

  const toEmail = String(formData.get("to_email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const submittedBookingUrl = String(formData.get("booking_url") ?? "").trim() || null;

  type EmbeddedClient = { name: string; slug: string; booking_link: string | null };
  const clientEmbed = lead.leadgen_clients as unknown as EmbeddedClient | EmbeddedClient[] | null;
  const embeddedClient = Array.isArray(clientEmbed) ? clientEmbed[0] : clientEmbed;
  const branding = embeddedClient ? resolveLeadgenEmailBranding(embeddedClient, submittedBookingUrl ?? embeddedClient.booking_link, null) : { bookingUrl: submittedBookingUrl };
  const rendered = buildLeadgenConsultationCtaEmail(body, branding.bookingUrl ?? null, LEADGEN_CONSULTATION_CTA_LABEL);

  if (!toEmail) return { emailId: "", error: "This lead has no email address on file. Add one before sending." };
  if (!isValidEmail(toEmail)) return { emailId: "", error: "Enter a valid email address." };
  if (!subject) return { emailId: "", error: "A subject is required." };
  if (!body) return { emailId: "", error: "An email body is required." };

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
    sentBy: agent.id,
    clientVisible: false,
  });

  if (result.error) return result;

  const now = new Date().toISOString();
  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: agent.id,
    activity_type: "consultation_email_sent",
    call_outcome: "Consultation Information Sent",
    notes: `Consultation email sent to ${toEmail} by ${agent.full_name || agent.email}.`,
    occurred_at: now,
  });

  await supabase.from("leadgen_leads").update({ status: "Consultation Information Sent", last_contacted_at: now, updated_at: now }).eq("id", leadId);

  revalidatePath(`/leadgen/agent/leads/${leadId}`);
  revalidatePath("/leadgen/agent");
  return result;
}

// "Send 15-Minute Consultation Invitation" - agent-scoped mirror of the
// admin action of the same name. RLS (leadgen_emails_agent_insert_own_lead)
// independently enforces that this only ever succeeds for a lead
// actually assigned to this agent.
export async function sendConsultationInvitationAction(leadId: string, formData: FormData): Promise<SendLeadgenEmailResult> {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: lead } = await supabase
    .from("leadgen_leads")
    .select("client_id, campaign_id, leadgen_clients(name, slug, booking_link, services_info_link)")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { emailId: "", error: "Lead not found, or it isn't assigned to you." };

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
    sentBy: agent.id,
    clientVisible: false,
  });

  if (result.error) return result;

  const now = new Date().toISOString();
  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: agent.id,
    activity_type: "consultation_invitation_sent",
    call_outcome: "Consultation Information Sent",
    notes: `15-Minute Consultation Invitation sent to ${toEmail} by ${agent.full_name || agent.email} (Agent).`,
    occurred_at: now,
  });

  await supabase.from("leadgen_leads").update({ status: "Consultation Information Sent", last_contacted_at: now, updated_at: now }).eq("id", leadId);

  revalidatePath(`/leadgen/agent/leads/${leadId}`);
  revalidatePath("/leadgen/agent");
  return result;
}

// Manual "Send Follow-Up Email" - agent-scoped mirror; see the admin
// action of the same name for why this never forces the lead's status.
export async function sendConsultationFollowUpAction(leadId: string, formData: FormData): Promise<SendLeadgenEmailResult> {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: lead } = await supabase
    .from("leadgen_leads")
    .select("client_id, campaign_id, leadgen_clients(name, slug, booking_link, services_info_link)")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { emailId: "", error: "Lead not found, or it isn't assigned to you." };

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
    sentBy: agent.id,
    clientVisible: false,
  });

  if (result.error) return result;

  const now = new Date().toISOString();
  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: agent.id,
    activity_type: "consultation_follow_up_sent",
    notes: `Consultation follow-up email sent to ${toEmail} by ${agent.full_name || agent.email} (Agent).`,
    occurred_at: now,
  });

  await supabase.from("leadgen_leads").update({ last_contacted_at: now, updated_at: now }).eq("id", leadId);

  revalidatePath(`/leadgen/agent/leads/${leadId}`);
  revalidatePath("/leadgen/agent");
  return result;
}
