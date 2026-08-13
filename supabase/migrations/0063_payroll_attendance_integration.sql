-- Reworks crm_payroll and leadgen_payroll (migrations 0054/0055) from a
-- purely manual pay entry into the attendance-driven, admin-approved
-- payroll described in the Payroll spec: a fixed ₦75,000 / 10 working
-- days / ₦7,500-per-day structure, a day-by-day breakdown sourced from
-- attendance, and a Draft -> Approved -> Paid (-> Cancelled / reopened)
-- workflow with a full audit trail. Applies the same shape to both
-- tables, in lockstep, for the same "two CRMs, two independent agent
-- pools, identical rules" reasons the original tables were split.
--
-- Nothing here drops or recomputes existing data:
--  - base_salary is renamed (not dropped) to base_pay_earned - a rename
--    preserves every existing value byte-for-byte, it just gives the
--    column the name this feature's field list actually uses. Every
--    already-created row keeps exactly the amount it had before.
--  - every new numeric/int column defaults to 0 (or the current standard
--    pay-structure constants), so it back-fills existing rows without
--    guessing at attendance history that predates this feature.
--  - total_pay's generated expression gains "+ other_additions", which
--    defaults to 0 on every existing row - old rows recompute to the
--    exact same total_pay they already had.
--  - the only status *value* migrated is 'pending' -> 'approved' (below),
--    because 'pending' meant "admin already entered final numbers,
--    awaiting payment", which is what 'approved' means in the new
--    four-state machine - not a new state describing new data.

-- ---------------------------------------------------------------------
-- Cleaning CRM: crm_payroll
-- ---------------------------------------------------------------------

alter table public.crm_payroll rename column base_salary to base_pay_earned;

alter table public.crm_payroll
  add column if not exists standard_biweekly_pay numeric(12, 2) not null default 75000,
  add column if not exists standard_working_days integer not null default 10,
  add column if not exists days_present integer not null default 0,
  add column if not exists approved_paid_days integer not null default 0,
  add column if not exists unpaid_absence_days integer not null default 0,
  add column if not exists total_payable_days integer not null default 0,
  add column if not exists other_additions numeric(12, 2) not null default 0,
  add column if not exists payment_method text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.crm_users(id) on delete set null,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references public.crm_users(id) on delete set null,
  add column if not exists reopen_reason text;

-- Both old status-shaped check constraints have to come off *before* the
-- data migration below - 'approved' isn't a value either one allows (the
-- pairing constraint's "not paid" branch only ever matched 'pending'), so
-- updating any row to 'approved' while either is still active would
-- itself fail the check it's trying to satisfy. Then re-add both,
-- tightened, once every row already holds a value they allow.
alter table public.crm_payroll drop constraint if exists crm_payroll_status_check;
alter table public.crm_payroll drop constraint if exists crm_payroll_status_payment_date_pairing;

update public.crm_payroll set status = 'approved' where status = 'pending';

alter table public.crm_payroll
  add constraint crm_payroll_status_check check (status in ('draft', 'approved', 'paid', 'cancelled'));
alter table public.crm_payroll
  add constraint crm_payroll_status_payment_date_pairing check (
    (status = 'paid' and actual_payment_date is not null)
    or (status <> 'paid' and actual_payment_date is null)
  );

alter table public.crm_payroll drop constraint if exists crm_payroll_amounts_nonnegative;
alter table public.crm_payroll
  add constraint crm_payroll_amounts_nonnegative check (
    base_pay_earned >= 0 and internet_allowance >= 0 and bonus_commission >= 0
    and other_additions >= 0 and deductions >= 0
  );

alter table public.crm_payroll
  add constraint crm_payroll_pay_structure_positive check (
    standard_biweekly_pay >= 0 and standard_working_days > 0
  ),
  add constraint crm_payroll_day_counts_nonnegative check (
    days_present >= 0 and approved_paid_days >= 0 and unpaid_absence_days >= 0 and total_payable_days >= 0
  );

-- total_pay must be dropped and re-added to change its generation
-- expression (Postgres has no ALTER ... SET EXPRESSION) - recomputes
-- from the same inputs plus the new other_additions column, which is 0
-- on every pre-existing row, so every existing total_pay value is
-- unchanged by this round-trip.
alter table public.crm_payroll drop column total_pay;
alter table public.crm_payroll
  add column total_pay numeric(12, 2) generated always as (
    base_pay_earned + internet_allowance + bonus_commission + other_additions - deductions
  ) stored;

-- Hard stop on editing a Paid record at the database level, not just in
-- application code - "Prevent ordinary edits to Paid payroll records."
-- The only way out of a Paid row is to change its status away from
-- 'paid' (the reopen path in payroll actions.ts), which this trigger
-- explicitly allows; an update that leaves status at 'paid' always
-- fails, including from a service-role/admin session.
create or replace function public.crm_payroll_prevent_paid_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'paid' and new.status = 'paid' then
    raise exception 'Paid payroll records cannot be edited directly. Reopen the record first.';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_payroll_prevent_paid_edit_trigger on public.crm_payroll;
create trigger crm_payroll_prevent_paid_edit_trigger
  before update on public.crm_payroll
  for each row execute function public.crm_payroll_prevent_paid_edit();

-- Append-only audit trail: every create/attendance-adjustment/incentive/
-- deduction/status-change action writes one row per distinct change here.
-- No update/delete policy for anyone, including admins - once written, a
-- log entry is permanent.
create table if not exists public.crm_payroll_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  payroll_id uuid not null references public.crm_payroll(id) on delete cascade,
  agent_id uuid not null references public.crm_users(id) on delete cascade,
  action text not null check (action in (
    'created', 'attendance_loaded', 'days_adjusted', 'incentive_changed',
    'deduction_changed', 'addition_changed', 'notes_updated',
    'approved', 'marked_paid', 'cancelled', 'reopened'
  )),
  performed_by uuid references public.crm_users(id) on delete set null,
  performed_by_name text not null,
  reason text,
  details jsonb,
  constraint crm_payroll_audit_log_reason_required check (
    action not in ('days_adjusted', 'incentive_changed', 'deduction_changed', 'addition_changed', 'cancelled', 'reopened')
    or (reason is not null and length(trim(reason)) > 0)
  )
);

create index if not exists crm_payroll_audit_log_payroll_idx
  on public.crm_payroll_audit_log(payroll_id, created_at desc);

alter table public.crm_payroll_audit_log enable row level security;

create policy "crm_payroll_audit_log_admin_select"
  on public.crm_payroll_audit_log for select
  using (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_payroll_audit_log_admin_insert"
  on public.crm_payroll_audit_log for insert
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Lead Generation CRM: leadgen_payroll (identical shape, mirrored)
-- ---------------------------------------------------------------------

alter table public.leadgen_payroll rename column base_salary to base_pay_earned;

alter table public.leadgen_payroll
  add column if not exists standard_biweekly_pay numeric(12, 2) not null default 75000,
  add column if not exists standard_working_days integer not null default 10,
  add column if not exists days_present integer not null default 0,
  add column if not exists approved_paid_days integer not null default 0,
  add column if not exists unpaid_absence_days integer not null default 0,
  add column if not exists total_payable_days integer not null default 0,
  add column if not exists other_additions numeric(12, 2) not null default 0,
  add column if not exists payment_method text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.leadgen_users(id) on delete set null,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references public.leadgen_users(id) on delete set null,
  add column if not exists reopen_reason text;

alter table public.leadgen_payroll drop constraint if exists leadgen_payroll_status_check;
alter table public.leadgen_payroll drop constraint if exists leadgen_payroll_status_payment_date_pairing;

update public.leadgen_payroll set status = 'approved' where status = 'pending';

alter table public.leadgen_payroll
  add constraint leadgen_payroll_status_check check (status in ('draft', 'approved', 'paid', 'cancelled'));
alter table public.leadgen_payroll
  add constraint leadgen_payroll_status_payment_date_pairing check (
    (status = 'paid' and actual_payment_date is not null)
    or (status <> 'paid' and actual_payment_date is null)
  );

alter table public.leadgen_payroll drop constraint if exists leadgen_payroll_amounts_nonnegative;
alter table public.leadgen_payroll
  add constraint leadgen_payroll_amounts_nonnegative check (
    base_pay_earned >= 0 and internet_allowance >= 0 and bonus_commission >= 0
    and other_additions >= 0 and deductions >= 0
  );

alter table public.leadgen_payroll
  add constraint leadgen_payroll_pay_structure_positive check (
    standard_biweekly_pay >= 0 and standard_working_days > 0
  ),
  add constraint leadgen_payroll_day_counts_nonnegative check (
    days_present >= 0 and approved_paid_days >= 0 and unpaid_absence_days >= 0 and total_payable_days >= 0
  );

alter table public.leadgen_payroll drop column total_pay;
alter table public.leadgen_payroll
  add column total_pay numeric(12, 2) generated always as (
    base_pay_earned + internet_allowance + bonus_commission + other_additions - deductions
  ) stored;

create or replace function public.leadgen_payroll_prevent_paid_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'paid' and new.status = 'paid' then
    raise exception 'Paid payroll records cannot be edited directly. Reopen the record first.';
  end if;
  return new;
end;
$$;

drop trigger if exists leadgen_payroll_prevent_paid_edit_trigger on public.leadgen_payroll;
create trigger leadgen_payroll_prevent_paid_edit_trigger
  before update on public.leadgen_payroll
  for each row execute function public.leadgen_payroll_prevent_paid_edit();

create table if not exists public.leadgen_payroll_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  payroll_id uuid not null references public.leadgen_payroll(id) on delete cascade,
  agent_id uuid not null references public.leadgen_users(id) on delete cascade,
  action text not null check (action in (
    'created', 'attendance_loaded', 'days_adjusted', 'incentive_changed',
    'deduction_changed', 'addition_changed', 'notes_updated',
    'approved', 'marked_paid', 'cancelled', 'reopened'
  )),
  performed_by uuid references public.leadgen_users(id) on delete set null,
  performed_by_name text not null,
  reason text,
  details jsonb,
  constraint leadgen_payroll_audit_log_reason_required check (
    action not in ('days_adjusted', 'incentive_changed', 'deduction_changed', 'addition_changed', 'cancelled', 'reopened')
    or (reason is not null and length(trim(reason)) > 0)
  )
);

create index if not exists leadgen_payroll_audit_log_payroll_idx
  on public.leadgen_payroll_audit_log(payroll_id, created_at desc);

alter table public.leadgen_payroll_audit_log enable row level security;

create policy "leadgen_payroll_audit_log_admin_select"
  on public.leadgen_payroll_audit_log for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_payroll_audit_log_admin_insert"
  on public.leadgen_payroll_audit_log for insert
  with check (public.leadgen_user_role(auth.uid()) = 'admin');
