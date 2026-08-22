-- Leave Requests (Cleaning CRM): agents submit planned/emergency leave
-- requests, admins review and decide them, and an approved/declined
-- decision can flow into that agent's attendance record and payroll
-- (crm_payroll, migration 0063) without duplicating or hard-coding any
-- pay figures. Entirely separate from leadgen_leave_requests (migration
-- 0070) - same "two CRMs, two independent agent pools" rule as every
-- other table in this app (crm_payroll vs leadgen_payroll, etc).
--
-- notice_days/is_short_notice are computed by the submitting Server
-- Action at insert time (not a generated column - "now()" isn't
-- immutable, and the number of days' notice is fixed the instant the
-- request is submitted, it should never silently change later if e.g.
-- the request sits pending for a week).
create table if not exists public.crm_leave_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.crm_users(id) on delete cascade,
  leave_type text not null check (leave_type in ('planned', 'emergency')),
  start_date date not null,
  end_date date not null,
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  notice_days integer not null default 0,
  is_short_notice boolean not null default false,
  submitted_at timestamptz not null default now(),

  -- Admin decision.
  decision_note text,
  decided_by uuid references public.crm_users(id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,

  -- Attendance integration: once decided, an admin marks the applicable
  -- date range as either Paid Leave (approved) or Unapproved Absence -
  -- Unpaid (declined, agent didn't work). One request can only ever be
  -- marked one way - it mirrors that single decision, not a separate
  -- per-day attendance log.
  attendance_status text not null default 'none' check (attendance_status in ('none', 'paid_leave', 'unpaid_absence')),
  attendance_marked_at timestamptz,
  attendance_marked_by uuid references public.crm_users(id) on delete set null,
  attendance_marked_by_name text,

  -- Payroll deduction for an unpaid absence - computed from the agent's
  -- own current daily rate (see src/lib/payroll.ts, never a hard-coded
  -- figure), reviewed and explicitly confirmed by an admin before it is
  -- applied to a real crm_payroll row. payroll_applied_id is set the
  -- moment either this deduction (unpaid absence) or the paid-leave day
  -- count (approved) is actually folded into a payroll record, and is
  -- the sole guard against ever applying the same absence/leave twice.
  deduction_amount numeric(12, 2),
  deduction_reason text,
  deduction_confirmed boolean not null default false,
  deduction_confirmed_by uuid references public.crm_users(id) on delete set null,
  deduction_confirmed_by_name text,
  deduction_confirmed_at timestamptz,
  payroll_applied_id uuid references public.crm_payroll(id) on delete set null,
  payroll_applied_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_leave_requests_date_range check (end_date >= start_date),
  constraint crm_leave_requests_deduction_nonnegative check (deduction_amount is null or deduction_amount >= 0)
);

create index if not exists crm_leave_requests_agent_idx on public.crm_leave_requests(agent_id, start_date desc);
create index if not exists crm_leave_requests_status_idx on public.crm_leave_requests(status);

create or replace function public.crm_leave_requests_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_leave_requests_set_updated_at_trigger on public.crm_leave_requests;
create trigger crm_leave_requests_set_updated_at_trigger
  before update on public.crm_leave_requests
  for each row execute function public.crm_leave_requests_set_updated_at();

alter table public.crm_leave_requests enable row level security;

create policy "crm_leave_requests_admin_all"
  on public.crm_leave_requests for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_leave_requests_agent_select_own"
  on public.crm_leave_requests for select
  using (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent');

-- An agent may only ever insert a brand-new, plain pending request for
-- themselves - every admin-only/decision field must be at its default,
-- so an agent can never self-approve, back-date a decision, or seed a
-- payroll deduction through the insert itself. No agent update/delete
-- policy exists at all - once submitted, only an admin (via the policy
-- above) can change a request. This is a deliberate absence, not an
-- oversight, matching every other agent-writable table in this CRM
-- (crm_attendance, crm_payroll, etc).
create policy "crm_leave_requests_agent_insert_own"
  on public.crm_leave_requests for insert
  with check (
    agent_id = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and attendance_status = 'none'
    and deduction_confirmed = false
    and payroll_applied_id is null
  );

-- Append-only audit trail for the leave-request lifecycle (submitted,
-- approved, declined, attendance marked, deduction confirmed/applied) -
-- same shape and same "no update/delete for anyone, ever" rule as
-- crm_payroll_audit_log (migration 0063). Written exclusively via the
-- service-role client from trusted Server Action code (see
-- src/lib/leave-requests-audit.ts), including the agent's own
-- "submitted" entry, so a single admin-only RLS insert policy is enough -
-- there is no client-reachable path that inserts here directly under the
-- agent's own session.
create table if not exists public.crm_leave_request_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  leave_request_id uuid not null references public.crm_leave_requests(id) on delete cascade,
  agent_id uuid references public.crm_users(id) on delete set null,
  agent_name text not null,
  action text not null check (action in (
    'submitted', 'approved', 'declined',
    'attendance_marked_paid_leave', 'attendance_marked_unpaid_absence',
    'deduction_confirmed', 'payroll_applied'
  )),
  performed_by uuid references public.crm_users(id) on delete set null,
  performed_by_name text not null,
  note text,
  details jsonb
);

create index if not exists crm_leave_request_audit_log_request_idx
  on public.crm_leave_request_audit_log(leave_request_id, created_at desc);

alter table public.crm_leave_request_audit_log enable row level security;

create policy "crm_leave_request_audit_log_admin_select"
  on public.crm_leave_request_audit_log for select
  using (public.crm_user_role(auth.uid()) = 'admin');
