-- Lead Generation CRM: automatic BUSINESS-facing appointment reminders.
--
-- Distinct from leadgen_appointment_reminders (migration 0067), which
-- reminds the *prospect* 24 hours before their own consultation.
-- leadgen_appointment_business_reminders instead reminds the CRM CLIENT
-- itself (Brent's Essentials, via leadgen_clients.contact_email) that one
-- of their booked/confirmed appointments is coming up - once 24 hours
-- before, and again 1 hour before, so the business can prepare/be ready
-- to take the call. Two entirely separate tables/jobs rather than
-- extending the existing one, since the recipient-resolution rule is
-- fundamentally different (the client's own contact_email, never the
-- lead's) and the existing table's reminder_type/settings shape is
-- purpose-built for a single prospect-facing reminder - reusing it would
-- have meant unpicking assumptions baked into 0067 rather than adding
-- alongside them. Nothing in 0067's table, settings, or cron job is
-- touched by this migration.

create table if not exists public.leadgen_appointment_business_reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  appointment_id uuid not null references public.leadgen_appointments(id) on delete cascade,
  lead_id uuid references public.leadgen_leads(id) on delete set null,
  -- Two independent reminder slots per appointment occurrence - one row
  -- each, claimed/sent independently, so a failure or delay in one never
  -- blocks the other.
  reminder_type text not null check (reminder_type in ('24_hour_reminder', '1_hour_reminder')),
  -- Same technique as leadgen_appointment_reminders.occurrence_key: the
  -- appointment's own date+time at claim time. A reschedule produces a
  -- fresh occurrence_key, which is what lets a rescheduled appointment
  -- become eligible for brand new 24h/1h reminders while every prior
  -- occurrence's send history stays intact and untouched - this is the
  -- "cancel the old reminders and schedule new ones" behavior the brief
  -- asks for: there is nothing to explicitly cancel, since a stale
  -- occurrence's row simply stops being "the current one" the moment the
  -- appointment's date/time changes, and the job only ever evaluates the
  -- appointment's *current* date/time/status on every run.
  occurrence_key text not null,
  scheduled_appointment_at timestamptz not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  recipient_email text,
  email_id uuid references public.leadgen_emails(id) on delete set null,
  resend_message_id text,
  error_detail text,
  attempt_count integer not null default 0,
  sent_at timestamptz,
  unique (appointment_id, reminder_type, occurrence_key)
);

create index if not exists leadgen_appointment_business_reminders_lead_idx on public.leadgen_appointment_business_reminders(lead_id);
create index if not exists leadgen_appointment_business_reminders_appointment_idx on public.leadgen_appointment_business_reminders(appointment_id);

alter table public.leadgen_appointment_business_reminders enable row level security;

create policy "leadgen_appointment_business_reminders_admin_all"
  on public.leadgen_appointment_business_reminders for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_appointment_business_reminders_agent_select_own"
  on public.leadgen_appointment_business_reminders for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and lead_id is not null
    and exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- leadgen_business_appointment_reminder_settings: one configurable
-- singleton row, same convention as leadgen_appointment_reminder_settings
-- (migration 0067). Defaults to ON (unlike 0067's off-by-default) because
-- these are low-risk internal notifications to the client's own inbox,
-- not prospect-facing email, and the brief asks for this to actively
-- cover every existing and future appointment rather than wait for a
-- separate admin opt-in.
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_business_appointment_reminder_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000102'::uuid
    check (id = '00000000-0000-0000-0000-000000000102'::uuid),
  automatic_reminders_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by_name text
);

insert into public.leadgen_business_appointment_reminder_settings (id) values ('00000000-0000-0000-0000-000000000102'::uuid)
on conflict (id) do nothing;

alter table public.leadgen_business_appointment_reminder_settings enable row level security;

create policy "leadgen_business_appointment_reminder_settings_admin_all"
  on public.leadgen_business_appointment_reminder_settings for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_business_appointment_reminder_settings_agent_select"
  on public.leadgen_business_appointment_reminder_settings for select
  using (public.leadgen_user_role(auth.uid()) = 'agent');

-- Distinct activity-timeline entry for this automatic send, so the
-- timeline can tell it apart from the prospect-facing
-- 'appointment_reminder_auto_sent' (migration 0067) at a glance. Purely
-- additive, same pattern as every prior extension of this constraint.
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
    'appointment_reminder_auto_sent', 'appointment_business_reminder_auto_sent'
  ));

-- ---------------------------------------------------------------------
-- Finer-grained scheduling for the 1-hour-before reminder.
--
-- The existing cron endpoint (leadgen-appointment-reminders) is invoked
-- by Vercel Cron on a once-daily schedule (vercel.json: "0 13 * * *") -
-- this Vercel account is on the Hobby plan, which does not allow a cron
-- job to run more than once a day (see the WINDOW_SLACK_MINUTES comment
-- in lib/leadgen-appointment-reminders.ts for the same constraint's
-- effect on the 24-hour reminder). A once-daily invocation cannot
-- meaningfully deliver a reminder "1 hour before" an appointment that
-- could occur at any time of day.
--
-- pg_cron + pg_net (both available as extensions on this Supabase
-- project) is the standard workaround: Postgres itself schedules a
-- frequent job that makes an outbound HTTP call to the app's own
-- existing secured cron route
-- (/api/cron/leadgen-business-appointment-reminders), reusing the exact
-- same Authorization: Bearer <secret> pattern every other cron route in
-- this app already uses - this only adds a second, independent trigger
-- mechanism for that one route; it doesn't change how the route
-- authenticates or what it does.
--
-- No secret is ever hardcoded in this migration or committed to git: the
-- target URL and bearer secret are read at call time from Supabase Vault
-- (vault.decrypted_secrets, by name) via private.invoke_leadgen_business_
-- appointment_reminder_cron(). Until an admin inserts those two vault
-- secrets ('leadgen_business_reminder_cron_url' and
-- 'leadgen_business_reminder_cron_secret' - see the setup instructions in
-- the PR description / lib/leadgen-business-appointment-reminders.ts),
-- this function is a safe no-op: it raises a notice and returns instead
-- of calling out anywhere. Even once configured, the target route itself
-- still independently requires LEADGEN_REMINDER_CRON_ENABLED=true on the
-- receiving Vercel project (the same gate 0067's cron already uses) and a
-- matching LEADGEN_BUSINESS_REMINDER_CRON_SECRET env var, so this can
-- never do anything on the winsalot-funding (Cleaning CRM) deployment,
-- and does nothing at all until both are explicitly configured.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;

create or replace function private.invoke_leadgen_business_appointment_reminder_cron()
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
    from vault.decrypted_secrets where name = 'leadgen_business_reminder_cron_url' limit 1;
  select decrypted_secret into bearer_secret
    from vault.decrypted_secrets where name = 'leadgen_business_reminder_cron_secret' limit 1;

  if target_url is null or bearer_secret is null then
    raise notice 'leadgen business reminder cron: vault secrets not configured yet, skipping';
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
  if not exists (select 1 from cron.job where jobname = 'leadgen-business-appointment-reminders') then
    perform cron.schedule(
      'leadgen-business-appointment-reminders',
      '*/15 * * * *',
      $job$select private.invoke_leadgen_business_appointment_reminder_cron();$job$
    );
  end if;
end;
$$;
