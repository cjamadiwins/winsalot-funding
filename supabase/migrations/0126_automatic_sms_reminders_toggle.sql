-- Dedicated "automatic SMS reminders" toggle, fully independent of the
-- existing automatic_reminders_enabled (email) toggle on both CRMs. SMS
-- (migration 0125) previously rode inside the same automatic-reminder
-- jobs as email with no gate of its own on the Lead Gen side
-- (automatic_reminders_enabled, already true in production for the live
-- email reminders) and with NO gate at all on the Growth CRM side
-- (runWinsalotAppointmentReminderJob has never read a settings row -
-- email there has always been unconditionally on whenever its cron route
-- is invoked). That meant merging SMS support could never be deployed
-- to production with SMS actually held back, since flipping it off would
-- also have had to disable the already-live email reminders.
--
-- This migration adds a real "SMS off" switch, defaulting to false
-- everywhere, so SMS can be merged and deployed while staying fully
-- inert until an admin explicitly turns it on - email is completely
-- unaffected on both CRMs.

alter table public.leadgen_appointment_reminder_settings
  add column if not exists automatic_sms_reminders_enabled boolean not null default false;

-- ---------------------------------------------------------------------
-- winsalot_appointment_reminder_settings: new dedicated singleton (same
-- convention as leadgen_appointment_reminder_settings /
-- winsalot_appointment_availability_settings) - the Growth CRM's
-- reminder job has never had a settings row of its own, so this is a
-- fresh table rather than reusing winsalot_appointment_availability_settings
-- (which controls the public booking page's offered schedule, a
-- different concern). Holds only the SMS toggle for now; email stays
-- unconditional, unchanged.
-- ---------------------------------------------------------------------
create table if not exists public.winsalot_appointment_reminder_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000202'::uuid
    check (id = '00000000-0000-0000-0000-000000000202'::uuid),
  automatic_sms_reminders_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_name text
);

insert into public.winsalot_appointment_reminder_settings (id) values ('00000000-0000-0000-0000-000000000202'::uuid)
on conflict (id) do nothing;

alter table public.winsalot_appointment_reminder_settings enable row level security;

create policy "winsalot_appointment_reminder_settings_admin_all"
  on public.winsalot_appointment_reminder_settings for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "winsalot_appointment_reminder_settings_agent_select"
  on public.winsalot_appointment_reminder_settings for select
  using (public.crm_user_role(auth.uid()) = 'agent');
