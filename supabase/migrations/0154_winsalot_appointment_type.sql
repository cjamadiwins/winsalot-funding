-- Growth CRM: adds an explicit "appointment type" to winsalot_appointments,
-- separate from the existing service_type column (lead_generation /
-- business_financing / both_services, which describes what the
-- consultation is ABOUT, not its meeting format). Growth CRM has never
-- had a meeting-format concept before this - every confirmation/reminder
-- message has always unconditionally described the appointment as a
-- "phone call appointment" (see src/lib/appointment-sms.ts's
-- buildProspectReminderSms / buildAppointmentConfirmationSms), which is
-- exactly the one value seeded here.
--
-- Starts with a single allowed value ('Phone Call') rather than
-- pre-inventing others (e.g. the Lead Gen CRM's Video Call / In Person) -
-- nothing in this change asks for those, and the check constraint below
-- is a plain widen (drop/recreate) whenever a future type is actually
-- needed. service_type itself is completely untouched by this migration.
alter table public.winsalot_appointments
  add column if not exists appointment_type text not null default 'Phone Call'
  check (appointment_type in ('Phone Call'));
