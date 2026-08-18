-- Lead Generation CRM: automatic 24-hour appointment reminders.
--
-- leadgen_appointment_reminders is the reminder-log/dedup table (brief
-- "DUPLICATE PREVENTION"). A row is only ever inserted at the moment a
-- send is actually claimed (by the cron job, or by an admin explicitly
-- choosing "Count this as the 24-hour reminder" on a manual send) - there
-- is no pre-existing "scheduled" row before that; the UI derives a
-- "Scheduled" label itself from the *absence* of a row for an eligible,
-- still-future appointment (see lib/leadgen-appointment-reminders.ts).
--
-- The unique constraint is on (appointment_id, reminder_type,
-- occurrence_key) rather than bare (appointment_id, reminder_type):
-- occurrence_key is the appointment's own date+time at claim time, so a
-- reschedule naturally gets a fresh occurrence_key and is eligible for
-- its own new reminder, while every prior occurrence's row (and its
-- send history) is preserved untouched - "an appointment
-- occurrence/version identifier" per the brief, without adding a version
-- counter column to leadgen_appointments itself.
--
-- Delivered/Bounced status is deliberately NOT tracked as a separate
-- column here - it already flows into leadgen_emails.status via the
-- existing Resend webhook (src/app/api/webhooks/resend/route.ts) once
-- email_id below is set, and duplicating it here would just be a second
-- copy that could drift. This table's own `status` only tracks the
-- claim/send lifecycle (sending -> sent | failed); the UI joins through
-- email_id for the richer Sent/Delivered/Bounced/Failed picture, exactly
-- like the existing "Last appointment email" badge (AppointmentEmailActions)
-- already does for the manual resend/reminder buttons.

create table if not exists public.leadgen_appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  appointment_id uuid not null references public.leadgen_appointments(id) on delete cascade,
  lead_id uuid references public.leadgen_leads(id) on delete set null,
  reminder_type text not null default '24_hour_reminder' check (reminder_type in ('24_hour_reminder')),
  occurrence_key text not null,
  scheduled_appointment_at timestamptz not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  recipient_email text,
  email_id uuid references public.leadgen_emails(id) on delete set null,
  resend_message_id text,
  error_detail text,
  attempt_count integer not null default 0,
  sent_at timestamptz,
  -- 'automatic' = the cron job claimed and sent it. 'manual' = an admin
  -- explicitly chose "Count this as the 24-hour reminder" on a manual
  -- Send Appointment Reminder (brief MANUAL CONTROLS: "must not prevent
  -- the scheduled 24-hour reminder unless the administrator explicitly
  -- chooses...").
  source text not null default 'automatic' check (source in ('automatic', 'manual')),
  created_by uuid references auth.users(id) on delete set null,
  unique (appointment_id, reminder_type, occurrence_key)
);

create index if not exists leadgen_appointment_reminders_lead_idx on public.leadgen_appointment_reminders(lead_id);
create index if not exists leadgen_appointment_reminders_appointment_idx on public.leadgen_appointment_reminders(appointment_id);

alter table public.leadgen_appointment_reminders enable row level security;

create policy "leadgen_appointment_reminders_admin_all"
  on public.leadgen_appointment_reminders for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- Agents may see the reminder status for a lead assigned to them (brief:
-- "Make this visible to administrators and the assigned agent") - never
-- write, since claiming/sending always happens through the cron job's
-- service-role client or an admin-only manual action.
create policy "leadgen_appointment_reminders_agent_select_own"
  on public.leadgen_appointment_reminders for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and lead_id is not null
    and exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- leadgen_appointment_reminder_settings: one configurable singleton row
-- (brief "ADMIN SETTINGS"), same convention as winsalot_incentive_settings
-- (migration 0059) - a fixed-id row, admin read/write via RLS, updated
-- in place rather than versioned.
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_appointment_reminder_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000101'::uuid
    check (id = '00000000-0000-0000-0000-000000000101'::uuid),
  -- Off by default - the brief asks to default this On only "after
  -- testing is completed," which is an explicit admin action once this
  -- feature has been reviewed, not something this migration should
  -- presume on deploy.
  automatic_reminders_enabled boolean not null default false,
  reminder_hours_before integer not null default 24 check (reminder_hours_before > 0),
  sender_name text not null default 'Winsalot Corp.',
  reply_to_email text not null default 'info@winsalotcorp.com',
  updated_at timestamptz not null default now(),
  updated_by_name text
);

insert into public.leadgen_appointment_reminder_settings (id) values ('00000000-0000-0000-0000-000000000101'::uuid)
on conflict (id) do nothing;

alter table public.leadgen_appointment_reminder_settings enable row level security;

create policy "leadgen_appointment_reminder_settings_admin_all"
  on public.leadgen_appointment_reminder_settings for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- Agents need to read whether automatic reminders are on (and the
-- configured hours-before) to correctly compute the "Scheduled" vs "Not
-- scheduled" label on their own Appointments/Lead Detail pages
-- (fetchLeadgenAppointmentReminderStatusMap) - read-only, same
-- convention as winsalot_incentive_settings_agent_select.
create policy "leadgen_appointment_reminder_settings_agent_select"
  on public.leadgen_appointment_reminder_settings for select
  using (public.leadgen_user_role(auth.uid()) = 'agent');

-- Distinct activity-timeline entry for an automatically-sent reminder
-- (brief: "Add the reminder to the lead's activity log with: 'Automatic
-- 24-hour appointment reminder'") - kept separate from the existing
-- manually-triggered 'appointment_reminder_sent' (migration 0066) so the
-- timeline can tell the two apart at a glance. Purely additive, same
-- pattern as migrations 0032/0066.
alter table public.leadgen_lead_activities
  drop constraint leadgen_lead_activities_activity_type_check;

alter table public.leadgen_lead_activities
  add constraint leadgen_lead_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'note', 'status_change', 'lead_assigned', 'lead_reassigned',
    'follow_up_scheduled', 'follow_up_completed', 'appointment_booked',
    'appointment_updated', 'consultation_email_sent',
    'consultation_invitation_sent', 'consultation_follow_up_sent',
    'appointment_confirmation_resent', 'appointment_reminder_sent',
    'appointment_reminder_auto_sent'
  ));
