"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { buildLeadgenBookingEmailHtml, buildLeadgenConsultationCtaEmail, sendLeadgenEmail, type SendLeadgenEmailResult } from "@/lib/leadgen-email";
import {
  isLeadgenAppointmentCountable,
  isMantraCollabClient,
  isValidEmail,
  LEADGEN_BOOKING_BUTTON_LABEL,
  LEADGEN_CONSULTATION_CTA_LABEL,
  LEADGEN_LEAD_STATUSES,
  LEADGEN_PROVINCES,
  leadgenServicesButtonLabel,
  resolveLeadgenEmailBranding,
  type LeadgenAppointmentStatus,
  type LeadgenLeadStatus,
} from "@/lib/leadgen-types";

type ActionResult = { error?: string };

// Mirrors the same helper/guard in the admin actions file above - "Send
// Consultation Email"/"Send Consultation Invitation" must not downgrade a
// lead's status back to "Consultation Information Sent" once it already
// has a real booked appointment (checked against leadgen_appointments
// itself, the source of truth - never the lead's own status field).
async function leadHasActiveAppointment(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, leadId: string): Promise<boolean> {
  const { data } = await supabase.from("leadgen_appointments").select("status").eq("lead_id", leadId);
  return (data ?? []).some((a) => isLeadgenAppointmentCountable(a.status as LeadgenAppointmentStatus));
}

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
    .update({ status: callOutcome, last_contacted_at: now, updated_at: now })
    .eq("id", leadId);
  if (leadError) return { error: "Failed to update the lead." };

  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: agent.id,
    activity_type: "call",
    call_outcome: callOutcome,
    notes: notes ? `${notes}\n\n— logged by ${agent.full_name || agent.email}` : `Logged by ${agent.full_name || agent.email}.`,
  });

  // Logging a call outcome supersedes whatever follow-up was pending
  // before now, whether or not a new one is scheduled below - mark it
  // completed (never deleted, so history/reporting is untouched) instead
  // of leaving it stuck as an orphaned "pending" row that the dashboard's
  // Overdue count would keep counting forever even after the Leads page
  // filter (which reads next_follow_up_at, not this table directly) has
  // already moved on. Must run before the insert below, since inserting
  // first would otherwise mark the brand-new row completed too.
  const { error: supersedeError } = await supabase
    .from("leadgen_followups")
    .update({ status: "completed", completed_at: now, completed_by: agent.id })
    .eq("lead_id", leadId)
    .eq("status", "pending");
  if (supersedeError) return { error: "Failed to update the lead's prior follow-up." };

  if (nextFollowUpAt) {
    const { error: followUpError } = await supabase.from("leadgen_followups").insert({
      lead_id: leadId,
      agent_id: agent.id,
      scheduled_at: nextFollowUpAt,
      note: notes,
    });
    if (followUpError) return { error: "Call outcome saved, but failed to schedule the follow-up." };
  }

  // Recomputes leadgen_leads.next_follow_up_at from whatever is left
  // pending (the new follow-up above, or null) - the single source of
  // truth the Leads page filter and both dashboards' Overdue/Due Today
  // counts read from.
  await recomputeNextFollowUp(supabase, leadId);

  revalidatePath(`/leadgen/agent/leads/${leadId}`);
  revalidatePath("/leadgen/agent");
  revalidatePath("/leadgen/agent/leads");
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
  revalidatePath("/leadgen/agent/leads");
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
  revalidatePath("/leadgen/agent/leads");
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
    .select("client_id, campaign_id, leadgen_clients(name, slug, booking_link, services_info_link)")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { emailId: "", error: "Lead not found, or it isn't assigned to you." };

  const toEmail = String(formData.get("to_email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const submittedBookingUrl = String(formData.get("booking_url") ?? "").trim() || null;

  type EmbeddedClient = { name: string; slug: string; booking_link: string | null; services_info_link: string | null };
  const clientEmbed = lead.leadgen_clients as unknown as EmbeddedClient | EmbeddedClient[] | null;
  const embeddedClient = Array.isArray(clientEmbed) ? clientEmbed[0] : clientEmbed;
  // This template's body copy is not fully generic (see the templates
  // admin screen) - it must never be sent to a Mantra Collab lead, which
  // has its own dedicated "Send Mantra Collab Email" action/template
  // instead. Enforced here (not just by hiding the button in
  // LeadDetailClient.tsx), so a stale page or a crafted request can't
  // send it either.
  if (embeddedClient && isMantraCollabClient(embeddedClient)) {
    return { emailId: "", error: "Use \"Send Mantra Collab Email\" for a Mantra Collab lead instead." };
  }
  // The client's saved Consultation Booking Link (or its campaign-level
  // override, submitted from the client-side preview) - never the
  // Brent's Essentials website fallback. resolveLeadgenEmailBranding is
  // deliberately not used here, since it would substitute that fallback
  // URL for a blank link instead of blocking the send below.
  const bookingUrl = submittedBookingUrl ?? embeddedClient?.booking_link?.trim() ?? null;
  // clientName/websiteUrl for the signature only - resolved the same way
  // every other consultation email does (resolveLeadgenEmailBranding),
  // so this lead's own client's name/website appear, never a hardcoded
  // Brent's Essentials fallback for any other client.
  const signatureBranding = embeddedClient
    ? resolveLeadgenEmailBranding(embeddedClient, null, embeddedClient.services_info_link)
    : { clientName: "us", servicesUrl: null };

  if (!toEmail) return { emailId: "", error: "This lead has no email address on file. Add one before sending." };
  if (!isValidEmail(toEmail)) return { emailId: "", error: "Enter a valid email address." };
  if (!subject) return { emailId: "", error: "A subject is required." };
  if (!body) return { emailId: "", error: "An email body is required." };
  if (!bookingUrl) return { emailId: "", error: "Please add a Consultation Booking Link in Client Settings before sending this email." };

  const rendered = buildLeadgenConsultationCtaEmail(
    body,
    bookingUrl,
    LEADGEN_CONSULTATION_CTA_LABEL,
    signatureBranding.clientName,
    signatureBranding.servicesUrl
  );

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
    expectedSignatureName: signatureBranding.clientName,
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

  const statusUpdate = (await leadHasActiveAppointment(supabase, leadId))
    ? { last_contacted_at: now, updated_at: now }
    : { status: "Consultation Information Sent" as const, last_contacted_at: now, updated_at: now };
  await supabase.from("leadgen_leads").update(statusUpdate).eq("id", leadId);

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
  // This template must never be sent to a Mantra Collab lead - it has
  // its own dedicated "Send Mantra Collab Email" action/template.
  // Enforced here (not just by hiding the button in LeadDetailClient.tsx)
  // so a stale page or a crafted request can't send it either.
  if (embeddedClient && isMantraCollabClient(embeddedClient)) {
    return { emailId: "", error: "Use \"Send Mantra Collab Email\" for a Mantra Collab lead instead." };
  }
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
  if (!branding.bookingUrl) return { emailId: "", error: "Please add a Consultation Booking Link in Client Settings before sending this email." };

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

  const statusUpdate = (await leadHasActiveAppointment(supabase, leadId))
    ? { last_contacted_at: now, updated_at: now }
    : { status: "Consultation Information Sent" as const, last_contacted_at: now, updated_at: now };
  await supabase.from("leadgen_leads").update(statusUpdate).eq("id", leadId);

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
  // This template must never be sent to a Mantra Collab lead - it has
  // its own dedicated "Send Mantra Collab Email" action/template.
  // Enforced here (not just by hiding the button in LeadDetailClient.tsx)
  // so a stale page or a crafted request can't send it either.
  if (embeddedClient && isMantraCollabClient(embeddedClient)) {
    return { emailId: "", error: "Use \"Send Mantra Collab Email\" for a Mantra Collab lead instead." };
  }
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
  if (!branding.bookingUrl) return { emailId: "", error: "Please add a Consultation Booking Link in Client Settings before sending this email." };

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

// "Send Mantra Collab Email" - agent version, identical shape to the
// admin one in the admin leads/[id]/actions.ts. RLS
// (leadgen_emails_agent_insert_own_lead) still independently enforces
// that this can only ever be for a lead assigned to this agent. Also
// re-checked here server-side - a crafted request for a non-Mantra lead
// is rejected outright, so Mantra's fixed content/booking link can never
// be sent under any other client (Brent's Essentials or otherwise).
export async function sendMantraCollabIntroEmailAction(leadId: string, formData: FormData): Promise<SendLeadgenEmailResult> {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const { data: lead } = await supabase
    .from("leadgen_leads")
    .select("client_id, campaign_id, leadgen_clients(slug, booking_link)")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { emailId: "", error: "Lead not found, or it isn't assigned to you." };

  const toEmail = String(formData.get("to_email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const submittedBookingUrl = String(formData.get("booking_url") ?? "").trim() || null;
  type EmbeddedClient = { slug: string; booking_link: string | null };
  const clientEmbed = lead.leadgen_clients as unknown as EmbeddedClient | EmbeddedClient[] | null;
  const embeddedClient = Array.isArray(clientEmbed) ? clientEmbed[0] : clientEmbed;
  if (!embeddedClient || !isMantraCollabClient(embeddedClient)) {
    return { emailId: "", error: "This email can only be sent for a Mantra Collab lead." };
  }
  const bookingUrl = submittedBookingUrl ?? embeddedClient?.booking_link?.trim() ?? null;

  if (!toEmail) return { emailId: "", error: "This lead has no email address on file. Add one before sending." };
  if (!isValidEmail(toEmail)) return { emailId: "", error: "Enter a valid email address." };
  if (!subject) return { emailId: "", error: "A subject is required." };
  if (!body) return { emailId: "", error: "An email body is required." };
  if (!bookingUrl) return { emailId: "", error: "Please add a Consultation Booking Link in Client Settings before sending this email." };

  const result = await sendLeadgenEmail(supabase, {
    clientId: lead.client_id,
    campaignId: lead.campaign_id,
    leadId,
    templateKey: "mantra_collab_intro",
    toEmail,
    subject,
    body,
    html: buildLeadgenBookingEmailHtml(body, [
      { url: bookingUrl, label: "Book a Free 15-Minute Consultation", style: "booking" },
      { url: "https://mantracollab.com", label: "Visit Mantra Collab" },
    ]),
    sentBy: agent.id,
    clientVisible: false,
  });

  if (result.error) return result;

  const now = new Date().toISOString();
  await supabase.from("leadgen_lead_activities").insert({
    lead_id: leadId,
    agent_id: agent.id,
    activity_type: "mantra_collab_intro_sent",
    notes: `Mantra Collab intro email sent to ${toEmail} by ${agent.full_name || agent.email} (Agent).`,
    occurred_at: now,
  });

  await supabase.from("leadgen_leads").update({ last_contacted_at: now, updated_at: now }).eq("id", leadId);

  revalidatePath(`/leadgen/agent/leads/${leadId}`);
  revalidatePath("/leadgen/agent");
  return result;
}
