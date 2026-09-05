-- Client/business-facing SMS notifications: the client/business contact on
-- a leadgen_clients record (e.g. Brent's Essentials, Mantra Collab, and
-- every client added after this migration) can now receive its own SMS
-- notifications about appointments booked for them - immediately on
-- booking, and again 24 hours and 1 hour before it - alongside (never
-- replacing) the existing prospect-facing SMS flow from migration 0125.
--
-- sms_notification_number is a single, admin-editable phone number per
-- client (distinct from contact_phone, the client's general contact
-- number, which is not necessarily the right number for automated
-- appointment texts). Null/blank means this client hasn't set one yet -
-- every send path (src/lib/leadgen-appointment-notifications.ts,
-- src/lib/leadgen-business-appointment-reminders.ts) skips the client SMS
-- gracefully in that case rather than failing the booking flow.
alter table public.leadgen_clients
  add column if not exists sms_notification_number text;

-- Extends the recipient_type check constraint added in migration 0125
-- ('prospect', 'admin') to also allow 'client'. The client/business
-- contact's SMS claim is a fully independent
-- (appointment_id, reminder_type, occurrence_key, recipient_type) row -
-- see the table's own unique constraint - so it can never collide with or
-- block the prospect/admin sends for the same appointment/occurrence.
-- winsalot_appointment_sms_reminders is intentionally left untouched: the
-- Growth CRM has no equivalent "client/business contact" concept for its
-- own consultations.
alter table public.leadgen_appointment_sms_reminders
  drop constraint if exists leadgen_appointment_sms_reminders_recipient_type_check;

alter table public.leadgen_appointment_sms_reminders
  add constraint leadgen_appointment_sms_reminders_recipient_type_check
  check (recipient_type in ('prospect', 'admin', 'client'));
