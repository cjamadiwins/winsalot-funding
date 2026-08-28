-- Holiday Pay: a shared holiday calendar and per-agent assignment
-- mechanism, usable from both the Growth CRM (crm_users/crm_payroll) and
-- the Lead Generation CRM (leadgen_users/leadgen_payroll).
--
-- Design: "one shared holiday-pay record" (the brief) means the holiday
-- *definition* (name, date, jurisdiction, payment type, amount/percentage,
-- currency, payroll period, eligibility notes) lives exactly once in
-- public.holidays, regardless of which CRM's admin created it or which
-- CRM's agents it is assigned to - never duplicated per CRM the way
-- crm_payroll/leadgen_payroll deliberately are.
--
-- Cross-CRM duplicate-payment prevention: each holiday_pay_assignments row
-- represents one (holiday, agent-in-one-CRM) pairing and points at either
-- a crm_users row or a leadgen_users row (never both - see the check
-- constraint below), mirroring how crm_users and leadgen_users remain two
-- independent, non-overlapping identity tables everywhere else in this
-- codebase (crm-auth.ts / leadgen-auth.ts). shared_identity_key is that
-- agent's own email, lower-cased and trimmed at insert time - the one
-- piece of information that can actually identify "the same real person"
-- across the two otherwise-unlinked user tables. A partial unique index on
-- (holiday_id, shared_identity_key) where status = 'assigned' then makes it
-- a hard database guarantee, not just an application convention, that a
-- person who happens to have an active agent account in both CRMs (matched
-- by email) can only ever hold one active assignment for a given holiday -
-- whichever CRM's admin assigned them first wins, and the other CRM's bulk
-- "assign to all agents" simply skips them (see holiday-pay-actions.ts).
--
-- Payroll integration: holiday_pay is added as a real, persisted column on
-- crm_payroll/leadgen_payroll (like other_additions before it) rather than
-- computed on the fly from assignments at read time. This is deliberate:
-- once a payroll record is Paid, the existing crm_payroll_prevent_paid_edit
-- / leadgen_payroll_prevent_paid_edit triggers (migration 0063) already
-- freeze every ordinary column against edits - a persisted holiday_pay
-- column gets that same finalized-payroll protection for free, whereas a
-- value derived by joining assignments at render time would keep changing
-- underneath a Paid record if an assignment were edited afterwards. The
-- admin pulls the calculated/overridden assignment amount into this column
-- explicitly (mirroring exactly how every other payroll figure here is
-- admin-entered-with-a-reason, never auto-applied) via the "Load Holiday
-- Pay" helper in the admin payroll form.

-- ---------------------------------------------------------------------
-- 1. Shared holiday calendar / definition.
-- ---------------------------------------------------------------------

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (length(trim(name)) > 0),
  holiday_date date not null,
  jurisdiction text not null check (length(trim(jurisdiction)) > 0),
  description text,
  payment_type text not null check (payment_type in ('regular_paid_day', 'fixed_amount', 'percentage_premium', 'unpaid')),
  -- Flat amount, used only when payment_type = 'fixed_amount'.
  amount numeric(12, 2),
  -- Premium expressed as a percentage of the agent's standard daily rate
  -- (e.g. 150 = 150%), used only when payment_type = 'percentage_premium'.
  percentage numeric(6, 2),
  currency text not null default 'NGN' check (length(trim(currency)) > 0),
  -- The specific biweekly payday (see crm_payroll.payday) this holiday's
  -- pay is meant to land in. Nullable until an admin sets it - a holiday
  -- can be defined before the pay period it belongs to is decided.
  payroll_period_payday date,
  eligibility_notes text,
  -- "Inactive until an administrator assigns eligible agents" (the brief's
  -- own words for the Labour Day seed row) - is_active is the on/off
  -- switch admins use to deactivate a holiday without deleting it. Never
  -- flips true automatically; only ever set explicitly by an admin action.
  is_active boolean not null default true,
  created_by_crm_user uuid references public.crm_users(id) on delete set null,
  created_by_leadgen_user uuid references public.leadgen_users(id) on delete set null,
  -- Soft-delete only (matches crm_leave_requests, migration 0076) - a hard
  -- delete would cascade-delete holiday_pay_audit_log rows, including the
  -- very "holiday_deleted" entry recording who deleted it and when. Every
  -- list query filters out deleted_at is not null rows instead.
  deleted_at timestamptz,
  deleted_by_crm_user uuid references public.crm_users(id) on delete set null,
  deleted_by_leadgen_user uuid references public.leadgen_users(id) on delete set null,
  constraint holidays_fixed_amount_present check (
    payment_type <> 'fixed_amount' or amount is not null
  ),
  constraint holidays_percentage_present check (
    payment_type <> 'percentage_premium' or percentage is not null
  ),
  constraint holidays_amount_nonnegative check (amount is null or amount >= 0),
  constraint holidays_percentage_nonnegative check (percentage is null or percentage >= 0)
);

create index if not exists holidays_active_idx on public.holidays(is_active) where deleted_at is null;

-- ---------------------------------------------------------------------
-- 2. Per-agent assignment. Created before either table's RLS policies:
--    holidays_agent_select_assigned (below) references
--    holiday_pay_assignments, and Postgres requires a policy's referenced
--    table to already exist at CREATE POLICY time.
-- ---------------------------------------------------------------------

create table if not exists public.holiday_pay_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  holiday_id uuid not null references public.holidays(id) on delete cascade,
  crm_user_id uuid references public.crm_users(id) on delete cascade,
  leadgen_user_id uuid references public.leadgen_users(id) on delete cascade,
  -- The agent's own email, lower-cased/trimmed at insert time - the shared
  -- identifier used to detect "the same real person" across crm_users and
  -- leadgen_users (see header comment). Immutable after insert.
  shared_identity_key text not null check (length(trim(shared_identity_key)) > 0),
  calculated_amount numeric(12, 2) not null default 0 check (calculated_amount >= 0),
  override_amount numeric(12, 2) check (override_amount is null or override_amount >= 0),
  override_reason text,
  effective_amount numeric(12, 2) generated always as (coalesce(override_amount, calculated_amount)) stored,
  status text not null default 'assigned' check (status in ('assigned', 'cancelled')),
  assigned_by_crm_user uuid references public.crm_users(id) on delete set null,
  assigned_by_leadgen_user uuid references public.leadgen_users(id) on delete set null,
  constraint holiday_pay_assignments_one_agent check (
    (crm_user_id is not null and leadgen_user_id is null)
    or (crm_user_id is null and leadgen_user_id is not null)
  ),
  constraint holiday_pay_assignments_override_reason_required check (
    override_amount is null or (override_reason is not null and length(trim(override_reason)) > 0)
  )
);

-- At most one assignment row ever, per (holiday, specific real user id) -
-- regardless of status, so "remove then re-assign the same agent" updates
-- the same row instead of accumulating duplicates. Two partial indexes,
-- not one plain unique constraint on (holiday_id, crm_user_id,
-- leadgen_user_id): a plain unique constraint would never actually fire
-- for either agent type, since Postgres treats every NULL as distinct
-- from every other NULL, and exactly one of these two columns is always
-- NULL (see the check constraint above).
create unique index if not exists holiday_pay_assignments_unique_crm_agent_per_holiday
  on public.holiday_pay_assignments(holiday_id, crm_user_id)
  where crm_user_id is not null;
create unique index if not exists holiday_pay_assignments_unique_leadgen_agent_per_holiday
  on public.holiday_pay_assignments(holiday_id, leadgen_user_id)
  where leadgen_user_id is not null;

-- The actual cross-CRM dedup guarantee: only one *active* assignment per
-- (holiday, real person) is ever allowed, regardless of which CRM's user
-- row it points at. Partial on status = 'assigned' so a cancelled/removed
-- assignment never blocks a fresh one for the same person later.
create unique index if not exists holiday_pay_assignments_unique_identity_per_holiday
  on public.holiday_pay_assignments(holiday_id, shared_identity_key)
  where status = 'assigned';

create index if not exists holiday_pay_assignments_crm_user_idx on public.holiday_pay_assignments(crm_user_id);
create index if not exists holiday_pay_assignments_leadgen_user_idx on public.holiday_pay_assignments(leadgen_user_id);
create index if not exists holiday_pay_assignments_holiday_idx on public.holiday_pay_assignments(holiday_id);

create or replace function public.holiday_pay_assignments_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists holiday_pay_assignments_touch_updated_at_trigger on public.holiday_pay_assignments;
create trigger holiday_pay_assignments_touch_updated_at_trigger
  before update on public.holiday_pay_assignments
  for each row execute function public.holiday_pay_assignments_touch_updated_at();

-- ---------------------------------------------------------------------
-- 2b. RLS for both tables above - both must already exist (see the note
--     on section 2), since holidays_agent_select_assigned references
--     holiday_pay_assignments.
-- ---------------------------------------------------------------------

alter table public.holidays enable row level security;

-- Admin-managed from either CRM - a shared calendar/definition needs to be
-- editable by whichever CRM's admin is working with it, same as this
-- table not being duplicated per CRM in the first place.
create policy "holidays_admin_all" on public.holidays for all
  using (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin');

-- An agent may only see a holiday's definition (name/date/type/etc.) if
-- they hold an active assignment to it - never the full shared calendar,
-- so an agent can't browse holidays that were never assigned to them.
create policy "holidays_agent_select_assigned" on public.holidays for select
  using (
    holidays.deleted_at is null
    and exists (
      select 1 from public.holiday_pay_assignments hpa
      where hpa.holiday_id = holidays.id
        and hpa.status = 'assigned'
        and (
          (hpa.crm_user_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent')
          or (hpa.leadgen_user_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent')
        )
    )
  );

alter table public.holiday_pay_assignments enable row level security;

create policy "holiday_pay_assignments_admin_all" on public.holiday_pay_assignments for all
  using (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin');

-- An agent may only ever read their own assignment rows - no insert/
-- update/delete policy for agents at all (the absence of a policy is the
-- enforcement, matching crm_payroll/leadgen_payroll).
create policy "holiday_pay_assignments_agent_select_own" on public.holiday_pay_assignments for select
  using (
    (crm_user_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent')
    or (leadgen_user_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent')
  );

-- ---------------------------------------------------------------------
-- 3. Shared audit trail for holiday + assignment changes ("Record all
--    changes in the payroll audit history"). Append-only, admin-only,
--    same shape/rationale as crm_payroll_audit_log (migration 0063).
-- ---------------------------------------------------------------------

create table if not exists public.holiday_pay_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  holiday_id uuid references public.holidays(id) on delete cascade,
  assignment_id uuid references public.holiday_pay_assignments(id) on delete cascade,
  action text not null check (action in (
    'holiday_created', 'holiday_updated', 'holiday_deactivated', 'holiday_reactivated',
    'holiday_deleted', 'agent_assigned', 'assignment_removed', 'amount_overridden'
  )),
  performed_by_crm_user uuid references public.crm_users(id) on delete set null,
  performed_by_leadgen_user uuid references public.leadgen_users(id) on delete set null,
  performed_by_name text not null,
  reason text,
  details jsonb,
  constraint holiday_pay_audit_log_reason_required check (
    action not in ('holiday_deactivated', 'holiday_deleted', 'assignment_removed', 'amount_overridden')
    or (reason is not null and length(trim(reason)) > 0)
  )
);

create index if not exists holiday_pay_audit_log_holiday_idx on public.holiday_pay_audit_log(holiday_id, created_at desc);

alter table public.holiday_pay_audit_log enable row level security;

create policy "holiday_pay_audit_log_admin_select" on public.holiday_pay_audit_log for select
  using (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin');

create policy "holiday_pay_audit_log_admin_insert" on public.holiday_pay_audit_log for insert
  with check (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- 4. Holiday Pay as its own payroll line item on crm_payroll /
--    leadgen_payroll, included in the generated total_pay expression -
--    same drop/recreate approach as migration 0063/0075 (Postgres has no
--    ALTER ... SET EXPRESSION). Defaults to 0, so every existing row's
--    total_pay recomputes to the exact same value it already had.
-- ---------------------------------------------------------------------

alter table public.crm_payroll
  add column if not exists holiday_pay numeric(12, 2) not null default 0 check (holiday_pay >= 0);

alter table public.crm_payroll drop column total_pay;
alter table public.crm_payroll
  add column total_pay numeric(12, 2) generated always as (
    base_pay_earned + internet_allowance + bonus_commission + other_additions + holiday_pay - deductions
  ) stored;

alter table public.crm_payroll_audit_log drop constraint if exists crm_payroll_audit_log_action_check;
alter table public.crm_payroll_audit_log drop constraint if exists crm_payroll_audit_log_reason_required;
alter table public.crm_payroll_audit_log
  add constraint crm_payroll_audit_log_action_check check (action in (
    'created', 'attendance_loaded', 'days_adjusted', 'hours_adjusted', 'incentive_changed',
    'deduction_changed', 'addition_changed', 'holiday_pay_changed', 'notes_updated',
    'approved', 'marked_paid', 'cancelled', 'reopened'
  ));
alter table public.crm_payroll_audit_log
  add constraint crm_payroll_audit_log_reason_required check (
    action not in ('days_adjusted', 'hours_adjusted', 'incentive_changed', 'deduction_changed', 'addition_changed', 'holiday_pay_changed', 'cancelled', 'reopened')
    or (reason is not null and length(trim(reason)) > 0)
  );

alter table public.leadgen_payroll
  add column if not exists holiday_pay numeric(12, 2) not null default 0 check (holiday_pay >= 0);

alter table public.leadgen_payroll drop column total_pay;
alter table public.leadgen_payroll
  add column total_pay numeric(12, 2) generated always as (
    base_pay_earned + internet_allowance + bonus_commission + other_additions + holiday_pay - deductions
  ) stored;

alter table public.leadgen_payroll_audit_log drop constraint if exists leadgen_payroll_audit_log_action_check;
alter table public.leadgen_payroll_audit_log drop constraint if exists leadgen_payroll_audit_log_reason_required;
alter table public.leadgen_payroll_audit_log
  add constraint leadgen_payroll_audit_log_action_check check (action in (
    'created', 'attendance_loaded', 'days_adjusted', 'hours_adjusted', 'incentive_changed',
    'deduction_changed', 'addition_changed', 'holiday_pay_changed', 'notes_updated',
    'approved', 'marked_paid', 'cancelled', 'reopened'
  ));
alter table public.leadgen_payroll_audit_log
  add constraint leadgen_payroll_audit_log_reason_required check (
    action not in ('days_adjusted', 'hours_adjusted', 'incentive_changed', 'deduction_changed', 'addition_changed', 'holiday_pay_changed', 'cancelled', 'reopened')
    or (reason is not null and length(trim(reason)) > 0)
  );

-- ---------------------------------------------------------------------
-- 5. Seed: Labour Day, inactive, no assigned agents, no payment generated
--    ("Do not automatically assume that every Canadian or Ontario
--    statutory holiday applies to overseas agents. The administrator must
--    assign eligibility.").
-- ---------------------------------------------------------------------

insert into public.holidays (name, holiday_date, jurisdiction, description, payment_type, currency, is_active, eligibility_notes)
select
  'Labour Day',
  date '2026-09-07',
  'Canada/Ontario',
  'Canadian statutory holiday observed the first Monday of September.',
  'regular_paid_day',
  'CAD',
  false,
  'Inactive by default - an administrator must review and assign eligible agents before this holiday pays out. Do not assume this applies to agents outside Canada/Ontario.'
where not exists (
  select 1 from public.holidays where name = 'Labour Day' and holiday_date = date '2026-09-07'
);
