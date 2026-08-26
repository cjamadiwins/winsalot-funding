-- Winsalot Growth CRM: consultation-booking system.
--
-- A completely separate system from the Lead Gen CRM's built-in booking
-- page (/book/[slug], leadgen_appointments) - it reuses that system's
-- proven ARCHITECTURE (a fixed-duration slot generator, a public
-- unauthenticated booking page backed by the service-role client, a
-- unique-active-slot database constraint, a pg_cron/pg_net-driven
-- reminder job with an occurrence-key dedup table) but every table,
-- route, email template, and cron secret here is brand new and entirely
-- independent - nothing in this migration touches leadgen_* or crm_leads.
--
-- New public booking page: /book-consultation (growth.winsalotcorp.com).
-- New admin-only settings page: /admin/crm/consultation-availability.
-- New appointment views: /admin/crm/appointments, /agent/appointments.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- winsalot_appointment_availability_settings: one configurable singleton
-- row (same convention as leadgen_appointment_reminder_settings /
-- winsalot_incentive_settings) controlling the public booking page's
-- offered schedule.
-- ---------------------------------------------------------------------
create table if not exists public.winsalot_appointment_availability_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000201'::uuid
    check (id = '00000000-0000-0000-0000-000000000201'::uuid),
  -- 0 = Sunday .. 6 = Saturday (JS Date#getDay convention).
  available_weekdays integer[] not null default '{1,2,3,4,5}',
  business_start_time time not null default '09:00',
  business_end_time time not null default '17:00',
  -- Eastern Time is the default business timezone per the brief; kept
  -- admin-editable rather than hardcoded in case Winsalot's own hours
  -- ever move, but every appointment's stored UTC instant is unaffected
  -- either way.
  business_timezone text not null default 'America/Toronto',
  min_notice_minutes integer not null default 120 check (min_notice_minutes >= 0),
  max_advance_days integer not null default 30 check (max_advance_days > 0),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),
  updated_at timestamptz not null default now(),
  updated_by_name text
);

insert into public.winsalot_appointment_availability_settings (id)
values ('00000000-0000-0000-0000-000000000201'::uuid)
on conflict (id) do nothing;

alter table public.winsalot_appointment_availability_settings enable row level security;

create policy "winsalot_availability_settings_admin_all"
  on public.winsalot_appointment_availability_settings for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Agents need to read the configured schedule to render the same slot
-- picker on their own "Book Consultation" action.
create policy "winsalot_availability_settings_agent_select"
  on public.winsalot_appointment_availability_settings for select
  using (public.crm_user_role(auth.uid()) = 'agent');

-- ---------------------------------------------------------------------
-- winsalot_appointment_blackouts: admin-configured "blocked dates" and
-- "unavailable time periods" - both are just a UTC [start_at, end_at)
-- window that the slot generator excludes; a "blocked date" is simply a
-- window covering the whole business day in business_timezone.
-- ---------------------------------------------------------------------
create table if not exists public.winsalot_appointment_blackouts (
  id uuid primary key default gen_random_uuid(),
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  reason text,
  created_by uuid references public.crm_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists winsalot_appointment_blackouts_range_idx
  on public.winsalot_appointment_blackouts(start_at, end_at);

alter table public.winsalot_appointment_blackouts enable row level security;

create policy "winsalot_blackouts_admin_all"
  on public.winsalot_appointment_blackouts for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "winsalot_blackouts_agent_select"
  on public.winsalot_appointment_blackouts for select
  using (public.crm_user_role(auth.uid()) = 'agent');

-- ---------------------------------------------------------------------
-- winsalot_appointments: the consultation itself. 15-minute fixed
-- duration (enforced in application code, not a column, since it's a
-- fixed rule per the brief rather than an admin setting).
-- ---------------------------------------------------------------------
create table if not exists public.winsalot_appointments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  opportunity_id uuid references public.crm_opportunities(id) on delete set null,

  contact_name text not null,
  business_name text not null,
  email text not null,
  phone text not null,
  service_type text not null check (service_type in ('lead_generation', 'business_financing', 'both_services')),
  notes text,

  -- The one true schedule fields - always UTC. Every slot/availability/
  -- overlap check in application code and at the database level operates
  -- on these two columns.
  appointment_start_at timestamptz not null,
  appointment_end_at timestamptz not null check (appointment_end_at > appointment_start_at),

  -- Display-only context, never used for scheduling logic: the
  -- prospect's own local timezone at booking time (best-effort, from the
  -- browser), and the business timezone the slot was offered in.
  prospect_timezone text,
  business_timezone text not null default 'America/Toronto',

  status text not null default 'booked' check (status in ('booked', 'cancelled')),

  booked_by text not null check (booked_by in ('agent', 'self')),
  booked_by_user_id uuid references public.crm_users(id) on delete set null,
  assigned_agent_id uuid references public.crm_users(id) on delete set null,

  cancelled_at timestamptz,
  cancelled_by_role text check (cancelled_by_role in ('admin', 'agent', 'prospect')),
  cancelled_by_user_id uuid references public.crm_users(id) on delete set null,
  cancelled_reason text,

  admin_notified_at timestamptz
);

create index if not exists winsalot_appointments_opportunity_idx on public.winsalot_appointments(opportunity_id);
create index if not exists winsalot_appointments_assigned_agent_idx on public.winsalot_appointments(assigned_agent_id);
create index if not exists winsalot_appointments_start_idx on public.winsalot_appointments(appointment_start_at);

-- "Do not allow two active appointments in the same time slot. Enforce
-- this at the database level, not only in the interface." An exclusion
-- constraint over the appointment's own [start, end) range rejects ANY
-- overlap between two active ('booked') appointments - not just an
-- exact-same-start collision - so it also backstops the admin-configured
-- buffer time if application code ever miscalculates it. Cancelled
-- appointments are excluded so a freed-up slot can be rebooked.
alter table public.winsalot_appointments
  add constraint winsalot_appointments_no_overlap
  exclude using gist (
    tstzrange(appointment_start_at, appointment_end_at, '[)') with &&
  ) where (status <> 'cancelled');

alter table public.winsalot_appointments enable row level security;

create policy "winsalot_appointments_admin_all"
  on public.winsalot_appointments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "winsalot_appointments_agent_select_own"
  on public.winsalot_appointments for select
  using (public.crm_user_role(auth.uid()) = 'agent' and assigned_agent_id = auth.uid());

create policy "winsalot_appointments_agent_update_own"
  on public.winsalot_appointments for update
  using (public.crm_user_role(auth.uid()) = 'agent' and assigned_agent_id = auth.uid())
  with check (public.crm_user_role(auth.uid()) = 'agent' and assigned_agent_id = auth.uid());

-- Agents may book a consultation for their own prospect from the
-- opportunity detail page - always attributed to themselves, never
-- assigned to someone else via this policy (the public self-booking path
-- and the admin's on-behalf-of booking both go through the service-role
-- client instead, same pattern as leadgen_appointments' public booking
-- action and Calendly webhook).
create policy "winsalot_appointments_agent_insert_own"
  on public.winsalot_appointments for insert
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and booked_by = 'agent'
    and booked_by_user_id = auth.uid()
    and assigned_agent_id = auth.uid()
  );

-- ---------------------------------------------------------------------
-- winsalot_appointment_tokens: secure, single-purpose tokens - never a
-- raw crm_opportunities/winsalot_appointments id exposed to a public
-- visitor. Same convention as crm_unsubscribe_tokens (migration 0087):
-- service-role only, no policies of its own.
--
-- purpose = 'prefill'    -> opportunity_id set, minted per consultation-
--                            invite email send, lets the public booking
--                            page safely prefill that prospect's own
--                            contact/business info without exposing
--                            their crm_opportunities.id or letting the
--                            token be used to browse any other record.
-- purpose = 'reschedule' -> appointment_id set, minted at booking time
--                            (and again on every confirmation/reminder
--                            resend) for the reschedule link.
-- purpose = 'cancel'     -> appointment_id set, same as above for the
--                            cancellation link.
-- ---------------------------------------------------------------------
create table if not exists public.winsalot_appointment_tokens (
  token uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('prefill', 'reschedule', 'cancel')),
  opportunity_id uuid references public.crm_opportunities(id) on delete cascade,
  appointment_id uuid references public.winsalot_appointments(id) on delete cascade,
  expires_at timestamptz not null,
  -- Only ever set for reschedule/cancel tokens, at the moment the
  -- action they authorize actually executes (not at page view) - a
  -- prospect can safely open the link, look, and back out without
  -- burning it.
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint winsalot_appointment_tokens_target check (
    (purpose = 'prefill' and opportunity_id is not null and appointment_id is null)
    or (purpose in ('reschedule', 'cancel') and appointment_id is not null)
  )
);

create index if not exists winsalot_appointment_tokens_opportunity_idx on public.winsalot_appointment_tokens(opportunity_id);
create index if not exists winsalot_appointment_tokens_appointment_idx on public.winsalot_appointment_tokens(appointment_id);

alter table public.winsalot_appointment_tokens enable row level security;

-- ---------------------------------------------------------------------
-- winsalot_appointment_reminders: prospect-facing 24-hour and 1-hour
-- reminder dedup/log table - one row per (appointment, reminder_type,
-- occurrence_key), same technique as leadgen_appointment_business_reminders
-- (migration 0068): occurrence_key is the appointment's own start time at
-- claim time, so a reschedule is naturally eligible for its own fresh
-- reminders while every prior occurrence's send history is preserved.
-- ---------------------------------------------------------------------
create table if not exists public.winsalot_appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  appointment_id uuid not null references public.winsalot_appointments(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('24_hour_reminder', '1_hour_reminder')),
  occurrence_key text not null,
  scheduled_appointment_at timestamptz not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  recipient_email text,
  resend_email_id text,
  error_detail text,
  attempt_count integer not null default 0,
  sent_at timestamptz,
  unique (appointment_id, reminder_type, occurrence_key)
);

create index if not exists winsalot_appointment_reminders_appointment_idx on public.winsalot_appointment_reminders(appointment_id);

alter table public.winsalot_appointment_reminders enable row level security;

-- ---------------------------------------------------------------------
-- Stage-restriction trigger parity: the existing
-- crm_opportunities_restrict_agent_stage_trigger (migration 0081) is
-- unaffected (this never sets a closing stage), but application code
-- writing 'Consultation Booked' still goes through the normal session
-- client for an agent-initiated booking, so no new trigger is needed
-- here - the stage-advance rule ("never overwrite a more advanced stage")
-- is enforced in src/lib/crm-types.ts / the booking server actions.
-- ---------------------------------------------------------------------

-- New activity-timeline entries distinct from the existing prospect-email
-- system's plain 'email' entries, so the timeline can tell a consultation
-- booking/reschedule/cancellation apart at a glance. Purely additive,
-- same pattern as every prior extension of this constraint (migrations
-- 0007, 0009's crm_leads equivalent, etc).
alter table public.crm_activities drop constraint if exists crm_activities_activity_type_check;
alter table public.crm_activities add constraint crm_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'text', 'voicemail', 'note', 'outcome',
    'consultation_booked', 'consultation_rescheduled', 'consultation_cancelled'
  ));

-- ---------------------------------------------------------------------
-- Reminder cron wiring: same pg_cron + pg_net technique as migration
-- 0068 (leadgen_appointment_business_reminders) - Vercel Cron on this
-- account's Hobby plan can only run once a day, far too coarse for a
-- "1 hour before" reminder, so Postgres itself calls the app's own
-- secured cron route roughly every 15 minutes. Entirely independent
-- vault secrets/function/job name from 0068's, so nothing about the Lead
-- Gen CRM's reminder cron is touched.
--
-- Until an admin inserts 'winsalot_reminder_cron_url' and
-- 'winsalot_reminder_cron_secret' into Supabase Vault, this function is a
-- safe no-op (raises a notice and returns). The receiving route also
-- independently requires WINSALOT_APPOINTMENT_REMINDER_CRON_SECRET to
-- match, so this can never do anything until both are explicitly
-- configured.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;

create or replace function private.invoke_winsalot_appointment_reminder_cron()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  target_url text;
  bearer_secret text;
begin
  select decrypted_secret into target_url
    from vault.decrypted_secrets where name = 'winsalot_reminder_cron_url' limit 1;
  select decrypted_secret into bearer_secret
    from vault.decrypted_secrets where name = 'winsalot_reminder_cron_secret' limit 1;

  if target_url is null or bearer_secret is null then
    raise notice 'winsalot appointment reminder cron: vault secrets not configured yet, skipping';
    return;
  end if;

  perform net.http_post(
    url := target_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || bearer_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'winsalot-appointment-reminders') then
    perform cron.schedule(
      'winsalot-appointment-reminders',
      '*/15 * * * *',
      $job$select private.invoke_winsalot_appointment_reminder_cron();$job$
    );
  end if;
end;
$$;
