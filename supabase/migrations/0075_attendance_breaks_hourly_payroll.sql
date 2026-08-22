-- Adds break tracking (Break 1, Lunch, Break 2) to the live attendance
-- tables, an hourly pay structure (₦50,000 / 75 paid hours biweekly) to
-- payroll, and an admin-correction path with a mandatory audit trail for
-- both. Applies the same shape to both CRMs, in lockstep, for the same
-- "two CRMs, two independent agent pools, identical rules" reason every
-- other shared feature in this codebase (chat, leave requests, payroll)
-- was split the same way.
--
-- Nothing here drops or recomputes existing data:
--  - every new column on agent_attendance / leadgen_agent_attendance /
--    crm_payroll / leadgen_payroll / crm_users / leadgen_users is
--    nullable or defaults to 0/false - every already-created row keeps
--    exactly the values it had before, and back-fills the new columns
--    with neutral defaults rather than guessing at history that predates
--    this feature.
--  - internet_allowance's default changes to 25000 for *new* rows only -
--    an ALTER COLUMN ... SET DEFAULT never touches an existing row's
--    already-stored value.
--  - the Cleaning CRM's legacy crm_attendance table (migration
--    0007/0043) is untouched here - its data stays exactly as it is,
--    read-only, once the app-level change in this PR stops writing to
--    it (see src/app/agent/(dashboard)/attendance/page.tsx).
--  - the payroll audit-log action enum only gains new values here; every
--    already-written row keeps whichever value it already has.

-- ---------------------------------------------------------------------
-- 1. Per-agent scheduled shift start time (used to compute late arrival /
--    early departure). Nullable and admin-set: an agent with no schedule
--    configured yet is never flagged late/early - existing behavior for
--    every agent until an admin opts them in from the Attendance page.
-- ---------------------------------------------------------------------

alter table public.crm_users
  add column if not exists scheduled_start_time time;

alter table public.leadgen_users
  add column if not exists scheduled_start_time time;

-- ---------------------------------------------------------------------
-- 2. Cleaning CRM: agent_attendance break columns + state-machine
--    constraints + admin-correction carve-out.
-- ---------------------------------------------------------------------

alter table public.agent_attendance
  add column if not exists break1_start timestamptz,
  add column if not exists break1_end timestamptz,
  add column if not exists lunch_start timestamptz,
  add column if not exists lunch_end timestamptz,
  add column if not exists break2_start timestamptz,
  add column if not exists break2_end timestamptz;

alter table public.agent_attendance
  add constraint agent_attendance_break1_order check (break1_end is null or (break1_start is not null and break1_end >= break1_start)),
  add constraint agent_attendance_lunch_order check (lunch_end is null or (lunch_start is not null and lunch_end >= lunch_start)),
  add constraint agent_attendance_break2_order check (break2_end is null or (break2_start is not null and break2_end >= break2_start)),
  -- Only one of Break 1 / Lunch / Break 2 may be open (started, not yet
  -- ended) at any given time - "Only one break may be active at a time."
  add constraint agent_attendance_one_active_break check (
    (case when break1_start is not null and break1_end is null then 1 else 0 end
   + case when lunch_start is not null and lunch_end is null then 1 else 0 end
   + case when break2_start is not null and break2_end is null then 1 else 0 end) <= 1
  ),
  -- Can't clock out while a break is still open - the agent must end it
  -- first, matching the button flow described in the spec.
  add constraint agent_attendance_no_open_break_at_clockout check (
    clock_out is null or (
      (break1_start is null or break1_end is not null)
      and (lunch_start is null or lunch_end is not null)
      and (break2_start is null or break2_end is not null)
    )
  );

-- Replaces the migration-0043 version: an admin (crm_user_role = 'admin')
-- may now also correct an already-closed row - "Administrators may view
-- and correct all records" - while agent_id and created_at stay
-- immutable even for an admin correction (who the row belongs to, and
-- when it was originally created, are never editable). Every other
-- update path (agent self-service open-shift edits, agent clock-out, the
-- existing admin force-clock-out) is unchanged from 0043/0049.
create or replace function public.enforce_agent_attendance_close_only_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.clock_out is not null then
      if public.crm_user_role(auth.uid()) <> 'admin' then
        raise exception 'Attendance record is already closed.';
      end if;

      if new.agent_id <> old.agent_id then
        raise exception 'agent_id cannot be modified.';
      end if;
      if new.created_at <> old.created_at then
        raise exception 'created_at cannot be modified.';
      end if;

      return new;
    end if;

    if new.agent_id <> old.agent_id then
      raise exception 'agent_id cannot be modified.';
    end if;

    if new.created_at <> old.created_at then
      raise exception 'created_at cannot be modified.';
    end if;
  end if;

  return new;
end;
$$;

-- Lets an agent update break columns (and anything else) on their own
-- still-open shift, not just the final clock-out transition that
-- "agent_attendance_agent_clock_out_own_open" (migration 0043) already
-- covers. Both policies are permissive and OR together, so this adds the
-- capability without narrowing what already worked.
create policy "agent_attendance_agent_update_own_open"
  on public.agent_attendance for update
  using (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent' and clock_out is null)
  with check (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent' and clock_out is null);

-- Broad admin correction policy - an admin may update any row (open or
-- closed); the trigger above still pins agent_id/created_at even for an
-- admin. Narrower existing admin policies (clock-out-open) stay in place
-- and are simply redundant with this one, not conflicting with it.
create policy "agent_attendance_admin_correct_any"
  on public.agent_attendance for update
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Append-only audit trail for admin corrections to a closed attendance
-- record - "every manual adjustment must record the administrator, date,
-- reason and previous value." Mirrors crm_payroll_audit_log's shape
-- exactly (migration 0063).
create table if not exists public.crm_attendance_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  attendance_id uuid not null references public.agent_attendance(id) on delete cascade,
  agent_id uuid not null references auth.users(id) on delete cascade,
  performed_by uuid references public.crm_users(id) on delete set null,
  performed_by_name text not null,
  reason text not null,
  previous_value jsonb not null,
  new_value jsonb not null,
  constraint crm_attendance_audit_log_reason_required check (length(trim(reason)) > 0)
);

create index if not exists crm_attendance_audit_log_attendance_idx
  on public.crm_attendance_audit_log(attendance_id, created_at desc);

alter table public.crm_attendance_audit_log enable row level security;

create policy "crm_attendance_audit_log_admin_select"
  on public.crm_attendance_audit_log for select
  using (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_attendance_audit_log_admin_insert"
  on public.crm_attendance_audit_log for insert
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- 3. Lead Generation CRM: leadgen_agent_attendance (identical shape).
-- ---------------------------------------------------------------------

alter table public.leadgen_agent_attendance
  add column if not exists break1_start timestamptz,
  add column if not exists break1_end timestamptz,
  add column if not exists lunch_start timestamptz,
  add column if not exists lunch_end timestamptz,
  add column if not exists break2_start timestamptz,
  add column if not exists break2_end timestamptz;

alter table public.leadgen_agent_attendance
  add constraint leadgen_agent_attendance_break1_order check (break1_end is null or (break1_start is not null and break1_end >= break1_start)),
  add constraint leadgen_agent_attendance_lunch_order check (lunch_end is null or (lunch_start is not null and lunch_end >= lunch_start)),
  add constraint leadgen_agent_attendance_break2_order check (break2_end is null or (break2_start is not null and break2_end >= break2_start)),
  add constraint leadgen_agent_attendance_one_active_break check (
    (case when break1_start is not null and break1_end is null then 1 else 0 end
   + case when lunch_start is not null and lunch_end is null then 1 else 0 end
   + case when break2_start is not null and break2_end is null then 1 else 0 end) <= 1
  ),
  add constraint leadgen_agent_attendance_no_open_break_at_clockout check (
    clock_out is null or (
      (break1_start is null or break1_end is not null)
      and (lunch_start is null or lunch_end is not null)
      and (break2_start is null or break2_end is not null)
    )
  );

create or replace function public.enforce_leadgen_attendance_close_only_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.clock_out is not null then
      if public.leadgen_user_role(auth.uid()) <> 'admin' then
        raise exception 'Attendance record is already closed.';
      end if;

      if new.agent_id <> old.agent_id then
        raise exception 'agent_id cannot be modified.';
      end if;
      if new.agent_name <> old.agent_name then
        raise exception 'agent_name cannot be modified.';
      end if;
      if new.created_at <> old.created_at then
        raise exception 'created_at cannot be modified.';
      end if;

      return new;
    end if;

    if new.agent_id <> old.agent_id then
      raise exception 'agent_id cannot be modified.';
    end if;
    if new.agent_name <> old.agent_name then
      raise exception 'agent_name cannot be modified.';
    end if;
    if new.created_at <> old.created_at then
      raise exception 'created_at cannot be modified.';
    end if;
  end if;

  return new;
end;
$$;

create policy "leadgen_agent_attendance_agent_update_own_open"
  on public.leadgen_agent_attendance for update
  using (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent' and clock_out is null)
  with check (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent' and clock_out is null);

create policy "leadgen_agent_attendance_admin_correct_any"
  on public.leadgen_agent_attendance for update
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create table if not exists public.leadgen_attendance_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  attendance_id uuid not null references public.leadgen_agent_attendance(id) on delete cascade,
  agent_id uuid not null references auth.users(id) on delete cascade,
  performed_by uuid references public.leadgen_users(id) on delete set null,
  performed_by_name text not null,
  reason text not null,
  previous_value jsonb not null,
  new_value jsonb not null,
  constraint leadgen_attendance_audit_log_reason_required check (length(trim(reason)) > 0)
);

create index if not exists leadgen_attendance_audit_log_attendance_idx
  on public.leadgen_attendance_audit_log(attendance_id, created_at desc);

alter table public.leadgen_attendance_audit_log enable row level security;

create policy "leadgen_attendance_audit_log_admin_select"
  on public.leadgen_attendance_audit_log for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_attendance_audit_log_admin_insert"
  on public.leadgen_attendance_audit_log for insert
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- 4. Hourly pay structure on crm_payroll / leadgen_payroll.
--
--    Base pay earned keeps meaning "gross wages before attendance
--    deductions" exactly as it already does (migration 0063's own
--    header comment) - a completed 75-paid-hour period still earns the
--    full standard_biweekly_wage (₦50,000) as base_pay_earned, with any
--    shortfall subtracted via the existing `deductions` column.
--    total_pay's generated expression (base_pay_earned + internet_
--    allowance + bonus_commission + other_additions - deductions) is
--    untouched - it already adds up to exactly what the new hourly
--    model needs.
-- ---------------------------------------------------------------------

alter table public.crm_payroll
  add column if not exists standard_biweekly_wage numeric(12, 2) not null default 50000,
  add column if not exists standard_paid_hours numeric(6, 2) not null default 75,
  add column if not exists regular_paid_hours numeric(8, 2) not null default 0,
  add column if not exists unpaid_hours numeric(8, 2) not null default 0,
  add column if not exists approved_paid_leave_hours numeric(8, 2) not null default 0;

alter table public.crm_payroll
  add constraint crm_payroll_hourly_structure_positive check (
    standard_biweekly_wage >= 0 and standard_paid_hours > 0
  ),
  add constraint crm_payroll_hours_nonnegative check (
    regular_paid_hours >= 0 and unpaid_hours >= 0 and approved_paid_leave_hours >= 0
  );

-- New payroll records default to the ₦25,000 fixed internet allowance -
-- existing rows keep whatever value they already have.
alter table public.crm_payroll alter column internet_allowance set default 25000;

alter table public.crm_payroll_audit_log drop constraint if exists crm_payroll_audit_log_reason_required;
alter table public.crm_payroll_audit_log drop constraint if exists crm_payroll_audit_log_action_check;
alter table public.crm_payroll_audit_log
  add constraint crm_payroll_audit_log_action_check check (action in (
    'created', 'attendance_loaded', 'days_adjusted', 'hours_adjusted', 'incentive_changed',
    'deduction_changed', 'addition_changed', 'notes_updated',
    'approved', 'marked_paid', 'cancelled', 'reopened'
  ));
alter table public.crm_payroll_audit_log
  add constraint crm_payroll_audit_log_reason_required check (
    action not in ('days_adjusted', 'hours_adjusted', 'incentive_changed', 'deduction_changed', 'addition_changed', 'cancelled', 'reopened')
    or (reason is not null and length(trim(reason)) > 0)
  );

alter table public.leadgen_payroll
  add column if not exists standard_biweekly_wage numeric(12, 2) not null default 50000,
  add column if not exists standard_paid_hours numeric(6, 2) not null default 75,
  add column if not exists regular_paid_hours numeric(8, 2) not null default 0,
  add column if not exists unpaid_hours numeric(8, 2) not null default 0,
  add column if not exists approved_paid_leave_hours numeric(8, 2) not null default 0;

alter table public.leadgen_payroll
  add constraint leadgen_payroll_hourly_structure_positive check (
    standard_biweekly_wage >= 0 and standard_paid_hours > 0
  ),
  add constraint leadgen_payroll_hours_nonnegative check (
    regular_paid_hours >= 0 and unpaid_hours >= 0 and approved_paid_leave_hours >= 0
  );

alter table public.leadgen_payroll alter column internet_allowance set default 25000;

alter table public.leadgen_payroll_audit_log drop constraint if exists leadgen_payroll_audit_log_reason_required;
alter table public.leadgen_payroll_audit_log drop constraint if exists leadgen_payroll_audit_log_action_check;
alter table public.leadgen_payroll_audit_log
  add constraint leadgen_payroll_audit_log_action_check check (action in (
    'created', 'attendance_loaded', 'days_adjusted', 'hours_adjusted', 'incentive_changed',
    'deduction_changed', 'addition_changed', 'notes_updated',
    'approved', 'marked_paid', 'cancelled', 'reopened'
  ));
alter table public.leadgen_payroll_audit_log
  add constraint leadgen_payroll_audit_log_reason_required check (
    action not in ('days_adjusted', 'hours_adjusted', 'incentive_changed', 'deduction_changed', 'addition_changed', 'cancelled', 'reopened')
    or (reason is not null and length(trim(reason)) > 0)
  );
