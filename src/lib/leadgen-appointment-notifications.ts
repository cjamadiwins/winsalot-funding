import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "crypto";
import { sendLeadgenEmail } from "./leadgen-email";
import { sendSmsToNumber } from "./twilio";
import { getSiteUrl } from "./site-url";
import type { LeadgenAppointmentRow, LeadgenClientRow } from "./leadgen-types";

// Reuses the exact hashing scheme already used for the cleaning CRM's
// provider/customer quote links (src/lib/tokens.ts) - only the raw token
// is ever sent to a prospect (in the confirmation email); only its hash
// is stored, in the new leadgen_appointment_tokens table.
export function generateLeadgenAppointmentToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashLeadgenAppointmentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Creates a reschedule/cancel link for a freshly booked appointment,
// valid for 90 days - generous enough to cover rescheduling well after
// the original date if needed.
export async function createLeadgenAppointmentManageLink(supabase: SupabaseClient, appointmentId: string): Promise<string> {
  const token = generateLeadgenAppointmentToken();
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from("leadgen_appointment_tokens").insert({
    appointment_id: appointmentId,
    token_hash: hashLeadgenAppointmentToken(token),
    expires_at: expiresAt,
  });

  return `${getSiteUrl()}/leadgen/appointment/${token}`;
}

function appointmentSummaryLines(
  appt: Pick<LeadgenAppointmentRow, "id" | "contact_name" | "business_name" | "email" | "phone" | "appointment_date" | "appointment_time" | "timezone">,
  clientName: string,
  agentName: string | null
): string[] {
  return [
    `Prospect: ${appt.contact_name || "—"}`,
    `Business: ${appt.business_name}`,
    `Email: ${appt.email || "—"}`,
    `Phone: ${appt.phone || "—"}`,
    `Appointment Date: ${appt.appointment_date}`,
    `Appointment Time: ${appt.appointment_time} (${appt.timezone})`,
    `Assigned Agent: ${agentName || "Unassigned"}`,
    `Client: ${clientName}`,
  ];
}

// Admin notification for a newly booked consultation - email to
// LEADGEN_ADMIN_NOTIFICATION_EMAIL (defaults to info@winsalotcorp.com)
// and SMS to LEADGEN_ADMIN_SMS_NUMBER (defaults to 647-300-1270) via the
// existing Twilio integration (src/lib/twilio.ts). Uses
// Promise.allSettled so a failure in one channel never blocks the
// other, same pattern as the cleaning CRM's notifyAdminOfCustomerResponse
// (src/app/customer-quote/[token]/actions.ts).
export async function notifyAdminOfNewLeadgenAppointment(
  supabase: SupabaseClient,
  appt: LeadgenAppointmentRow,
  client: Pick<LeadgenClientRow, "id" | "name">,
  agentName: string | null
): Promise<void> {
  const adminEmail = process.env.LEADGEN_ADMIN_NOTIFICATION_EMAIL || "info@winsalotcorp.com";
  const adminSmsNumber = process.env.LEADGEN_ADMIN_SMS_NUMBER || "6473001270";
  const crmLink = `${getSiteUrl()}/leadgen/admin/appointments?highlight=${appt.id}`;

  const text = [
    `New 15-minute consultation booked for ${client.name}.`,
    "",
    ...appointmentSummaryLines(appt, client.name, agentName),
    "",
    `Open in CRM: ${crmLink}`,
  ].join("\n");

  const results = await Promise.allSettled([
    sendLeadgenEmail(supabase, {
      clientId: client.id,
      leadId: appt.lead_id,
      appointmentId: appt.id,
      templateKey: null,
      toEmail: adminEmail,
      subject: `New Consultation Booked: ${appt.business_name} (${client.name})`,
      body: text,
      sentBy: null,
      clientVisible: false,
    }),
    sendSmsToNumber(adminSmsNumber, text.slice(0, 1500)),
  ]);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("[leadgen] Failed to send admin appointment notification:", result.reason);
    }
  });
}

// Prospect-facing confirmation - includes the reschedule/cancel link.
// Silently does nothing if the appointment has no email on file (the
// booking form requires one, but this stays defensive for the
// staff-booked path, where email is optional).
export async function sendLeadgenBookingConfirmation(
  supabase: SupabaseClient,
  appt: LeadgenAppointmentRow,
  client: Pick<LeadgenClientRow, "id" | "name">,
  manageUrl: string
): Promise<void> {
  if (!appt.email) return;

  const firstName = (appt.contact_name || appt.business_name).split(" ")[0];
  const body = [
    `Hi ${firstName},`,
    "",
    `Your free 15-minute consultation with ${client.name} is confirmed for:`,
    "",
    `${appt.appointment_date} at ${appt.appointment_time} (${appt.timezone})`,
    "",
    "Need to make a change? You can reschedule or cancel here:",
    manageUrl,
    "",
    "We look forward to speaking with you.",
    "",
    "Best regards,",
    "",
    "Winsalot Corp",
    `on behalf of ${client.name}`,
  ].join("\n");

  await sendLeadgenEmail(supabase, {
    clientId: client.id,
    leadId: appt.lead_id,
    appointmentId: appt.id,
    templateKey: null,
    toEmail: appt.email,
    toName: appt.contact_name,
    subject: `Your Consultation is Confirmed - ${client.name}`,
    body,
    sentBy: null,
    clientVisible: false,
  });
}
