import "server-only";
import { getResendClient } from "./resend";
import { getEmailSender, getEmailReplyTo } from "./email-senders";
import { getLeadgenSenderEmail, getLeadgenReplyToEmail, buildLeadgenBookingEmailHtml } from "./leadgen-email";
import { buildAppointmentEmailBody } from "./leadgen-appointment-emails";
import { buildWinsalotConfirmationEmail, buildWinsalotReminderEmail } from "./winsalot-consultation-emails";
import { buildInvoiceSentEmail, buildInvoiceReminderEmail, buildInvoiceReceiptEmail } from "./crm-invoice-emails";
import { getDefaultProspectEmailTemplate, buildProspectEmailHtml, buildProspectEmailText } from "./prospect-email-templates";
import { renderLeadgenTemplate, LEADGEN_BOOKING_BUTTON_LABEL, LEADGEN_CONSULTATION_CTA_LABEL, type LeadgenAppointmentRow, type LeadgenEmailTemplateRow } from "./leadgen-types";

// Admin-only "Send Test Email" function (brief item 8): lets an admin see
// exactly what a real send would look like in their own inbox before it
// ever reaches a client or prospect, for every email type this
// deliverability pass touched. Every send here uses obviously fake
// sample data (never a real opportunity/lead/invoice row) and a
// "[TEST] " subject prefix, and none of it writes to crm_lead_emails/
// leadgen_emails/crm_invoice_emails or any other tracking table - a test
// send has nothing real to track. Split into two entry points
// (sendCrmTestEmail / sendLeadgenTestEmail) matching the two separate
// admin auth boundaries (requireCrmAdmin vs requireLeadgenAdmin) - see
// the two "Send Test Email" pages that call these.

const SAMPLE_BOOKING_URL = "https://example.com/test-booking-link";

function testSubject(subject: string): string {
  return `[TEST] ${subject}`;
}

// ---------------------------------------------------------------------
// Growth CRM (crm_* tables): invoices, the Winsalot consultation-booking
// appointment emails, and the crm_opportunities prospect consultation-
// invite email (src/lib/prospect-email-templates.ts).
// ---------------------------------------------------------------------

export const CRM_TEST_EMAIL_TYPES = [
  { id: "invoice_sent", label: "Invoice - Sent" },
  { id: "invoice_reminder", label: "Invoice - Payment Reminder" },
  { id: "invoice_receipt", label: "Invoice - Payment Receipt" },
  { id: "appointment_confirmed", label: "Appointment - Confirmed" },
  { id: "appointment_reminder_24h", label: "Appointment - 24-Hour Reminder" },
  { id: "appointment_reminder_1h", label: "Appointment - 1-Hour Reminder" },
  { id: "prospect_consultation_invite", label: "Prospect - Consultation Invitation" },
] as const;

export type CrmTestEmailType = (typeof CRM_TEST_EMAIL_TYPES)[number]["id"];

const SAMPLE_INVOICE = {
  invoice_number: "INV-TEST-0001",
  service_period_start: "2026-08-01",
  service_period_end: "2026-08-31",
  balance: 750,
  total: 750,
  amount_paid: 0,
  currency: "CAD",
  due_date: "2026-09-15",
  payment_instructions: "E-Transfer to billing@winsalotcorp.com",
};

const SAMPLE_PAYMENT = {
  amount: 750,
  currency: "CAD",
  payment_date: "2026-08-20",
  payment_method: "e_transfer" as const,
  reference_number: "TEST-REF-123",
};

const SAMPLE_APPOINTMENT_PARAMS = {
  contactName: "Jordan Sample",
  businessName: "Acme Test Co.",
  serviceType: "lead_generation" as const,
  startUtcIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  timezone: "America/Toronto",
  rescheduleUrl: "https://example.com/test-reschedule",
  cancelUrl: "https://example.com/test-cancel",
};

export async function sendCrmTestEmail(type: CrmTestEmailType, toEmail: string): Promise<{ error?: string }> {
  let email: { subject: string; text: string; html: string };
  let from: string;

  switch (type) {
    case "invoice_sent":
      email = buildInvoiceSentEmail(SAMPLE_INVOICE, "Sample Client Inc.");
      from = getEmailSender("billing");
      break;
    case "invoice_reminder":
      email = buildInvoiceReminderEmail({ ...SAMPLE_INVOICE, amount_paid: 200, balance: 550 }, "Sample Client Inc.");
      from = getEmailSender("billing");
      break;
    case "invoice_receipt":
      email = buildInvoiceReceiptEmail({ ...SAMPLE_INVOICE, balance: 0 }, "Sample Client Inc.", SAMPLE_PAYMENT);
      from = getEmailSender("billing");
      break;
    case "appointment_confirmed":
      email = buildWinsalotConfirmationEmail(SAMPLE_APPOINTMENT_PARAMS);
      from = getEmailSender("growth");
      break;
    case "appointment_reminder_24h":
      email = buildWinsalotReminderEmail({ ...SAMPLE_APPOINTMENT_PARAMS, reminderType: "24_hour_reminder" });
      from = getEmailSender("growth");
      break;
    case "appointment_reminder_1h":
      email = buildWinsalotReminderEmail({ ...SAMPLE_APPOINTMENT_PARAMS, reminderType: "1_hour_reminder" });
      from = getEmailSender("growth");
      break;
    case "prospect_consultation_invite": {
      const defaults = getDefaultProspectEmailTemplate("lead_generation", {
        businessName: "Acme Test Co.",
        contactName: "Jordan Sample",
        agentName: "Alex Agent",
      });
      email = {
        subject: defaults.subject,
        text: buildProspectEmailText({ message: defaults.message, ctaText: defaults.ctaText, bookingUrl: SAMPLE_BOOKING_URL }),
        html: buildProspectEmailHtml({ message: defaults.message, ctaText: defaults.ctaText, bookingUrl: SAMPLE_BOOKING_URL }),
      };
      from = getEmailSender("growth");
      break;
    }
  }

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from,
    to: toEmail,
    replyTo: getEmailReplyTo(),
    subject: testSubject(email.subject),
    text: email.text,
    html: email.html,
  });

  if (error) return { error: error.message };
  return {};
}

// ---------------------------------------------------------------------
// Lead Generation CRM (leadgen_* tables): Brent's Essentials/Mantra
// Collab initial outreach + the leadgen appointment emails. The two
// outreach templates are read live from leadgen_email_templates so a
// test send always reflects whatever an admin has saved there, exactly
// like a real send would.
// ---------------------------------------------------------------------

export const LEADGEN_TEST_EMAIL_TYPES = [
  { id: "consultation_invitation", label: "Brent's Essentials - Initial Outreach" },
  { id: "mantra_collab_intro", label: "Mantra Collab - Initial Outreach" },
  { id: "appointment_confirmed", label: "Appointment - Confirmed" },
  { id: "appointment_reminder", label: "Appointment - Reminder" },
] as const;

export type LeadgenTestEmailType = (typeof LEADGEN_TEST_EMAIL_TYPES)[number]["id"];

type TemplateFetcher = (key: string) => Promise<Pick<LeadgenEmailTemplateRow, "subject" | "body"> | null>;

const SAMPLE_LEADGEN_APPOINTMENT = {
  business_name: "Acme Test Co.",
  appointment_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  appointment_time: "14:00:00",
  timezone: "America/Toronto",
  meeting_type: "Phone Call",
  meeting_link: null,
  appointment_notes: "This is a sample test send - no real appointment exists.",
} as unknown as LeadgenAppointmentRow;

export async function sendLeadgenTestEmail(fetchTemplate: TemplateFetcher, type: LeadgenTestEmailType, toEmail: string): Promise<{ error?: string }> {
  let subject: string;
  let html: string;
  let text: string;

  if (type === "consultation_invitation" || type === "mantra_collab_intro") {
    const template = await fetchTemplate(type);
    const vars = {
      first_name: "Jordan",
      business_name: "Acme Test Co.",
      client_business_name: type === "mantra_collab_intro" ? "Mantra Collab" : "Brent's Essentials",
      booking_section: `[${type === "mantra_collab_intro" ? LEADGEN_CONSULTATION_CTA_LABEL : LEADGEN_BOOKING_BUTTON_LABEL}]\n\n${SAMPLE_BOOKING_URL}`,
    };
    if (!template) return { error: "This email template could not be found. Save it once from the Templates page, then try again." };
    subject = renderLeadgenTemplate(template.subject, vars);
    const body = renderLeadgenTemplate(template.body, vars);
    text = body;
    html = buildLeadgenBookingEmailHtml(body, [{ url: SAMPLE_BOOKING_URL, label: vars.client_business_name === "Mantra Collab" ? LEADGEN_CONSULTATION_CTA_LABEL : LEADGEN_BOOKING_BUTTON_LABEL, style: "booking" }]);
  } else {
    const kind = type === "appointment_confirmed" ? "resend_confirmation" : "reminder";
    subject = kind === "reminder" ? "Reminder: Your Upcoming Consultation with Sample Client Inc." : "Your Consultation with Sample Client Inc. is Confirmed";
    text = buildAppointmentEmailBody(SAMPLE_LEADGEN_APPOINTMENT, "Jordan Sample", "Acme Test Co.", "Sample Client Inc.", kind);
    html = `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</div>`;
  }

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getLeadgenSenderEmail(),
    to: toEmail,
    replyTo: getLeadgenReplyToEmail(),
    subject: testSubject(subject),
    text,
    html,
  });

  if (error) return { error: error.message };
  return {};
}
