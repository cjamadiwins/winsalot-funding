import "server-only";
import { getResendClient } from "./resend";
import { getSupabaseAdmin } from "./supabase-admin";
import { getSiteUrl } from "./site-url";
import { createWinsalotActionToken } from "./winsalot-consultation-tokens";
import {
  buildWinsalotCancellationEmail,
  buildWinsalotConfirmationEmail,
  buildWinsalotInternalBookingNotification,
  buildWinsalotRescheduleEmail,
} from "./winsalot-consultation-emails";
import type { WinsalotAppointmentRow } from "./winsalot-consultation-types";

// Post-booking/reschedule/cancellation notifications for the Winsalot
// consultation-booking system. Same fan-out shape as the Lead Gen CRM's
// notifyOfNewLeadgenAppointment (src/lib/leadgen-appointment-notifications.ts)
// - Promise.allSettled so one channel's failure never blocks another,
// claim-once via admin_notified_at so a redelivered call is a no-op - but
// a fully independent implementation, its own recipients, and its own
// email templates.

const FROM_EMAIL = () => process.env.EMAIL_FROM || "Winsalot Corp <info@winsalotcorp.com>";
const REPLY_TO_EMAIL = () => process.env.EMAIL_REPLY_TO || "info@winsalotcorp.com";
const ADMIN_NOTIFICATION_EMAIL = () => process.env.NOTIFICATION_EMAIL || "info@winsalotcorp.com";

async function sendEmail(to: string, subject: string, text: string, html: string): Promise<{ error?: string }> {
  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: FROM_EMAIL(),
    to,
    replyTo: REPLY_TO_EMAIL(),
    subject,
    text,
    html,
  });
  if (error) return { error: error.message };
  return {};
}

async function resolveAssignedAgent(appointment: Pick<WinsalotAppointmentRow, "assigned_agent_id">) {
  if (!appointment.assigned_agent_id) return null;
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("crm_users").select("full_name, email").eq("id", appointment.assigned_agent_id).maybeSingle();
  return data as { full_name: string; email: string } | null;
}

// Fires immediately after a consultation is successfully booked (agent-
// booked or self-booked alike). Claims the row via admin_notified_at
// before sending anything, so a retried booking action can never send a
// second round of emails.
export async function notifyOfNewWinsalotAppointment(appointment: WinsalotAppointmentRow, bookedBy: "agent" | "self"): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: claimed } = await admin
    .from("winsalot_appointments")
    .update({ admin_notified_at: new Date().toISOString() })
    .eq("id", appointment.id)
    .is("admin_notified_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const assignedAgent = await resolveAssignedAgent(appointment);
  const crmLink = `${getSiteUrl()}/admin/crm/appointments?highlight=${appointment.id}`;

  const tasks: Promise<unknown>[] = [];

  // Prospect confirmation, with fresh reschedule/cancel links.
  const rescheduleToken = await createWinsalotActionToken("reschedule", appointment.id);
  const cancelToken = await createWinsalotActionToken("cancel", appointment.id);
  const confirmation = buildWinsalotConfirmationEmail({
    contactName: appointment.contact_name,
    businessName: appointment.business_name,
    serviceType: appointment.service_type,
    startUtcIso: appointment.appointment_start_at,
    timezone: appointment.prospect_timezone || appointment.business_timezone,
    rescheduleUrl: `${getSiteUrl()}/book-consultation/reschedule/${rescheduleToken}`,
    cancelUrl: `${getSiteUrl()}/book-consultation/cancel/${cancelToken}`,
  });
  tasks.push(sendEmail(appointment.email, confirmation.subject, confirmation.text, confirmation.html));

  // Assigned agent notification.
  if (assignedAgent?.email) {
    const agentNotification = buildWinsalotInternalBookingNotification({
      contactName: appointment.contact_name,
      businessName: appointment.business_name,
      serviceType: appointment.service_type,
      startUtcIso: appointment.appointment_start_at,
      timezone: appointment.business_timezone,
      recipientName: assignedAgent.full_name,
      assignedAgentName: assignedAgent.full_name,
      crmLink,
      bookedBy,
    });
    tasks.push(sendEmail(assignedAgent.email, agentNotification.subject, agentNotification.text, agentNotification.html));
  }

  // Winsalot admin notification.
  const adminNotification = buildWinsalotInternalBookingNotification({
    contactName: appointment.contact_name,
    businessName: appointment.business_name,
    serviceType: appointment.service_type,
    startUtcIso: appointment.appointment_start_at,
    timezone: appointment.business_timezone,
    recipientName: null,
    assignedAgentName: assignedAgent?.full_name ?? null,
    crmLink,
    bookedBy,
  });
  tasks.push(sendEmail(ADMIN_NOTIFICATION_EMAIL(), adminNotification.subject, adminNotification.text, adminNotification.html));

  const results = await Promise.allSettled(tasks);
  results.forEach((result) => {
    if (result.status === "rejected" || (result.status === "fulfilled" && (result.value as { error?: string })?.error)) {
      console.error("[winsalot-consultations] failed to send a booking notification:", result);
    }
  });
}

// "Rescheduling must notify the prospect."
export async function notifyOfWinsalotReschedule(appointment: WinsalotAppointmentRow): Promise<void> {
  const rescheduleToken = await createWinsalotActionToken("reschedule", appointment.id);
  const cancelToken = await createWinsalotActionToken("cancel", appointment.id);

  const email = buildWinsalotRescheduleEmail({
    contactName: appointment.contact_name,
    businessName: appointment.business_name,
    serviceType: appointment.service_type,
    startUtcIso: appointment.appointment_start_at,
    timezone: appointment.prospect_timezone || appointment.business_timezone,
    rescheduleUrl: `${getSiteUrl()}/book-consultation/reschedule/${rescheduleToken}`,
    cancelUrl: `${getSiteUrl()}/book-consultation/cancel/${cancelToken}`,
  });

  const result = await sendEmail(appointment.email, email.subject, email.text, email.html);
  if (result.error) console.error("[winsalot-consultations] failed to send reschedule notification:", result.error);
}

export async function notifyOfWinsalotCancellation(appointment: WinsalotAppointmentRow): Promise<void> {
  const email = buildWinsalotCancellationEmail({
    contactName: appointment.contact_name,
    businessName: appointment.business_name,
    startUtcIso: appointment.appointment_start_at,
    timezone: appointment.prospect_timezone || appointment.business_timezone,
  });

  const result = await sendEmail(appointment.email, email.subject, email.text, email.html);
  if (result.error) console.error("[winsalot-consultations] failed to send cancellation notification:", result.error);
}
