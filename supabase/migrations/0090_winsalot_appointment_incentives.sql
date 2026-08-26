-- Weekly Agent Incentive (Winsalot Growth CRM half) - a qualification
-- review column on winsalot_appointments, mirroring the Lead Gen CRM's
-- leadgen_appointments.incentive_status exactly (migrations 0057 and
-- 0061 combined into one file here since this table didn't exist yet
-- when those shipped). `status` (migration 0088) tracks the scheduling
-- state (booked/cancelled); incentive_status tracks whether an admin has
-- reviewed this specific appointment as a *qualified* consultation for
-- the Weekly Incentive (see supabase/migrations/0059_agent_incentive_
-- ledger.sql for the shared bonus math/ledger, and
-- lib/crm-incentives.ts for the calculation).
--
-- This replaces the Weekly Incentive's previous qualifying event for
-- this CRM (an opportunity closed as Client Won, see the now-superseded
-- header comment in lib/crm-incentives.ts) with "a consultation
-- appointment an admin has reviewed as Qualified" - the CRM's own
-- product moved from selling cleaning services to booking growth
-- consultations, and the incentive should reward the same behavior the
-- CRM is now built around: booking qualified appointments, not closing
-- deals.
--
-- Default null = "not yet reviewed" - never counts toward the weekly
-- quota (see lib/crm-incentives.ts). "Do not count deleted
-- appointments" needs no extra column: a deleted winsalot_appointments
-- row simply no longer exists to be counted. "Prevent the same
-- appointment from being counted more than once" is enforced by
-- assigned_agent_id (migration 0088) - an appointment is credited to at
-- most one agent.
alter table public.winsalot_appointments
  add column if not exists incentive_status text
    check (incentive_status is null or incentive_status in (
      'Qualified', 'Cancelled', 'Invalid', 'Duplicate', 'Unqualified'
    )),
  add column if not exists incentive_status_set_by uuid references public.crm_users(id) on delete set null,
  add column if not exists incentive_status_set_at timestamptz,
  add column if not exists incentive_status_reason text;

create index if not exists winsalot_appointments_incentive_status_idx on public.winsalot_appointments(incentive_status);
