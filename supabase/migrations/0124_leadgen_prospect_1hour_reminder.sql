-- Lead Generation CRM: adds a 1-hour-before automatic reminder to the
-- prospect-facing reminder system (leadgen_appointment_reminders,
-- migration 0067), which previously only ever sent a single reminder at
-- the admin-configurable reminder_hours_before (default 24h). The
-- business-facing reminder (leadgen_appointment_business_reminders,
-- migration 0068) already sends at both 24h and 1h to the CRM client -
-- this brings the prospect side to the same 24h+1h pattern, for the
-- person actually attending the appointment.
--
-- Reuses the existing table (same unique(appointment_id, reminder_type,
-- occurrence_key) claim/dedup, same RLS policies, same reschedule/cancel
-- behavior via occurrence_key) rather than a new one, since this is
-- genuinely the same "automatic prospect reminder" concept with a second
-- interval - unlike 0068's business reminder, which is a fundamentally
-- different recipient and was correctly given its own table.
alter table public.leadgen_appointment_reminders
  drop constraint if exists leadgen_appointment_reminders_reminder_type_check;
alter table public.leadgen_appointment_reminders
  add constraint leadgen_appointment_reminders_reminder_type_check
  check (reminder_type in ('24_hour_reminder', '1_hour_reminder'));

-- Finer-grained scheduling for the new 1-hour reminder, same rationale
-- and same pg_cron/pg_net technique as migration 0068's header comment:
-- the existing 24-hour prospect reminder is invoked by Vercel Cron once
-- daily (vercel.json: "0 13 * * *", Hobby-plan limit), which cannot
-- meaningfully deliver a reminder "1 hour before" an appointment that
-- can occur at any time of day. That existing daily cron, its route, and
-- its CRON_SECRET are completely untouched by this migration - the new
-- 1-hour reminder is a separate route (/api/cron/leadgen-prospect-1hour-reminder)
-- invoked independently every 15 minutes, so the working 24-hour
-- reminder carries zero risk from this change.
--
-- No secret is ever hardcoded here or committed to git: the target URL
-- and bearer secret are read at call time from Supabase Vault
-- (vault.decrypted_secrets, by name). Until an admin inserts both vault
-- secrets ('leadgen_prospect_1hour_reminder_cron_url' and
-- 'leadgen_prospect_1hour_reminder_cron_secret'), this function is a
-- no-op: it raises a notice and returns instead of calling out anywhere.
-- Even once configured, the receiving route still independently requires
-- LEADGEN_REMINDER_CRON_ENABLED=true (the same gate the existing
-- prospect/business reminder routes use) and a matching
-- LEADGEN_PROSPECT_1HOUR_REMINDER_CRON_SECRET env var on Vercel.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;

create or replace function private.invoke_leadgen_prospect_1hour_reminder_cron()
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
    from vault.decrypted_secrets where name = 'leadgen_prospect_1hour_reminder_cron_url' limit 1;
  select decrypted_secret into bearer_secret
    from vault.decrypted_secrets where name = 'leadgen_prospect_1hour_reminder_cron_secret' limit 1;

  if target_url is null or bearer_secret is null then
    raise notice 'leadgen prospect 1-hour reminder cron: vault secrets not configured yet, skipping';
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
  if not exists (select 1 from cron.job where jobname = 'leadgen-prospect-1hour-reminder') then
    perform cron.schedule(
      'leadgen-prospect-1hour-reminder',
      '*/15 * * * *',
      $job$select private.invoke_leadgen_prospect_1hour_reminder_cron();$job$
    );
  end if;
end;
$$;
