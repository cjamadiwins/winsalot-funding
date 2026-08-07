-- Cleaning CRM payroll: one record per agent per biweekly pay period.
-- Admin-managed (create/edit/mark paid); an agent can only ever read
-- their own rows - never another agent's, never write at all. That's
-- enforced here at the RLS level (crm_payroll_admin_all /
-- crm_payroll_agent_select_own below), not just by hiding UI, so a
-- session-scoped request can't reach another agent's salary even if the
-- client code were somehow bypassed.
--
-- Completely separate from leadgen_payroll (migration 0055): this CRM's
-- agents (crm_users) and the Lead Generation CRM's agents (leadgen_users)
-- are two independent people/tables (see crm-auth.ts / leadgen-auth.ts -
-- "must never be able to grant access based on a crm_users row or vice
-- versa"), so there is no shared-agent double-payment risk to guard
-- against between the two CRMs. The unique (agent_id, payday) constraint
-- below only guards against an admin accidentally double-entering the
-- same agent's same pay period within this one table.
--
-- total_pay is a generated column (base_salary + internet_allowance +
-- bonus_commission - deductions), same "let the database compute it once
-- so every reader agrees" rationale as crm_attendance.total_hours.
-- Attendance is intentionally NOT read here - payroll is not
-- auto-deducted from clock-in/out data.

create table if not exists public.crm_payroll (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent_id uuid not null references public.crm_users(id) on delete cascade,
  pay_period_start date not null,
  pay_period_end date not null,
  payday date not null,
  base_salary numeric(12, 2) not null default 0,
  internet_allowance numeric(12, 2) not null default 0,
  bonus_commission numeric(12, 2) not null default 0,
  deductions numeric(12, 2) not null default 0,
  total_pay numeric(12, 2) generated always as (
    base_salary + internet_allowance + bonus_commission - deductions
  ) stored,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  -- Set exactly when status = 'paid', cleared otherwise - enforced below
  -- by crm_payroll_status_payment_date_pairing, not just app code.
  actual_payment_date date,
  admin_notes text,
  created_by uuid references public.crm_users(id) on delete set null,
  constraint crm_payroll_amounts_nonnegative check (
    base_salary >= 0 and internet_allowance >= 0 and bonus_commission >= 0 and deductions >= 0
  ),
  constraint crm_payroll_period_order check (pay_period_end > pay_period_start),
  constraint crm_payroll_payday_on_or_after_period_end check (payday >= pay_period_end),
  constraint crm_payroll_status_payment_date_pairing check (
    (status = 'paid' and actual_payment_date is not null)
    or (status = 'pending' and actual_payment_date is null)
  ),
  constraint crm_payroll_one_record_per_agent_per_payday unique (agent_id, payday)
);

create index if not exists crm_payroll_agent_idx on public.crm_payroll(agent_id, payday desc);

create or replace function public.crm_payroll_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_payroll_set_updated_at
  before update on public.crm_payroll
  for each row execute function public.crm_payroll_set_updated_at();

alter table public.crm_payroll enable row level security;

create policy "crm_payroll_admin_all"
  on public.crm_payroll for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- No insert/update/delete policy for agents at all - the absence of a
-- policy denies the operation outright, which is how "agents can never
-- edit payroll or mark themselves paid" is actually enforced.
create policy "crm_payroll_agent_select_own"
  on public.crm_payroll for select
  using (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent');
