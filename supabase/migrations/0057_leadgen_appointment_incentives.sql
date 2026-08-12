-- Weekly Agent Incentive (Lead Gen CRM half): a qualification review
-- column on leadgen_appointments, separate from the existing scheduling
-- `status` column (Booked/Confirmed/Completed/No-show/Rescheduled/
-- Cancelled, migration 0031). `status` tracks the appointment's
-- scheduling state; incentive_status tracks whether an admin has
-- reviewed this specific appointment as a *qualified* appointment for
-- the Weekly Incentive (see supabase/migrations/0059_agent_incentive_
-- ledger.sql for the shared bonus math/ledger, and lib/leadgen-
-- incentives.ts for the calculation).
--
-- Default null = "not yet reviewed" - never counts toward the weekly
-- quota (see lib/leadgen-incentives.ts). "Do not count deleted
-- appointments" needs no extra column: this app hard-deletes
-- leadgen_appointments rows (see admin lead deletion, leads/actions.ts),
-- so a deleted appointment simply no longer exists to be counted.
-- "Prevent the same appointment from being counted more than once" is
-- enforced the same way the existing Agent Performance Report already
-- does - keyed off booking_agent_id (migration 0050), so an appointment
-- is credited to at most one agent.
--
-- Entirely additive - does not touch leadgen_appointments.status, any
-- other leadgen_* table, or (via this file) anything in the Cleaning CRM
-- at all.
alter table public.leadgen_appointments
  add column if not exists incentive_status text
    check (incentive_status is null or incentive_status in (
      'Qualified', 'Cancelled', 'Invalid', 'Duplicate', 'Unqualified'
    )),
  add column if not exists incentive_status_set_by uuid references public.leadgen_users(id) on delete set null,
  add column if not exists incentive_status_set_at timestamptz;

create index if not exists leadgen_appointments_incentive_status_idx on public.leadgen_appointments(incentive_status);
