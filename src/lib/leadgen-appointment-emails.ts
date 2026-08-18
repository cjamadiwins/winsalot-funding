import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendLeadgenEmail } from "./leadgen-email";
import { isValidEmail, type LeadgenAppointmentRow } from "./leadgen-types";

export type AppointmentEmailKind = "resend_confirmation" | "reminder";

export type AppointmentEmailActionResult = { error?: string; emailId?: string; leadId?: string | null };

function appointmentDetailLines(appt: LeadgenAppointmentRow): string[] {
  const lines = [
    `Appointment Date: ${appt.appointment_date}`,
    `Appointment Time: ${appt.appointment_time} (${appt.timezone})`,
    `Meeting Type: ${appt.meeting_type}`,
  ];
  if (appt.meeting_link) lines.push(`Meeting Link: ${appt.meeting_link}`);
  if (appt.appointment_notes) lines.push("", `Consultation Details: ${appt.appointment_notes}`);
  return lines;
}

function buildAppointmentEmailBody(appt: LeadgenAppointmentRow, contactName: string | null, clientName: string, kind: AppointmentEmailKind): string {
  const intro =
    kind === "reminder"
      ? `This is a friendly reminder about your upcoming FREE 15-minute Business Growth Consultation with ${clientName}.`
      : `This is a resend of your appointment confirmation for your FREE 15-minute Business Growth Consultation with ${clientName}. Your appointment has not changed.`;

  return [
    `Hi ${contactName || "there"},`,
    "",
    intro,
    "",
    ...appointmentDetailLines(appt),
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
// incentives"), and always resolves the recipient from the lead's
// currently saved email (brief: "must always send to the lead's latest
// saved email address"), not the address snapshotted on the appointment
// at booking time.
export async function sendLeadgenAppointmentEmail(
  supabase: SupabaseClient,
  appointmentId: string,
  actingUser: { id: string; full_name: string; email: string },
  kind: AppointmentEmailKind
): Promise<AppointmentEmailActionResult> {
  const { data: apptRow } = await supabase.from("leadgen_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!apptRow) return { error: "Appointment not found." };
  const appointment = apptRow as LeadgenAppointmentRow;

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

  if (!recipientEmail) return { error: "This lead has no email address on file. Add one before sending." };
  if (!isValidEmail(recipientEmail)) return { error: "The saved email address is invalid. Correct it before sending." };

  const { data: client } = await supabase.from("leadgen_clients").select("name").eq("id", appointment.client_id).maybeSingle();
  const clientName = client?.name ?? businessName;

  const subject = kind === "reminder" ? `Reminder: Your Upcoming Consultation with ${clientName}` : `Your Consultation with ${clientName} is Confirmed`;
  const body = buildAppointmentEmailBody(appointment, recipientName, clientName, kind);

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

  return { ...result, leadId: appointment.lead_id };
}
