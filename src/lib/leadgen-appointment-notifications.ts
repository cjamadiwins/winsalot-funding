import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendLeadgenEmail } from "./leadgen-email";
import { sendSmsToNumber } from "./twilio";
import { getSiteUrl } from "./site-url";
import type { LeadgenAppointmentRow, LeadgenClientRow } from "./leadgen-types";

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
// (src/app/customer-quote/[token]/actions.ts). Shared by every source
// that can create a leadgen_appointments row (staff-booked, and now the
// Calendly webhook at src/app/api/webhooks/calendly/route.ts) - the
// caller is responsible for its own duplicate-notification guard
// (admin_notified_at on the appointment row).
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
