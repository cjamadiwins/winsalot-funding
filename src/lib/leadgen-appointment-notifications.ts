import "server-only";
import { sendLeadgenEmail } from "./leadgen-email";
import { sendSmsToNumber } from "./twilio";
import { getSiteUrl } from "./site-url";
import { getSupabaseAdmin } from "./supabase-admin";
import { resolveAppointmentNotificationRecipients, type LeadgenAppointmentRow, type LeadgenClientRow } from "./leadgen-types";

type AppointmentForNotify = Pick<
  LeadgenAppointmentRow,
  | "id"
  | "lead_id"
  | "contact_name"
  | "business_name"
  | "email"
  | "phone"
  | "appointment_date"
  | "appointment_time"
  | "timezone"
  | "meeting_type"
  | "meeting_link"
  | "appointment_notes"
>;

function appointmentSummaryLines(appt: AppointmentForNotify, clientName: string, agentName: string | null): string[] {
  return [
    `Prospect: ${appt.contact_name || "—"}`,
    `Business: ${appt.business_name}`,
    `Email: ${appt.email || "—"}`,
    `Phone: ${appt.phone || "—"}`,
    `Appointment Date: ${appt.appointment_date}`,
    `Appointment Time: ${appt.appointment_time} (${appt.timezone})`,
    `Assigned Agent: ${agentName || "Unassigned"}`,
    `Client: ${clientName}`,
    `Notes: ${appt.appointment_notes || "—"}`,
  ];
}

// The client-facing version of the same summary - sent to the client's
// own appointment_notification_emails recipients (see
// resolveAppointmentNotificationRecipients), so no internal CRM link,
// agent name, or client label (they already know who they are). Contact
// name, business name, email, phone, date, time, and notes only, per
// the brief's exact field list for this notification.
function buildClientAppointmentNotificationBody(appt: AppointmentForNotify, recipientName: string | null): string {
  return [
    `Hi ${recipientName || "there"},`,
    "",
    "A new appointment was just booked.",
    "",
    `Contact Name: ${appt.contact_name || "—"}`,
    `Business Name: ${appt.business_name}`,
    `Email: ${appt.email || "—"}`,
    `Phone: ${appt.phone || "—"}`,
    `Appointment Date: ${appt.appointment_date}`,
    `Appointment Time: ${appt.appointment_time} (${appt.timezone})`,
    `Notes: ${appt.appointment_notes || "—"}`,
    "",
    "This is an automatic notification from your CRM.",
  ].join("\n");
}

function buildCustomerConfirmationBody(appt: AppointmentForNotify, clientName: string): string {
  const lines = [
    `Hi ${appt.contact_name || "there"},`,
    "",
    `Your FREE 15-minute Business Growth Consultation with ${clientName} is confirmed.`,
    "",
    `Appointment Date: ${appt.appointment_date}`,
    `Appointment Time: ${appt.appointment_time} (${appt.timezone})`,
    `Meeting Type: ${appt.meeting_type}`,
  ];
  if (appt.meeting_link) lines.push(`Meeting Link: ${appt.meeting_link}`);
  lines.push("", "If you need to reschedule or have any questions, just reply to this email.", "", "We look forward to speaking with you!", "", "Best,", `${clientName} Team`);
  return lines.join("\n");
}

// Post-booking notifications for a newly booked consultation:
// 1. A confirmation email to the customer/prospect (when an email address
//    is on file).
// 2. An admin notification email to LEADGEN_ADMIN_NOTIFICATION_EMAIL
//    (defaults to info@winsalotcorp.com) - Winsalot's own internal ops
//    inbox, sent for every client's appointments alike, unrelated to any
//    particular client's own contacts.
// 3. An admin SMS to LEADGEN_ADMIN_SMS_NUMBER (defaults to
//    647-300-1270) via the existing Twilio integration (src/lib/twilio.ts).
// 4. An immediate notification email to this client's own
//    appointment_notification_emails recipients (see
//    resolveAppointmentNotificationRecipients in lib/leadgen-types.ts) -
//    e.g. Kelechi Amadi for Brent's Essentials, Vikas + Praveen for
//    Mantra Collab. Strictly scoped to the client actually connected to
//    this appointment, so one client's recipients can never receive
//    another's appointments.
// Uses Promise.allSettled so a failure in one channel never blocks the
// others, same pattern as the cleaning CRM's notifyAdminOfCustomerResponse
// (src/app/customer-quote/[token]/actions.ts). Shared by every source
// that can create a leadgen_appointments row (staff-booked in the admin
// and agent dashboards, the public /book/[slug] page, and the Calendly
// webhook at src/app/api/webhooks/calendly/route.ts).
//
// This function itself owns duplicate-prevention via admin_notified_at
// on the appointment row: it atomically claims the row (update ... where
// admin_notified_at is null) before sending anything, so a second call
// for the same appointment (e.g. a redelivered Calendly webhook) is a
// guaranteed no-op instead of a second round of emails/SMS to everyone.
//
// Always uses the service-role admin client (never a caller's
// session-scoped one): these are system-generated sends (sentBy: null)
// to the admin inbox, the client's own contacts, and the prospect, not
// the signed-in user's own send, and the leadgen_emails agent-insert RLS
// policy only allows an agent to insert a row attributed to themselves -
// it would reject these when called from the agent dashboard's booking
// flow.
export async function notifyOfNewLeadgenAppointment(
  appt: AppointmentForNotify,
  client: Pick<LeadgenClientRow, "id" | "name" | "contact_name" | "contact_email" | "appointment_notification_emails">,
  agentName: string | null
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: claimed } = await supabase
    .from("leadgen_appointments")
    .update({ admin_notified_at: new Date().toISOString() })
    .eq("id", appt.id)
    .is("admin_notified_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const adminEmail = process.env.LEADGEN_ADMIN_NOTIFICATION_EMAIL || "info@winsalotcorp.com";
  const adminSmsNumber = process.env.LEADGEN_ADMIN_SMS_NUMBER || "6473001270";
  const crmLink = `${getSiteUrl()}/leadgen/admin/appointments?highlight=${appt.id}`;

  const summaryText = [
    `New 15-minute consultation booked for ${client.name}.`,
    "",
    ...appointmentSummaryLines(appt, client.name, agentName),
    "",
    `Open in CRM: ${crmLink}`,
  ].join("\n");

  const tasks: Promise<unknown>[] = [
    sendLeadgenEmail(supabase, {
      clientId: client.id,
      leadId: appt.lead_id,
      appointmentId: appt.id,
      templateKey: null,
      toEmail: adminEmail,
      subject: `New Consultation Booked: ${appt.business_name} (${client.name})`,
      body: summaryText,
      sentBy: null,
      clientVisible: false,
    }),
    sendSmsToNumber(adminSmsNumber, summaryText.slice(0, 1500)),
  ];

  for (const recipient of resolveAppointmentNotificationRecipients(client)) {
    tasks.push(
      sendLeadgenEmail(supabase, {
        clientId: client.id,
        leadId: appt.lead_id,
        appointmentId: appt.id,
        templateKey: null,
        toEmail: recipient.email,
        toName: recipient.name,
        subject: `New Appointment Booked: ${appt.business_name}`,
        body: buildClientAppointmentNotificationBody(appt, recipient.name),
        sentBy: null,
        clientVisible: true,
      })
    );
  }

  if (appt.email) {
    tasks.push(
      sendLeadgenEmail(supabase, {
        clientId: client.id,
        leadId: appt.lead_id,
        appointmentId: appt.id,
        templateKey: null,
        toEmail: appt.email,
        toName: appt.contact_name,
        subject: `Your Consultation with ${client.name} is Confirmed`,
        body: buildCustomerConfirmationBody(appt, client.name),
        sentBy: null,
        clientVisible: false,
      }).then((result) => {
        if (result.error) {
          console.error("[leadgen] Failed to send customer appointment confirmation:", result.error);
        } else {
          return supabase.from("leadgen_appointments").update({ confirmation_sent: true }).eq("id", appt.id);
        }
      })
    );
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("[leadgen] Failed to send appointment notification:", result.reason);
    }
  });
}
