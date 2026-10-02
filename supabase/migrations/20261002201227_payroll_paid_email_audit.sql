-- Centralized Winsalot payroll notification ownership. Existing payroll,
-- attendance and audit tables are untouched. No historical sends/backfill.
begin;
create table public.payroll_email_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent_id uuid not null references auth.users(id),
  pay_period_start date not null,
  pay_period_end date not null,
  source_crm text not null check (source_crm in ('growth', 'leadgen')),
  source_payroll_id uuid not null,
  finalized_by uuid references auth.users(id),
  status text not null check (status in ('pending','sent','delivered','delayed','bounced','complained','opened','clicked','failed','unknown','suppressed')),
  status_at timestamptz not null default now(),
  to_email text,
  resend_email_id text unique,
  error text,
  sent_at timestamptz, delivered_at timestamptz, delayed_at timestamptz,
  bounced_at timestamptz, complained_at timestamptz, opened_at timestamptz,
  clicked_at timestamptz, failed_at timestamptz,
  constraint payroll_email_one_per_agent_period unique (agent_id, pay_period_start, pay_period_end),
  constraint payroll_email_one_per_record unique (source_crm, source_payroll_id),
  constraint payroll_email_valid_period check (pay_period_end >= pay_period_start)
);
alter table public.payroll_email_notifications enable row level security;
-- Server-only claim/history writes and verified webhooks. Existing Admin
-- pages read only periods returned by their existing session/RLS queries.
revoke all on public.payroll_email_notifications from public, anon, authenticated;
grant select, insert, update on public.payroll_email_notifications to service_role;
commit;
