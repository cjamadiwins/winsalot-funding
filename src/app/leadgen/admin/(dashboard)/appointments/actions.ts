"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendLeadgenEmail } from "@/lib/leadgen-email";
import { notifyOfNewLeadgenAppointment } from "@/lib/leadgen-appointment-notifications";
import { sendLeadgenAppointmentEmail } from "@/lib/leadgen-appointment-emails";
import { claimManualAppointmentReminderSlot, updateLeadgenAppointmentReminderSettings } from "@/lib/leadgen-appointment-reminders";
import {
  LEADGEN_APPOINTMENT_INCENTIVE_STATUSES,
  LEADGEN_APPOINTMENT_STATUSES,
  LEADGEN_MEETING_TYPES,
  type LeadgenAppointmentIncentiveStatus,
  type LeadgenAppointmentStatus,
  type LeadgenMeetingType,
} from "@/lib/leadgen-types";

type ActionResult = { error?: string };

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

  const { data: clientForNotify } = await supabase.from("leadgen_clients").select("id, name").eq("id", clientId).maybeSingle();
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
      },
      clientForNotify,
      adminUser.full_name || adminUser.email
    );
  }

  revalidatePath("/leadgen/admin/appointments");
  if (leadId) revalidatePath(`/leadgen/admin/leads/${leadId}`);
  return {};
}

export async function updateAppointmentAction(appointmentId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
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

  // Only stamp incentive_status_set_by/at when the reviewed value is
  // actually changing - otherwise every unrelated "Save" on this form
  // (e.g. editing the meeting link) would keep resetting "when this was
  // reviewed", which would misrepresent the incentive audit trail.
  const { data: existing } = await supabase.from("leadgen_appointments").select("incentive_status").eq("id", appointmentId).maybeSingle();
  const incentiveStatusChanged = (existing?.incentive_status ?? null) !== incentiveStatus;

  const { data: appointment, error } = await supabase
    .from("leadgen_appointments")
    .update({
      status,
      appointment_date: String(formData.get("appointment_date") ?? "").trim() || undefined,
      appointment_time: String(formData.get("appointment_time") ?? "").trim() || undefined,
      meeting_link: textOrNull(formData, "meeting_link"),
      assigned_specialist_id: textOrNull(formData, "assigned_specialist_id"),
      appointment_notes: textOrNull(formData, "appointment_notes"),
      client_feedback: textOrNull(formData, "client_feedback"),
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
    await supabase.from("leadgen_lead_activities").insert({
      lead_id: appointment.lead_id,
      agent_id: null,
      activity_type: "appointment_updated",
      notes: `Appointment status changed to "${status}".`,
    });
  }

  revalidatePath("/leadgen/admin/appointments");
  if (appointment?.lead_id) revalidatePath(`/leadgen/admin/leads/${appointment.lead_id}`);
  if (incentiveStatusChanged) {
    revalidatePath("/leadgen/admin/incentives");
    revalidatePath("/leadgen/agent");
  }
  return {};
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
