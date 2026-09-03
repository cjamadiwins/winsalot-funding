import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendLeadgenEmail } from "./leadgen-email";
import { isValidEmail, leadgenAppointmentOccurrenceKey, type LeadgenAppointmentRow } from "./leadgen-types";

// "resend_confirmation" / "reminder" are the two manual buttons (brief
// EMAIL FEATURES #4/#5). "auto_reminder" / "auto_reminder_1h" are the
// automatic 24-hour and 1-hour reminders the cron jobs send - same
// underlying content shape, distinct subject/intro wording only, so all
// four share one builder instead of competing ones.
export type AppointmentEmailKind = "resend_confirmation" | "reminder" | "auto_reminder" | "auto_reminder_1h";

export type AppointmentEmailActionResult = {
  error?: string;
  emailId?: string;
  leadId?: string | null;
  appointmentId?: string;
  occurrenceKey?: string;
  recipientEmail?: string;
};

export type AppointmentEmailRecipient = {
  recipientEmail: string | null;
  recipientName: string | null;
  businessName: string;
  clientName: string;
};

// Always resolves the recipient from the lead's *currently saved* email
// (brief: "must always send to the lead's latest saved email address"),
// never the address snapshotted on the appointment at booking time - the
// one lookup both the manual actions and the automatic reminder job
// share, so neither can drift from the other's notion of "latest email."
export async function resolveAppointmentEmailRecipient(supabase: SupabaseClient, appointment: LeadgenAppointmentRow): Promise<AppointmentEmailRecipient> {
  let recipientEmail = appointment.email;
  let recipientName = appointment.contact_name;
  let businessName = appointment.business_name;

  if (appointment.lead_id) {
    const { data: lead } = await supabase
      .from("leadgen_leads")
      .select("email, contact_name, business_name")
      .eq("id", appointment.lead_id)
      .maybeSingle();
    if (lead) {
      recipientEmail = lead.email ?? recipientEmail;
      recipientName = lead.contact_name ?? recipientName;
      businessName = lead.business_name ?? businessName;
    }
  }

  const { data: client } = await supabase.from("leadgen_clients").select("name").eq("id", appointment.client_id).maybeSingle();
  const clientName = client?.name ?? businessName;

  return { recipientEmail, recipientName, businessName, clientName };
}

function appointmentDetailLines(appt: LeadgenAppointmentRow, businessName: string): string[] {
  const lines = [
    `Business Name: ${businessName}`,
    `Appointment Date: ${appt.appointment_date}`,
    `Appointment Time: ${appt.appointment_time} (${appt.timezone})`,
    `Meeting Type: ${appt.meeting_type}`,
  ];
  if (appt.meeting_link) lines.push(`Meeting Link: ${appt.meeting_link}`);
  if (appt.appointment_notes) lines.push("", `Consultation Details: ${appt.appointment_notes}`);
  return lines;
}

export function buildAppointmentEmailSubject(kind: AppointmentEmailKind, clientName: string): string {
  switch (kind) {
    case "reminder":
      return `Reminder: Your Upcoming Consultation with ${clientName}`;
    case "auto_reminder":
      // Brief's suggested subject, applied per-client rather than
      // hardcoded to "Brent's Essentials" - clientName already resolves
      // to that for the one real client today.
      return `Reminder: Your Consultation with ${clientName} Is Tomorrow`;
    case "auto_reminder_1h":
      return `Reminder: Your Consultation with ${clientName} Starts in 1 Hour`;
    case "resend_confirmation":
    default:
      return `Your Consultation with ${clientName} is Confirmed`;
  }
}

export function buildAppointmentEmailBody(appt: LeadgenAppointmentRow, contactName: string | null, businessName: string, clientName: string, kind: AppointmentEmailKind): string {
  const intro =
    kind === "auto_reminder"
      ? `This is a friendly reminder that your FREE 15-minute Business Growth Consultation with ${clientName} is coming up in about 24 hours.`
      : kind === "auto_reminder_1h"
        ? `This is a friendly reminder that your FREE 15-minute Business Growth Consultation with ${clientName} is starting in about 1 hour.`
        : kind === "reminder"
          ? `This is a friendly reminder about your upcoming FREE 15-minute Business Growth Consultation with ${clientName}.`
          : `This is a resend of your appointment confirmation for your FREE 15-minute Business Growth Consultation with ${clientName}. Your appointment has not changed.`;

  return [
    `Hi ${contactName || "there"},`,
    "",
    intro,
    "",
    ...appointmentDetailLines(appt, businessName),
    "",
    "If you need to reschedule or have any questions, just reply to this email.",
    "",
    "We look forward to speaking with you!",
    "",
    "Best,",
    `${clientName} Team`,
  ].join("\n");
}

// Shared by the admin and agent "Resend Appointment Notification" / "Send
// Appointment Reminder" actions (brief EMAIL FEATURES #4/#5) - one
// implementation so both roles send/log identically. Never touches the
// leadgen_appointments row itself (no new appointment, no changed count,
// agent, date, or time - brief: "Resending must not... Trigger duplicate
// incentives").
export async function sendLeadgenAppointmentEmail(
  supabase: SupabaseClient,
  appointmentId: string,
  actingUser: { id: string; full_name: string; email: string },
  kind: "resend_confirmation" | "reminder"
): Promise<AppointmentEmailActionResult> {
  const { data: apptRow } = await supabase.from("leadgen_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!apptRow) return { error: "Appointment not found." };
  const appointment = apptRow as LeadgenAppointmentRow;

  const { recipientEmail, recipientName, businessName, clientName } = await resolveAppointmentEmailRecipient(supabase, appointment);

  if (!recipientEmail) return { error: "This lead has no email address on file. Add one before sending." };
  if (!isValidEmail(recipientEmail)) return { error: "The saved email address is invalid. Correct it before sending." };

  const subject = buildAppointmentEmailSubject(kind, clientName);
  const body = buildAppointmentEmailBody(appointment, recipientName, businessName, clientName, kind);

  const result = await sendLeadgenEmail(supabase, {
    clientId: appointment.client_id,
    campaignId: appointment.campaign_id,
    leadId: appointment.lead_id,
    appointmentId: appointment.id,
    templateKey: null,
    toEmail: recipientEmail,
    toName: recipientName,
    subject,
    body,
    sentBy: actingUser.id,
    clientVisible: false,
  });

  if (result.error) return result;

  if (appointment.lead_id) {
    const label = kind === "reminder" ? "Appointment reminder" : "Appointment confirmation resent";
    await supabase.from("leadgen_lead_activities").insert({
      lead_id: appointment.lead_id,
      agent_id: actingUser.id,
      activity_type: kind === "reminder" ? "appointment_reminder_sent" : "appointment_confirmation_resent",
      notes: `${label} to ${recipientEmail} by ${actingUser.full_name || actingUser.email}.`,
    });
  }

  return {
    ...result,
    leadId: appointment.lead_id,
    appointmentId: appointment.id,
    occurrenceKey: leadgenAppointmentOccurrenceKey(appointment.appointment_date, appointment.appointment_time),
    recipientEmail,
  };
}
