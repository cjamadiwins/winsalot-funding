-- Global "Company SMS Notification Number" for the Growth CRM only
-- (src/lib/winsalot-consultation-book.ts / winsalot-consultation-reminders.ts).
-- Winsalot Corp receives an immediate SMS the moment a consultation is
-- booked through the Growth CRM, plus the existing 24-hour/1-hour
-- reminder SMS - all sent to this number without Winsalot Corp needing
-- to exist as a crm_clients record (crm_clients is for actual, billed
-- Growth CRM clients - see migration 0091 - and is untouched by this).
--
-- Lives on the existing winsalot_appointment_reminder_settings singleton
-- (migration 0126) rather than a new table, since that's already the
-- Growth CRM's one settings row for appointment-reminder SMS. Admin-
-- editable via /admin/crm/consultation-availability, the existing
-- admin-only settings page for this CRM's appointment/booking config.
--
-- Deliberately separate from process.env.ADMIN_PHONE_NUMBER, which stays
-- exactly as before for the Lead Gen CRM's own internal admin SMS - this
-- column only ever affects the Growth CRM's own appointment SMS.
alter table public.winsalot_appointment_reminder_settings
  add column if not exists company_sms_notification_number text;
