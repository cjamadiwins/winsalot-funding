-- Leave Requests (Lead Generation CRM): identical shape and rules to
-- crm_leave_requests (migration 0069), mirrored against this CRM's own
-- entirely separate agent pool (leadgen_users / leadgen_user_role()) and
-- payroll table (leadgen_payroll). See 0069's header comment for the full
-- rationale - duplicated rather than shared, matching this codebase's
-- existing convention of keeping the two CRMs' data fully independent.
create table if not exists public.leadgen_leave_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.leadgen_users(id) on delete cascade,
  leave_type text not null check (leave_type in ('planned', 'emergency')),
  start_date date not null,
  end_date date not null,
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  notice_days integer not null default 0,
  is_short_notice boolean not null default false,
  submitted_at timestamptz not null default now(),

  decision_note text,
  decided_by uuid references public.leadgen_users(id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,

  attendance_status text not null default 'none' check (attendance_status in ('none', 'paid_leave', 'unpaid_absence')),
  attendance_marked_at timestamptz,
  attendance_marked_by uuid references public.leadgen_users(id) on delete set null,
  attendance_marked_by_name text,

  deduction_amount numeric(12, 2),
  deduction_reason text,
  deduction_confirmed boolean not null default false,
  deduction_confirmed_by uuid references public.leadgen_users(id) on delete set null,
  deduction_confirmed_by_name text,
  deduction_confirmed_at timestamptz,
  payroll_applied_id uuid references public.leadgen_payroll(id) on delete set null,
  payroll_applied_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leadgen_leave_requests_date_range check (end_date >= start_date),
  constraint leadgen_leave_requests_deduction_nonnegative check (deduction_amount is null or deduction_amount >= 0)
);

create index if not exists leadgen_leave_requests_agent_idx on public.leadgen_leave_requests(agent_id, start_date desc);
create index if not exists leadgen_leave_requests_status_idx on public.leadgen_leave_requests(status);

create or replace function public.leadgen_leave_requests_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leadgen_leave_requests_set_updated_at_trigger on public.leadgen_leave_requests;
create trigger leadgen_leave_requests_set_updated_at_trigger
  before update on public.leadgen_leave_requests
  for each row execute function public.leadgen_leave_requests_set_updated_at();

alter table public.leadgen_leave_requests enable row level security;

create policy "leadgen_leave_requests_admin_all"
  on public.leadgen_leave_requests for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_leave_requests_agent_select_own"
  on public.leadgen_leave_requests for select
  using (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');

create policy "leadgen_leave_requests_agent_insert_own"
  on public.leadgen_leave_requests for insert
  with check (
    agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and attendance_status = 'none'
    and deduction_confirmed = false
    and payroll_applied_id is null
  );

create table if not exists public.leadgen_leave_request_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  leave_request_id uuid not null references public.leadgen_leave_requests(id) on delete cascade,
  agent_id uuid references public.leadgen_users(id) on delete set null,
  agent_name text not null,
  action text not null check (action in (
    'submitted', 'approved', 'declined',
    'attendance_marked_paid_leave', 'attendance_marked_unpaid_absence',
    'deduction_confirmed', 'payroll_applied'
  )),
  performed_by uuid references public.leadgen_users(id) on delete set null,
  performed_by_name text not null,
  note text,
  details jsonb
);

create index if not exists leadgen_leave_request_audit_log_request_idx
  on public.leadgen_leave_request_audit_log(leave_request_id, created_at desc);

alter table public.leadgen_leave_request_audit_log enable row level security;

create policy "leadgen_leave_request_audit_log_admin_select"
  on public.leadgen_leave_request_audit_log for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');
