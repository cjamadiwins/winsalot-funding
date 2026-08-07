-- Lead Generation CRM payroll: same shape and same admin/agent split as
-- crm_payroll (migration 0054), but a completely separate table scoped to
-- leadgen_users - this CRM's agents are a different pool of people from
-- the cleaning CRM's, so there is no shared-agent record to reuse or risk
-- double-paying (see the note in 0054_crm_payroll.sql). Uses this CRM's
-- own leadgen_user_role() RLS helper (migration 0031), never crm_user_role().
--
-- References leadgen_users(id) rather than auth.users(id) directly (unlike
-- leadgen_agent_attendance) so agent_id can only ever point at an actual
-- Lead Gen CRM member, matching leadgen_clients/leadgen_campaigns' own FK
-- convention.

create table if not exists public.leadgen_payroll (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent_id uuid not null references public.leadgen_users(id) on delete cascade,
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
  actual_payment_date date,
  admin_notes text,
  created_by uuid references public.leadgen_users(id) on delete set null,
  constraint leadgen_payroll_amounts_nonnegative check (
    base_salary >= 0 and internet_allowance >= 0 and bonus_commission >= 0 and deductions >= 0
  ),
  constraint leadgen_payroll_period_order check (pay_period_end > pay_period_start),
  constraint leadgen_payroll_payday_on_or_after_period_end check (payday >= pay_period_end),
  constraint leadgen_payroll_status_payment_date_pairing check (
    (status = 'paid' and actual_payment_date is not null)
    or (status = 'pending' and actual_payment_date is null)
  ),
  constraint leadgen_payroll_one_record_per_agent_per_payday unique (agent_id, payday)
);

create index if not exists leadgen_payroll_agent_idx on public.leadgen_payroll(agent_id, payday desc);

alter table public.leadgen_payroll enable row level security;

create policy "leadgen_payroll_admin_all"
  on public.leadgen_payroll for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- No insert/update/delete policy for agents - same "absence of a policy
-- is the enforcement" reasoning as crm_payroll_agent_select_own.
create policy "leadgen_payroll_agent_select_own"
  on public.leadgen_payroll for select
  using (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');
