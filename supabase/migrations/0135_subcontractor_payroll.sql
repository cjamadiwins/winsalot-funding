-- Subcontractor Payments: a dedicated payroll subsystem for people who are
-- NOT crm_users/leadgen_users agents - no login, no attendance, no
-- approved-paid-day/leave rules, none of the employee payroll machinery in
-- crm_payroll/leadgen_payroll (migrations 0054/0055/0063). Entirely
-- additive and entirely separate: nothing here alters crm_payroll,
-- leadgen_payroll, crm_users, leadgen_users, holidays, or any existing
-- table/column/row.
--
-- Mirrors the crm_payroll / leadgen_payroll split (two independent CRMs,
-- two independent tables, same shape) rather than the shared-table
-- pattern holidays uses - a subcontractor is scoped to one CRM's admin
-- area, same as an employee payroll record is.
--
-- One row per subcontractor (crm_subcontractors / leadgen_subcontractors):
-- their profile - name, optional Business/Client link, country, currency,
-- pay type/rate, notes, active flag. One row per payment period
-- (crm_subcontractor_payments / leadgen_subcontractor_payments): the
-- actual payroll history - gross pay, adjustments, deductions, status,
-- payment date. For quantity-based pay types (hourly, daily,
-- per_lead_appointment) gross_pay is quantity x pay_rate, entered and
-- computed at the application layer (same "computed once, stored" choice
-- crm_payroll.base_pay_earned makes) rather than as a generated column,
-- since a flat pay type (fixed/weekly/biweekly/monthly) has no quantity
-- to multiply and just stores its own gross_pay directly.
--
-- Admin-only RLS throughout (single `_admin_all` policy per table, no
-- agent policy at all) - same "financial data is administrator-only"
-- posture already used for crm_clients/crm_invoices (migration 0091):
-- subcontractors aren't agents, have no login, and have no "read their
-- own row" case to support.

-- ---------------------------------------------------------------------
-- Winsalot Growth CRM
-- ---------------------------------------------------------------------

create table if not exists public.crm_subcontractors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,

  full_name text not null,
  -- Optional - "Where appropriate, allow a subcontractor to be linked to
  -- a specific Business/Client." Nullable: plenty of subcontractors work
  -- generally for Winsalot Corp, not one specific client account.
  business_client_id uuid references public.crm_clients(id) on delete set null,
  country text,
  currency text not null default 'USD'
    check (currency in ('NGN', 'PHP', 'CAD', 'USD', 'GBP', 'EUR')),
  pay_type text not null
    check (pay_type in ('fixed', 'hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'per_lead_appointment')),
  -- The rate/fixed-amount this subcontractor is normally paid - per hour/
  -- day/lead for quantity-based pay types, or the flat amount per period
  -- for fixed/weekly/biweekly/monthly. Individual payment records below
  -- can still differ (e.g. a one-off adjustment), this is just the
  -- default the payment form starts from.
  pay_rate numeric(12, 2) not null default 0 check (pay_rate >= 0),
  notes text,
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.crm_users(id) on delete set null
);

create index if not exists crm_subcontractors_active_idx on public.crm_subcontractors(active);
create index if not exists crm_subcontractors_business_client_idx on public.crm_subcontractors(business_client_id);

create or replace function public.crm_subcontractors_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_subcontractors_set_updated_at on public.crm_subcontractors;
create trigger crm_subcontractors_set_updated_at
  before update on public.crm_subcontractors
  for each row execute function public.crm_subcontractors_set_updated_at();

alter table public.crm_subcontractors enable row level security;

create policy "crm_subcontractors_admin_all"
  on public.crm_subcontractors for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create table if not exists public.crm_subcontractor_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,

  subcontractor_id uuid not null references public.crm_subcontractors(id) on delete cascade,
  period_start date not null,
  period_end date not null,

  -- Approved hours/days/leads-or-appointments for this period - only
  -- meaningful (and only ever set) for the three quantity-based pay
  -- types; null for fixed/weekly/biweekly/monthly.
  quantity numeric(12, 2) check (quantity is null or quantity >= 0),
  gross_pay numeric(12, 2) not null default 0 check (gross_pay >= 0),
  adjustments numeric(12, 2) not null default 0 check (adjustments >= 0),
  deductions numeric(12, 2) not null default 0 check (deductions >= 0),
  net_pay numeric(12, 2) generated always as (gross_pay + adjustments - deductions) stored,

  status text not null default 'pending' check (status in ('pending', 'approved', 'paid')),
  -- Set exactly when status = 'paid', cleared otherwise - same pairing
  -- rule crm_payroll_status_payment_date_pairing enforces for employee
  -- payroll (migration 0054/0063).
  payment_date date,
  notes text,

  constraint crm_subcontractor_payments_period_order check (period_end >= period_start),
  constraint crm_subcontractor_payments_payment_date_pairing check (
    (status = 'paid' and payment_date is not null)
    or (status <> 'paid' and payment_date is null)
  )
);

create index if not exists crm_subcontractor_payments_subcontractor_idx
  on public.crm_subcontractor_payments(subcontractor_id, period_start desc);

create or replace function public.crm_subcontractor_payments_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_subcontractor_payments_set_updated_at on public.crm_subcontractor_payments;
create trigger crm_subcontractor_payments_set_updated_at
  before update on public.crm_subcontractor_payments
  for each row execute function public.crm_subcontractor_payments_set_updated_at();

alter table public.crm_subcontractor_payments enable row level security;

create policy "crm_subcontractor_payments_admin_all"
  on public.crm_subcontractor_payments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Lead Generation CRM (identical shape, mirrored)
-- ---------------------------------------------------------------------

create table if not exists public.leadgen_subcontractors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.leadgen_users(id) on delete set null,

  full_name text not null,
  business_client_id uuid references public.leadgen_clients(id) on delete set null,
  country text,
  currency text not null default 'USD'
    check (currency in ('NGN', 'PHP', 'CAD', 'USD', 'GBP', 'EUR')),
  pay_type text not null
    check (pay_type in ('fixed', 'hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'per_lead_appointment')),
  pay_rate numeric(12, 2) not null default 0 check (pay_rate >= 0),
  notes text,
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.leadgen_users(id) on delete set null
);

create index if not exists leadgen_subcontractors_active_idx on public.leadgen_subcontractors(active);
create index if not exists leadgen_subcontractors_business_client_idx on public.leadgen_subcontractors(business_client_id);

create or replace function public.leadgen_subcontractors_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leadgen_subcontractors_set_updated_at on public.leadgen_subcontractors;
create trigger leadgen_subcontractors_set_updated_at
  before update on public.leadgen_subcontractors
  for each row execute function public.leadgen_subcontractors_set_updated_at();

alter table public.leadgen_subcontractors enable row level security;

create policy "leadgen_subcontractors_admin_all"
  on public.leadgen_subcontractors for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create table if not exists public.leadgen_subcontractor_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.leadgen_users(id) on delete set null,

  subcontractor_id uuid not null references public.leadgen_subcontractors(id) on delete cascade,
  period_start date not null,
  period_end date not null,

  quantity numeric(12, 2) check (quantity is null or quantity >= 0),
  gross_pay numeric(12, 2) not null default 0 check (gross_pay >= 0),
  adjustments numeric(12, 2) not null default 0 check (adjustments >= 0),
  deductions numeric(12, 2) not null default 0 check (deductions >= 0),
  net_pay numeric(12, 2) generated always as (gross_pay + adjustments - deductions) stored,

  status text not null default 'pending' check (status in ('pending', 'approved', 'paid')),
  payment_date date,
  notes text,

  constraint leadgen_subcontractor_payments_period_order check (period_end >= period_start),
  constraint leadgen_subcontractor_payments_payment_date_pairing check (
    (status = 'paid' and payment_date is not null)
    or (status <> 'paid' and payment_date is null)
  )
);

create index if not exists leadgen_subcontractor_payments_subcontractor_idx
  on public.leadgen_subcontractor_payments(subcontractor_id, period_start desc);

create or replace function public.leadgen_subcontractor_payments_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leadgen_subcontractor_payments_set_updated_at on public.leadgen_subcontractor_payments;
create trigger leadgen_subcontractor_payments_set_updated_at
  before update on public.leadgen_subcontractor_payments
  for each row execute function public.leadgen_subcontractor_payments_set_updated_at();

alter table public.leadgen_subcontractor_payments enable row level security;

create policy "leadgen_subcontractor_payments_admin_all"
  on public.leadgen_subcontractor_payments for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');
