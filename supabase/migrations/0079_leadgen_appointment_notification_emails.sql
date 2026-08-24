-- Lets a Lead Generation CRM client have its own list of people who get
-- told about its appointments - both the immediate on-booking
-- notification and the existing 24-hour/1-hour business reminders
-- (leadgen_appointment_business_reminders, migration 0068) - instead of
-- both features being limited to a single contact_email address.
--
-- Nullable and additive only: a client with no value here keeps behaving
-- exactly as before (falls back to its single contact_email, handled in
-- application code via resolveAppointmentNotificationRecipients in
-- src/lib/leadgen-types.ts). Seeded here for the two clients that need
-- more than one recipient today - Brent's Essentials keeps its existing
-- single recipient (Kelechi Amadi, already its contact_email) explicit
-- in this list too so both notification types read from the same place,
-- and Mantra Collab gets its two named recipients, who have never had a
-- contact_email set at all (so today it receives zero client-facing
-- appointment notifications of any kind).
alter table public.leadgen_clients
  add column if not exists appointment_notification_emails text[];

update public.leadgen_clients
set appointment_notification_emails = array['kelechiamadi@hotmail.com'],
    updated_at = now()
where slug = 'brentsessentials'
  and appointment_notification_emails is null;

update public.leadgen_clients
set appointment_notification_emails = array['vikas@mantracollab.com', 'praveen@mantracollab.com'],
    updated_at = now()
where slug = 'mantra-collab'
  and appointment_notification_emails is null;
