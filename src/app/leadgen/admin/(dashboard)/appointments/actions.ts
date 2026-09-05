"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendLeadgenEmail } from "@/lib/leadgen-email";
import { notifyOfNewLeadgenAppointment } from "@/lib/leadgen-appointment-notifications";
import { sendLeadgenAppointmentEmail } from "@/lib/leadgen-appointment-emails";
import { claimManualAppointmentReminderSlot, updateLeadgenAppointmentReminderSettings } from "@/lib/leadgen-appointment-reminders";
import { isValidMobileNumber, sendImmediateAppointmentConfirmation } from "@/lib/appointment-sms";
import { zonedWallTimeToUtcMs } from "@/lib/leadgen-appointment-reminders";
import {
  LEADGEN_APPOINTMENT_INCENTIVE_STATUSES,
  LEADGEN_APPOINTMENT_STATUSES,
  LEADGEN_MEETING_TYPES,
  type LeadgenAppointmentIncentiveStatus,
  type LeadgenAppointmentRow,
  type LeadgenAppointmentStatus,
  type LeadgenMeetingType,
} from "@/lib/leadgen-types";

type ActionResult = { error?: string; message?: string };

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function buildNewAppointmentEmailBody(input: {
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  appointmentDate: string;
  appointmentTime: string;
  timezone: string;
  meetingType: string;
  meetingLink: string | null;
  agentNotes: string | null;
}): string {
  const lines = [
    "A new appointment has been booked.",
    "",
    `Business Name: ${input.businessName}`,
    `Contact Name: ${input.contactName ?? "—"}`,
    `Phone Number: ${input.phone ?? "—"}`,
    `Email: ${input.email ?? "—"}`,
    `Appointment Date: ${input.appointmentDate}`,
    `Appointment Time: ${input.appointmentTime}`,
    `Time Zone: ${input.timezone}`,
    `Meeting Type: ${input.meetingType}`,
  ];
  if (input.meetingLink) lines.push(`Meeting Link: ${input.meetingLink}`);
  if (input.agentNotes) lines.push("", `Notes: ${input.agentNotes}`);
  lines.push("", "Regards,", "", "Winsalot Corp.");
  return lines.join("\n");
}

// Books an appointment (brief "APPOINTMENT FIELDS"). If tied to a lead,
// advances that lead's status to "Appointment booked" and logs it to the
// activity timeline. Optionally emails the client contact immediately
// (brief EMAIL FEATURES #1: "Send a client notification when a new
// appointment is booked") using the "agent notes approved for client
// viewing" field, never the lead's full internal notes.
export async function bookAppointmentAction(formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();

  const clientId = String(formData.get("client_id") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const appointmentDate = String(formData.get("appointment_date") ?? "").trim();
  const appointmentTime = String(formData.get("appointment_time") ?? "").trim();
  const meetingType = String(formData.get("meeting_type") ?? "").trim();

  if (!clientId) return { error: "Select a client." };
  if (!businessName) return { error: "Business name is required." };
  if (!appointmentDate || !appointmentTime) return { error: "Appointment date and time are required." };
  if (!LEADGEN_MEETING_TYPES.includes(meetingType as LeadgenMeetingType)) return { error: "Select a meeting type." };

  const leadId = textOrNull(formData, "lead_id");
  const contactName = textOrNull(formData, "contact_name");
  const phone = textOrNull(formData, "phone");
  const email = textOrNull(formData, "email");
  const timezone = String(formData.get("timezone") ?? "America/Toronto").trim();
  const meetingLink = textOrNull(formData, "meeting_link");
  const agentNotes = textOrNull(formData, "appointment_notes");
  const clientVisibleNotes = textOrNull(formData, "client_visible_notes");

  const supabase = await createSupabaseServerClient();
  const { data: appointment, error } = await supabase
    .from("leadgen_appointments")
    .insert({
      lead_id: leadId,
      client_id: clientId,
      campaign_id: textOrNull(formData, "campaign_id"),
      business_name: businessName,
      contact_name: contactName,
      phone,
      email,
      // No separate consent checkbox - every appointment with a valid
      // mobile number is automatically eligible for SMS reminders, on
      // the notice shown beneath the phone field.
      sms_consent: isValidMobileNumber(phone),
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      timezone,
      meeting_type: meetingType,
      meeting_link: meetingLink,
      assigned_specialist_id: textOrNull(formData, "assigned_specialist_id"),
      appointment_notes: agentNotes,
      created_by: adminUser.id,
    })
    .select("id")
    .single();

  if (error || !appointment) return { error: "Failed to book the appointment." };

  if (leadId) {
    await supabase
      .from("leadgen_leads")
      .update({ status: "Appointment booked", last_contacted_at: new Date().toISOString() })
      .eq("id", leadId);
    await supabase.from("leadgen_lead_activities").insert({
      lead_id: leadId,
      agent_id: null,
      activity_type: "appointment_booked",
      call_outcome: "Appointment booked",
      notes: `Appointment booked for ${appointmentDate} ${appointmentTime} (${timezone}) by ${adminUser.full_name || adminUser.email}.`,
    });
  }

  if (formData.get("notify_client") === "true") {
    const { data: client } = await supabase.from("leadgen_clients").select("contact_email").eq("id", clientId).maybeSingle();
    if (client?.contact_email) {
      await sendLeadgenEmail(supabase, {
        clientId,
        campaignId: textOrNull(formData, "campaign_id"),
        leadId,
        appointmentId: appointment.id as string,
        templateKey: null,
        toEmail: client.contact_email,
        subject: `New Appointment Booked: ${businessName}`,
        body: buildNewAppointmentEmailBody({
          businessName,
          contactName,
          phone,
          email,
          appointmentDate,
          appointmentTime,
          timezone,
          meetingType,
          meetingLink,
          agentNotes: clientVisibleNotes,
        }),
        sentBy: adminUser.id,
        clientVisible: true,
      });
    }
  }

  const { data: clientForNotify } = await supabase
    .from("leadgen_clients")
    .select("id, name, contact_name, contact_email, appointment_notification_emails, sms_notification_number")
    .eq("id", clientId)
    .maybeSingle();
  await sendImmediateAppointmentConfirmation(getSupabaseAdmin(), {
    table: "leadgen_appointment_sms_reminders",
    appointmentId: appointment.id as string,
    leadId,
    scheduledAppointmentAtIso: new Date(zonedWallTimeToUtcMs(appointmentDate, appointmentTime, timezone)).toISOString(),
    timezone,
    prospectPhone: phone,
    prospectConsent: isValidMobileNumber(phone),
    businessName: clientForNotify?.name ?? "our team",
  });
  if (clientForNotify) {
    await notifyOfNewLeadgenAppointment(
      {
        id: appointment.id as string,
        lead_id: leadId,
        business_name: businessName,
        contact_name: contactName,
        phone,
        email,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        timezone,
        meeting_type: meetingType as LeadgenMeetingType,
        meeting_link: meetingLink,
        appointment_notes: agentNotes,
      },
      clientForNotify,
      adminUser.full_name || adminUser.email
    );
  }

  revalidatePath("/leadgen/admin/appointments");
  if (leadId) revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return {};
}

// Fields "Edit Appointment" can change, each paired with a human label for
// the before/after activity-log diff below. Deliberately excludes
// lead_id/client_id/campaign_id (which lead or client an appointment
// belongs to isn't something this form re-parents) and every
// incentive_status* / booking_agent_id column (handled separately, same as
// before - incentive_status_set_by/at must only stamp when the reviewed
// value itself changes, never on every edit).
const EDITABLE_APPOINTMENT_FIELDS: { key: keyof LeadgenAppointmentEditableFields; label: string }[] = [
  { key: "business_name", label: "Business Name" },
  { key: "contact_name", label: "Contact Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "sms_consent", label: "SMS Reminder Consent" },
  { key: "appointment_date", label: "Appointment Date" },
  { key: "appointment_time", label: "Appointment Time" },
  { key: "timezone", label: "Time Zone" },
  { key: "meeting_type", label: "Meeting Type" },
  { key: "meeting_link", label: "Meeting Link" },
  { key: "assigned_specialist_id", label: "Assigned Specialist" },
  { key: "appointment_notes", label: "Appointment Notes" },
  { key: "client_feedback", label: "Client Feedback" },
  { key: "status", label: "Status" },
];

type LeadgenAppointmentEditableFields = Pick<
  LeadgenAppointmentRow,
  | "business_name"
  | "contact_name"
  | "phone"
  | "email"
  | "sms_consent"
  | "appointment_date"
  | "appointment_time"
  | "timezone"
  | "meeting_type"
  | "meeting_link"
  | "assigned_specialist_id"
  | "appointment_notes"
  | "client_feedback"
  | "status"
>;

// "Edit Appointment" (brief: administrator controls to edit an existing
// booked appointment). Always an UPDATE against the same row by id - never
// an insert - so the appointment count, its booking_agent_id attribution,
// and any already-awarded incentive can never duplicate from an edit.
// Every changed field is diffed against the row's prior values and logged
// to the lead's activity timeline as one "old -> new" entry per brief
// ("save the old and new details in the activity log"), and optionally
// resends the confirmation - reusing sendLeadgenAppointmentEmail exactly
// as the standalone "Resend Confirmation" button does, so it always
// reflects the just-saved details and the prospect's latest saved email,
// never a stale snapshot.
export async function updateAppointmentAction(appointmentId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();

  const businessName = String(formData.get("business_name") ?? "").trim();
  if (!businessName) return { error: "Business name is required." };

  const appointmentDate = String(formData.get("appointment_date") ?? "").trim();
  const appointmentTime = String(formData.get("appointment_time") ?? "").trim();
  if (!appointmentDate || !appointmentTime) return { error: "Appointment date and time are required." };

  const meetingType = String(formData.get("meeting_type") ?? "").trim();
  if (!LEADGEN_MEETING_TYPES.includes(meetingType as LeadgenMeetingType)) return { error: "Select a meeting type." };

  const status = String(formData.get("status") ?? "").trim();
  if (!LEADGEN_APPOINTMENT_STATUSES.includes(status as LeadgenAppointmentStatus)) return { error: "Invalid status." };

  const incentiveStatusRaw = String(formData.get("incentive_status") ?? "").trim();
  if (incentiveStatusRaw && !LEADGEN_APPOINTMENT_INCENTIVE_STATUSES.includes(incentiveStatusRaw as LeadgenAppointmentIncentiveStatus)) {
    return { error: "Invalid incentive status." };
  }
  const incentiveStatus: LeadgenAppointmentIncentiveStatus | null = incentiveStatusRaw
    ? (incentiveStatusRaw as LeadgenAppointmentIncentiveStatus)
    : null;

  // Brief: "Reject invalid records using a required reason." Only
  // required when the record is being marked as something other than
  // Qualified (i.e. rejected) - a plain Qualified marking, or clearing
  // back to unreviewed, never needs one.
  const incentiveStatusReasonRaw = String(formData.get("incentive_status_reason") ?? "").trim() || null;
  if (incentiveStatus && incentiveStatus !== "Qualified" && !incentiveStatusReasonRaw) {
    return { error: "A reason is required when marking an appointment as anything other than Qualified." };
  }
  const incentiveStatusReason = incentiveStatus && incentiveStatus !== "Qualified" ? incentiveStatusReasonRaw : null;

  const supabase = await createSupabaseServerClient();

  // Fetched in full (not just incentive_status) so every editable field
  // can be diffed against its prior value below.
  const { data: existing } = await supabase.from("leadgen_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!existing) return { error: "Appointment not found." };
  const existingAppointment = existing as LeadgenAppointmentRow;

  // Only stamp incentive_status_set_by/at when the reviewed value is
  // actually changing - otherwise every unrelated "Save" on this form
  // (e.g. editing the meeting link) would keep resetting "when this was
  // reviewed", which would misrepresent the incentive audit trail (and,
  // per the brief, never award/re-stamp an incentive twice from an edit).
  const incentiveStatusChanged = (existingAppointment.incentive_status ?? null) !== incentiveStatus;

  const editedPhone = textOrNull(formData, "phone");
  const updatedFields: LeadgenAppointmentEditableFields = {
    business_name: businessName,
    contact_name: textOrNull(formData, "contact_name"),
    phone: editedPhone,
    email: textOrNull(formData, "email"),
    // Recomputed on every edit too - if the phone number changes, SMS
    // eligibility follows the new number automatically.
    sms_consent: isValidMobileNumber(editedPhone),
    appointment_date: appointmentDate,
    appointment_time: appointmentTime,
    timezone: String(formData.get("timezone") ?? "").trim() || existingAppointment.timezone,
    meeting_type: meetingType as LeadgenMeetingType,
    meeting_link: textOrNull(formData, "meeting_link"),
    assigned_specialist_id: textOrNull(formData, "assigned_specialist_id"),
    appointment_notes: textOrNull(formData, "appointment_notes"),
    client_feedback: textOrNull(formData, "client_feedback"),
    status: status as LeadgenAppointmentStatus,
  };

  const { data: appointment, error } = await supabase
    .from("leadgen_appointments")
    .update({
      ...updatedFields,
      confirmation_sent: formData.get("confirmation_sent") === "true",
      incentive_status: incentiveStatus,
      incentive_status_reason: incentiveStatusReason,
      ...(incentiveStatusChanged
        ? { incentive_status_set_by: adminUser.id, incentive_status_set_at: new Date().toISOString() }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId)
    .select("lead_id")
    .single();

  if (error) return { error: "Failed to update the appointment." };

  if (appointment?.lead_id) {
    const changedLines = EDITABLE_APPOINTMENT_FIELDS.filter(({ key }) => (existingAppointment[key] ?? null) !== (updatedFields[key] ?? null)).map(
      ({ key, label }) => `${label}: "${existingAppointment[key] ?? "—"}" -> "${updatedFields[key] ?? "—"}"`
    );
    if (changedLines.length > 0) {
      await supabase.from("leadgen_lead_activities").insert({
        lead_id: appointment.lead_id,
        agent_id: null,
        activity_type: "appointment_updated",
        notes: `Appointment edited by ${adminUser.full_name || adminUser.email}:\n${changedLines.join("\n")}`,
      });
    }
  }

  revalidatePath("/leadgen/admin/appointments");
  if (appointment?.lead_id) revalidatePath(`/leadgen/admin/leads/${appointment.lead_id}`);
  if (incentiveStatusChanged) {
    revalidatePath("/leadgen/admin/incentives");
    revalidatePath("/leadgen/agent");
  }

  // "Offer a checkbox to send the updated confirmation to the prospect's
  // latest saved email" - reuses the exact same send/log path as the
  // standalone "Resend Confirmation" button (never a bespoke email here),
  // fetching the appointment fresh so it reflects what was just saved
  // above, and resolving the recipient via the lead's current email
  // first (resolveAppointmentEmailRecipient), never a stale snapshot.
  // Never touches the appointment count, booking_agent_id, or incentive
  // fields - sendLeadgenAppointmentEmail only sends and logs.
  if (formData.get("send_updated_confirmation") === "true") {
    const sendResult = await sendLeadgenAppointmentEmail(supabase, appointmentId, adminUser, "resend_confirmation");
    if (sendResult.error) return { error: `Appointment saved, but the confirmation email failed to send: ${sendResult.error}` };
    return { message: "Appointment saved and the updated confirmation was resent." };
  }

  return { message: "Appointment saved." };
}

// Dedicated "Cancel/Replace Appointment" admin action (distinct from the
// general status editor above) - the clear, purpose-built way to correct
// an invalid appointment (e.g. rebooked because the original contact
// email bounced) so it stops counting toward the dashboard total,
// Results by Client/Agent, and weekly/monthly performance/incentive
// calculations (isLeadgenAppointmentCountable, leadgen-types.ts), while
// keeping the record itself - and the lead's activity history - fully
// intact for auditing. The reason is optional (brief: "require an
// optional reason"), e.g. "Incorrect email—appointment rebooked."
export async function cancelOrReplaceAppointmentAction(appointmentId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();

  const newStatus = String(formData.get("status") ?? "").trim();
  if (newStatus !== "Cancelled" && newStatus !== "Replaced") {
    return { error: "Choose Cancelled or Replaced." };
  }
  const reason = textOrNull(formData, "reason");

  const supabase = await createSupabaseServerClient();
  const { data: appointment, error } = await supabase
    .from("leadgen_appointments")
    .update({
      status: newStatus,
      status_reason: reason,
      status_set_by: adminUser.id,
      status_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId)
    .select("lead_id")
    .single();

  if (error) return { error: "Failed to update the appointment." };

  if (appointment?.lead_id) {
    await supabase.from("leadgen_lead_activities").insert({
      lead_id: appointment.lead_id,
      agent_id: null,
      activity_type: "appointment_updated",
      notes: reason
        ? `Appointment marked "${newStatus}" by ${adminUser.full_name || adminUser.email}. Reason: ${reason}`
        : `Appointment marked "${newStatus}" by ${adminUser.full_name || adminUser.email}.`,
    });
  }

  // Every place an appointment total/report is computed from this table
  // (see isLeadgenAppointmentCountable call sites) - so the correction is
  // reflected immediately on next navigation, no deploy or manual
  // browser refresh needed.
  revalidatePath("/leadgen/admin/appointments");
  revalidatePath("/leadgen/admin");
  revalidatePath("/leadgen/admin/performance");
  revalidatePath("/leadgen/admin/incentives");
  revalidatePath("/leadgen/agent");
  revalidatePath("/leadgen/agent/performance");
  if (appointment?.lead_id) revalidatePath(`/leadgen/admin/leads/${appointment.lead_id}`);
  return {};
}

// Quick incentive review directly from the Admin Appointments table's
// Incentive column ("Verify as Qualified" / "Reject" buttons) - a lean
// alternative to picking a value in the "Manage" panel's full Incentive
// Status dropdown (which stays available for the finer-grained Cancelled/
// Invalid/Duplicate categories). Touches only the incentive_status* columns
// and updated_at - never re-parents the appointment or changes any other
// field, so it can never duplicate the appointment count or its
// booking_agent_id credit. Crediting to the booking agent and bucketing
// into their current Monday-Sunday week both fall out of existing,
// unchanged logic (booking_agent_id set at insert time; leadgen-
// incentives.ts buckets by created_at) - this action only ever writes the
// review decision itself.
export async function reviewLeadgenAppointmentIncentiveAction(
  appointmentId: string,
  decision: Extract<LeadgenAppointmentIncentiveStatus, "Qualified" | "Unqualified">,
  reason: string | null
): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();

  if (decision !== "Qualified" && !reason?.trim()) {
    return { error: "A reason is required to reject an appointment." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("leadgen_appointments")
    .select("incentive_status, lead_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!existing) return { error: "Appointment not found." };

  const { error } = await supabase
    .from("leadgen_appointments")
    .update({
      incentive_status: decision,
      incentive_status_reason: decision === "Qualified" ? null : reason!.trim(),
      incentive_status_set_by: adminUser.id,
      incentive_status_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);

  if (error) return { error: "Failed to save the incentive review." };

  if (existing.lead_id) {
    await supabase.from("leadgen_lead_activities").insert({
      lead_id: existing.lead_id,
      agent_id: null,
      activity_type: "appointment_updated",
      notes:
        decision === "Qualified"
          ? `Appointment verified as Qualified for the Weekly Incentive by ${adminUser.full_name || adminUser.email}.`
          : `Appointment rejected for the Weekly Incentive by ${adminUser.full_name || adminUser.email}. Reason: ${reason!.trim()}`,
    });
  }

  // Refreshes the Admin Appointments table, the Agent Incentives
  // dashboard, and the agent's own dashboard immediately - no redeploy or
  // manual refresh needed for the new decision to be reflected everywhere
  // it's counted.
  revalidatePath("/leadgen/admin/appointments");
  revalidatePath("/leadgen/admin/incentives");
  revalidatePath("/leadgen/agent");
  if (existing.lead_id) revalidatePath(`/leadgen/admin/leads/${existing.lead_id}`);
  return {};
}

// Admin-only "Delete" - permanently removes the appointment row itself,
// distinct from "Cancel/Replace" (which keeps the record for auditing
// but excludes it from every total). Available for every status
// (Booked, Confirmed, Cancelled, Replaced, or any test/unqualified
// record) since there's no status this shouldn't work for.
//
// Only ever touches this one appointment row:
// - leadgen_appointment_reminders and
//   leadgen_appointment_business_reminders both declare
//   `appointment_id ... on delete cascade`, so Postgres removes this
//   appointment's reminder rows automatically - nothing to delete here
//   by hand, and no other appointment's reminders are affected.
// - leadgen_emails.appointment_id is `on delete set null` - the lead's
//   email/communication history is preserved (just unlinked from the
//   now-gone appointment), not deleted, since that's history, not a
//   "reminder record".
// - No FK from leadgen_appointments to leadgen_leads/leadgen_clients/
//   leadgen_campaigns in the other direction, so the lead, its other
//   appointments, and the client/campaign are completely untouched.
// Because every dashboard total, Results by Client/Agent, and incentive
// calculation (isLeadgenAppointmentCountable, lib/leadgen-types.ts)
// simply queries leadgen_appointments live, deleting the row removes it
// from all of them immediately - nothing else to update.
export async function deleteLeadgenAppointmentAction(appointmentId: string): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: appointment, error: readError } = await supabase
    .from("leadgen_appointments")
    .select("id, lead_id, business_name")
    .eq("id", appointmentId)
    .maybeSingle();
  if (readError) return { error: "Failed to load the appointment." };
  if (!appointment) return { error: "Appointment not found." };

  const { error } = await supabase.from("leadgen_appointments").delete().eq("id", appointmentId);
  if (error) return { error: "Failed to delete the appointment." };

  if (appointment.lead_id) {
    await supabase.from("leadgen_lead_activities").insert({
      lead_id: appointment.lead_id,
      agent_id: null,
      activity_type: "appointment_updated",
      notes: `Appointment for ${appointment.business_name} permanently deleted by ${adminUser.full_name || adminUser.email}.`,
    });
  }

  revalidatePath("/leadgen/admin/appointments");
  revalidatePath("/leadgen/admin");
  revalidatePath("/leadgen/admin/performance");
  revalidatePath("/leadgen/admin/incentives");
  revalidatePath("/leadgen/agent");
  revalidatePath("/leadgen/agent/performance");
  if (appointment.lead_id) revalidatePath(`/leadgen/admin/leads/${appointment.lead_id}`);
  return {};
}

// "Resend Appointment Notification" / "Send Appointment Reminder" (brief
// EMAIL FEATURES #4/#5) - admins may use both for every booked
// appointment. Shared send/log logic lives in sendLeadgenAppointmentEmail
// (lib/leadgen-appointment-emails.ts) so the admin and agent action files
// can never drift out of sync on what gets sent or logged.
export async function resendAppointmentNotificationAction(appointmentId: string): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();
  const result = await sendLeadgenAppointmentEmail(supabase, appointmentId, adminUser, "resend_confirmation");
  if (result.error) return { error: result.error };

  revalidatePath("/leadgen/admin/appointments");
  if (result.leadId) revalidatePath(`/leadgen/admin/leads/${result.leadId}`);
  return {};
}

// countAsAutomaticReminder (brief MANUAL CONTROLS: "unless the
// administrator explicitly chooses 'Count this as the 24-hour
// reminder'") claims this occurrence's automatic-reminder slot after a
// successful send, so the cron job skips it later - admin-only by
// construction (only the admin appointments/lead-detail UI ever renders
// the checkbox that sets this true; the agent action below never
// forwards it).
export async function sendAppointmentReminderAction(appointmentId: string, countAsAutomaticReminder?: boolean): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();
  const result = await sendLeadgenAppointmentEmail(supabase, appointmentId, adminUser, "reminder");
  if (result.error) return { error: result.error };

  if (countAsAutomaticReminder && result.appointmentId && result.occurrenceKey && result.recipientEmail) {
    const { data: appointment } = await supabase.from("leadgen_appointments").select("appointment_date, appointment_time, timezone").eq("id", result.appointmentId).maybeSingle();
    if (appointment) {
      await claimManualAppointmentReminderSlot(supabase, {
        appointmentId: result.appointmentId,
        leadId: result.leadId ?? null,
        appointmentDate: appointment.appointment_date,
        appointmentTime: appointment.appointment_time,
        timezone: appointment.timezone,
        recipientEmail: result.recipientEmail,
        emailId: result.emailId ?? null,
        createdBy: adminUser.id,
      });
    }
  }

  revalidatePath("/leadgen/admin/appointments");
  if (result.leadId) revalidatePath(`/leadgen/admin/leads/${result.leadId}`);
  return {};
}

// "ADMIN SETTINGS" (brief): a small on/off toggle plus the reminder
// timing and sender/reply-to display values, backed by the
// leadgen_appointment_reminder_settings singleton row the cron job reads
// on every run (lib/leadgen-appointment-reminders.ts).
export async function updateLeadgenAppointmentReminderSettingsAction(formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const hoursBeforeRaw = String(formData.get("reminder_hours_before") ?? "").trim();
  const hoursBefore = Number(hoursBeforeRaw);
  if (!hoursBeforeRaw || !Number.isFinite(hoursBefore) || hoursBefore <= 0) return { error: "Reminder timing must be a positive number of hours." };

  const senderName = String(formData.get("sender_name") ?? "").trim();
  if (!senderName) return { error: "Sender name is required." };

  const replyToEmail = String(formData.get("reply_to_email") ?? "").trim();
  if (!replyToEmail) return { error: "Reply-to address is required." };

  const result = await updateLeadgenAppointmentReminderSettings(
    supabase,
    {
      automatic_reminders_enabled: formData.get("automatic_reminders_enabled") === "true",
      automatic_sms_reminders_enabled: formData.get("automatic_sms_reminders_enabled") === "true",
      reminder_hours_before: hoursBefore,
      sender_name: senderName,
      reply_to_email: replyToEmail,
    },
    adminUser.full_name || adminUser.email
  );
  if (result.error) return result;

  revalidatePath("/leadgen/admin/appointments");
  return {};
}
