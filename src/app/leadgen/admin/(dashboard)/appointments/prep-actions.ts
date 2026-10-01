"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { leadgenButtonHtml, sendLeadgenEmail, textToSimpleHtml } from "@/lib/leadgen-email";
import { LEADGEN_PRODUCTION_ORIGIN } from "@/lib/client-portal-shared";
import { resolveAppointmentNotificationRecipients, type LeadgenAppointmentRow, type LeadgenClientRow } from "@/lib/leadgen-types";
import {
  INTEREST_LEVELS,
  MAX_SUGGESTED_QUESTIONS,
  MAX_TALKING_POINTS,
  appointmentPortalPath,
  buildBriefEmailBody,
  buildBriefEmailSubject,
  buildFeedbackRequestEmailBody,
  buildFeedbackRequestEmailSubject,
  deriveFeedbackStatus,
  hasAppointmentPassed,
  isBriefContentComplete,
  isPreparableAppointment,
  parseLineList,
  trimmedOrNull,
  type AppointmentBriefRow,
  type AppointmentFeedbackRow,
  type FeedbackStatus,
  type InterestLevel,
  type PrepStatus,
} from "@/lib/leadgen-appointment-prep";
import { fetchBrief, fetchClientPortalLogins, fetchSdrCallNotes } from "@/lib/leadgen-appointment-prep-data";

type ActionResult = { error?: string; message?: string };

export type BriefFormInput = {
  why_interested: string;
  primary_opportunity: string;
  interest_level: string;
  recommended_objective: string;
  appointment_summary: string;
  talking_points: string; // one per line
  suggested_questions: string; // one per line
  recommended_next_step: string;
  next_step_note: string;
  admin_note: string; // internal - never client-visible
};

export type AppointmentPrepData = {
  appointment: LeadgenAppointmentRow;
  clientName: string;
  campaignName: string | null;
  agentName: string | null;
  lead: { website: string | null; industry: string | null; city: string | null; province: string | null } | null;
  callNotes: { id: string; occurred_at: string; call_outcome: string | null; notes: string }[];
  brief: AppointmentBriefRow | null;
  adminNote: { prep_note: string | null; feedback_note: string | null } | null;
  feedback: AppointmentFeedbackRow | null;
  feedbackStatus: FeedbackStatus | null;
  recipients: string[];
};

async function loadAppointment(appointmentId: string): Promise<LeadgenAppointmentRow | null> {
  const { data } = await getSupabaseAdmin().from("leadgen_appointments").select("*").eq("id", appointmentId).maybeSingle();
  return (data as LeadgenAppointmentRow | null) ?? null;
}

// Everything the Prepare Appointment modal shows, loaded on open. Reads the
// existing lead/appointment/call-history records by reference - nothing is
// copied into new tables except the Admin's own brief text.
export async function loadAppointmentPrepAction(appointmentId: string): Promise<{ error?: string; data?: AppointmentPrepData }> {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const appointment = await loadAppointment(appointmentId);
  if (!appointment) return { error: "Appointment not found." };

  const [{ data: client }, { data: campaign }, { data: agent }, { data: lead }, callNotes, brief, { data: adminNote }, { data: feedback }] = await Promise.all([
    admin.from("leadgen_clients").select("*").eq("id", appointment.client_id).maybeSingle(),
    appointment.campaign_id ? admin.from("leadgen_campaigns").select("name").eq("id", appointment.campaign_id).maybeSingle() : Promise.resolve({ data: null }),
    appointment.assigned_specialist_id
      ? admin.from("leadgen_users").select("full_name, email").eq("id", appointment.assigned_specialist_id).maybeSingle()
      : Promise.resolve({ data: null }),
    appointment.lead_id
      ? admin.from("leadgen_leads").select("website, industry, city, province").eq("id", appointment.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
    fetchSdrCallNotes(admin, appointment.lead_id),
    fetchBrief(admin, appointmentId),
    admin.from("leadgen_appointment_admin_notes").select("prep_note, feedback_note").eq("appointment_id", appointmentId).maybeSingle(),
    admin.from("leadgen_appointment_feedback").select("*").eq("appointment_id", appointmentId).maybeSingle(),
  ]);

  const clientRow = client as LeadgenClientRow | null;
  const logins = await fetchClientPortalLogins(admin, appointment.client_id);
  const recipients = clientRow ? resolveAppointmentNotificationRecipients(clientRow).map((r) => r.email) : [];

  return {
    data: {
      appointment,
      clientName: clientRow?.name ?? "Client",
      campaignName: (campaign as { name: string } | null)?.name ?? null,
      agentName: (agent as { full_name: string; email: string } | null)?.full_name || (agent as { email: string } | null)?.email || null,
      lead: (lead as AppointmentPrepData["lead"]) ?? null,
      callNotes,
      brief,
      adminNote: (adminNote as AppointmentPrepData["adminNote"]) ?? null,
      feedback: (feedback as AppointmentFeedbackRow | null) ?? null,
      feedbackStatus: deriveFeedbackStatus(appointment, feedback as AppointmentFeedbackRow | null),
      recipients: recipients.length > 0 ? recipients : logins.filter((l) => l.active).map((l) => l.email),
    },
  };
}

function normalizeInterest(value: string): InterestLevel | null {
  return (INTEREST_LEVELS as readonly string[]).includes(value) ? (value as InterestLevel) : null;
}

// Upserts the brief + the internal note. Preparation status moves between
// Not Prepared <-> Ready automatically with the content; once a brief has
// been Sent/Viewed an edit never regresses that status (re-sending is a
// separate explicit action). Appointment status is never touched.
async function persistBrief(
  appointment: LeadgenAppointmentRow,
  adminId: string,
  input: BriefFormInput
): Promise<{ error?: string; brief?: AppointmentBriefRow }> {
  const admin = getSupabaseAdmin();
  const existing = await fetchBrief(admin, appointment.id);

  const fields = {
    why_interested: trimmedOrNull(input.why_interested, 600),
    primary_opportunity: trimmedOrNull(input.primary_opportunity, 120),
    interest_level: normalizeInterest(input.interest_level),
    recommended_objective: trimmedOrNull(input.recommended_objective, 160),
    appointment_summary: trimmedOrNull(input.appointment_summary, 800),
    talking_points: parseLineList(input.talking_points, MAX_TALKING_POINTS).map((line) => line.slice(0, 240)),
    suggested_questions: parseLineList(input.suggested_questions, MAX_SUGGESTED_QUESTIONS).map((line) => line.slice(0, 240)),
    recommended_next_step: trimmedOrNull(input.recommended_next_step, 120),
    next_step_note: trimmedOrNull(input.next_step_note, 300),
  };

  const alreadyDelivered = existing?.prep_status === "sent_to_client" || existing?.prep_status === "client_viewed";
  const prepStatus: PrepStatus = alreadyDelivered ? existing!.prep_status : isBriefContentComplete(fields) ? "brief_ready" : "brief_not_prepared";

  const { data, error } = await admin
    .from("leadgen_appointment_briefs")
    .upsert(
      { appointment_id: appointment.id, client_id: appointment.client_id, ...fields, prep_status: prepStatus, prepared_by: adminId, updated_at: new Date().toISOString() },
      { onConflict: "appointment_id" }
    )
    .select("*")
    .single();
  if (error || !data) return { error: "Failed to save the appointment brief." };

  const note = trimmedOrNull(input.admin_note, 1000);
  const { error: noteError } = await admin
    .from("leadgen_appointment_admin_notes")
    .upsert({ appointment_id: appointment.id, prep_note: note, updated_by: adminId, updated_at: new Date().toISOString() }, { onConflict: "appointment_id" });
  if (noteError) return { error: "Failed to save the internal note." };

  return { brief: data as AppointmentBriefRow };
}

export async function saveAppointmentBriefAction(appointmentId: string, input: BriefFormInput): Promise<ActionResult & { prepStatus?: PrepStatus }> {
  const adminUser = await requireLeadgenAdmin();
  const appointment = await loadAppointment(appointmentId);
  if (!appointment) return { error: "Appointment not found." };
  if (!isPreparableAppointment(appointment)) return { error: "Cancelled or replaced appointments can't be prepared." };

  const result = await persistBrief(appointment, adminUser.id, input);
  if (result.error || !result.brief) return { error: result.error };

  revalidatePath("/leadgen/admin/appointments");
  return { message: "Brief saved.", prepStatus: result.brief.prep_status };
}

// "Send Appointment Brief": 1) save the latest brief, 2) email the client
// through the existing sendLeadgenEmail pipeline (tracked in
// leadgen_emails), 3) only after at least one delivery succeeds, mark the
// brief Sent to Client. The CTA is an id-only portal deep link - the client
// must sign in and RLS decides what they may see, so nothing sensitive is in
// the URL.
export async function sendAppointmentBriefAction(appointmentId: string, input: BriefFormInput): Promise<ActionResult & { prepStatus?: PrepStatus }> {
  const adminUser = await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const appointment = await loadAppointment(appointmentId);
  if (!appointment) return { error: "Appointment not found." };
  if (!isPreparableAppointment(appointment)) return { error: "Cancelled or replaced appointments can't be prepared." };
  if (hasAppointmentPassed(appointment)) return { error: "This appointment has already taken place - there is nothing left to prepare." };

  const saved = await persistBrief(appointment, adminUser.id, input);
  if (saved.error || !saved.brief) return { error: saved.error };
  const brief = saved.brief;
  if (!isBriefContentComplete(brief)) {
    return { error: "Add why the prospect is interested, a primary opportunity, and at least one talking point or question before sending. Your changes were saved." };
  }

  const { data: client } = await admin.from("leadgen_clients").select("*").eq("id", appointment.client_id).maybeSingle();
  if (!client) return { error: "Client not found." };
  const clientRow = client as LeadgenClientRow;
  let recipients = resolveAppointmentNotificationRecipients(clientRow);
  if (recipients.length === 0) {
    recipients = (await fetchClientPortalLogins(admin, clientRow.id)).filter((l) => l.active).map((l) => ({ email: l.email, name: l.full_name }));
  }
  if (recipients.length === 0) return { error: "This client has no email address on file. Add one before sending. Your changes were saved." };

  const portalUrl = `${LEADGEN_PRODUCTION_ORIGIN}${appointmentPortalPath(appointment.id)}`;
  const subject = buildBriefEmailSubject(appointment.business_name, appointment.appointment_date);
  let delivered = 0;
  const failures: string[] = [];
  for (const recipient of recipients) {
    const body = buildBriefEmailBody({
      clientName: clientRow.name,
      businessName: appointment.business_name,
      appointmentDate: appointment.appointment_date,
      appointmentTime: appointment.appointment_time,
      timezone: appointment.timezone,
      primaryOpportunity: brief.primary_opportunity,
      whyInterested: brief.why_interested,
      recommendedNextStep: brief.recommended_next_step,
      portalUrl,
    });
    const intro = body.split("\n\nView Appointment Brief")[0];
    const html = `${textToSimpleHtml(intro)}${leadgenButtonHtml(portalUrl, "View Appointment Brief")}${textToSimpleHtml("Best,\nWinsalot Corp. Team")}`;
    const result = await sendLeadgenEmail(admin, {
      clientId: appointment.client_id,
      campaignId: appointment.campaign_id,
      // Client-level communication: lead_id/appointment_id stay null so this
      // never replaces the prospect-facing "Last appointment email" badge or
      // the lead's Latest Email Activity (both read by lead/appointment id).
      // It still appears in the client's Communications view.
      leadId: null,
      appointmentId: null,
      templateKey: null,
      toEmail: recipient.email,
      toName: recipient.name,
      subject,
      body,
      html,
      sentBy: adminUser.id,
      clientVisible: true,
    });
    if (result.error) failures.push(`${recipient.email}: ${result.error}`);
    else delivered += 1;
  }

  if (delivered === 0) return { error: `The brief email could not be delivered (${failures.join("; ")}). Your changes were saved; the status was not changed.` };

  const now = new Date().toISOString();
  const { error: statusError } = await admin
    .from("leadgen_appointment_briefs")
    .update({ prep_status: "sent_to_client", sent_at: now, sent_by: adminUser.id, viewed_at: null, updated_at: now })
    .eq("appointment_id", appointment.id);
  if (statusError) return { error: "The email was sent but the status could not be updated." };

  revalidatePath("/leadgen/admin/appointments");
  return {
    message: failures.length ? `Sent to ${delivered} recipient(s); ${failures.length} failed.` : `Brief sent to ${delivered} recipient${delivered === 1 ? "" : "s"}.`,
    prepStatus: "sent_to_client",
  };
}

// Optional Admin-triggered feedback request - same email pipeline, concise.
export async function sendFeedbackRequestAction(appointmentId: string): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const appointment = await loadAppointment(appointmentId);
  if (!appointment) return { error: "Appointment not found." };
  if (!isPreparableAppointment(appointment) || !hasAppointmentPassed(appointment)) return { error: "Feedback can only be requested after the appointment has taken place." };

  const { data: existing } = await admin.from("leadgen_appointment_feedback").select("id").eq("appointment_id", appointmentId).maybeSingle();
  if (existing) return { error: "Feedback has already been received for this appointment." };

  const { data: client } = await admin.from("leadgen_clients").select("*").eq("id", appointment.client_id).maybeSingle();
  if (!client) return { error: "Client not found." };
  const clientRow = client as LeadgenClientRow;
  let recipients = resolveAppointmentNotificationRecipients(clientRow);
  if (recipients.length === 0) {
    recipients = (await fetchClientPortalLogins(admin, clientRow.id)).filter((l) => l.active).map((l) => ({ email: l.email, name: l.full_name }));
  }
  if (recipients.length === 0) return { error: "This client has no email address on file." };

  const portalUrl = `${LEADGEN_PRODUCTION_ORIGIN}${appointmentPortalPath(appointment.id)}`;
  const subject = buildFeedbackRequestEmailSubject(appointment.business_name);
  let delivered = 0;
  for (const recipient of recipients) {
    const body = buildFeedbackRequestEmailBody({ clientName: clientRow.name, businessName: appointment.business_name, appointmentDate: appointment.appointment_date, portalUrl });
    const intro = body.split("\n\nShare Feedback")[0];
    const html = `${textToSimpleHtml(intro)}${leadgenButtonHtml(portalUrl, "Share Feedback")}${textToSimpleHtml("Best,\nWinsalot Corp. Team")}`;
    const result = await sendLeadgenEmail(admin, {
      clientId: appointment.client_id,
      campaignId: appointment.campaign_id,
      // Client-level communication: lead_id/appointment_id stay null so this
      // never replaces the prospect-facing "Last appointment email" badge or
      // the lead's Latest Email Activity (both read by lead/appointment id).
      // It still appears in the client's Communications view.
      leadId: null,
      appointmentId: null,
      templateKey: null,
      toEmail: recipient.email,
      toName: recipient.name,
      subject,
      body,
      html,
      sentBy: adminUser.id,
      clientVisible: true,
    });
    if (!result.error) delivered += 1;
  }
  if (delivered === 0) return { error: "The feedback request could not be delivered. Please try again." };
  return { message: `Feedback request sent to ${delivered} recipient${delivered === 1 ? "" : "s"}.` };
}

// Internal Admin note on the feedback - stored in the admin-only table and
// never selected by any client portal query.
export async function saveFeedbackAdminNoteAction(appointmentId: string, note: string): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const appointment = await loadAppointment(appointmentId);
  if (!appointment) return { error: "Appointment not found." };
  const { error } = await getSupabaseAdmin()
    .from("leadgen_appointment_admin_notes")
    .upsert({ appointment_id: appointmentId, feedback_note: trimmedOrNull(note, 1000), updated_by: adminUser.id, updated_at: new Date().toISOString() }, { onConflict: "appointment_id" });
  if (error) return { error: "Failed to save the internal note." };
  return { message: "Internal note saved." };
}
