-- Widens crm_lead_emails_email_type_check to add 'appointment_confirmation',
-- for Growth CRM's manual "Resend Appointment Notification" button
-- (src/lib/winsalot-consultation-reminders.ts's sendManualWinsalotAppointmentEmail).
-- Same table, same Resend-webhook delivery-tracking pipeline the
-- automatic reminder job already writes to via 'appointment_reminder'
-- (migration 0123) - this only lets a resent confirmation be labeled
-- accurately instead of reusing that unrelated type.
alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_email_type_check;
alter table public.crm_lead_emails add constraint crm_lead_emails_email_type_check
  check (email_type in ('quote_request', 'follow_up', 'provider_intake', 'consultation_invite', 'appointment_reminder', 'appointment_confirmation'));
