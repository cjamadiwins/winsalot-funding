-- Agent Performance Report history (Lead Gen CRM): a permanent,
-- append-only ledger of each agent's Monday-Sunday weekly result, so the
-- weekly report's "current week" numbers (computed live from
-- leadgen_appointments, see leadgen-performance.ts) can keep resetting
-- every Monday without losing anything - and so a Monthly Performance
-- view has real history to show, independent of whichever appointment
-- rows still happen to exist.
--
-- Rows here are written by src/lib/leadgen-performance-history.ts's
-- syncLeadgenWeeklyPerformanceHistory(), never by end users - RLS below
-- only grants select. A row is inserted exactly once, the first time
-- that week is seen as fully completed (its Monday is before the
-- current week's Monday); it is then left alone forever, including if a
-- lead - and with it, appointments booked against it - is later deleted
-- (admin ability to delete leads, brief section 10, must keep working
-- and must not quietly rewrite a closed week). A cancellation that
-- happens before a week closes is already excluded, the same way the
-- live "current week" report excludes it (booking_agent_id/status
-- filtering is identical - see computeLeadgenWeekBookedCount). This
-- mirrors how a payroll or performance period, once closed, isn't
-- reopened by later edits to the underlying records.
create table if not exists public.leadgen_agent_weekly_performance (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.leadgen_users(id) on delete set null,
  agent_name text not null,
  week_start date not null,
  week_end date not null,
  booked_count integer not null,
  target integer not null,
  percentage integer not null,
  status text not null,
  created_at timestamptz not null default now(),
  constraint leadgen_agent_weekly_performance_unique unique (agent_id, week_start)
);

create index if not exists leadgen_agent_weekly_performance_agent_idx
  on public.leadgen_agent_weekly_performance(agent_id, week_start desc);

alter table public.leadgen_agent_weekly_performance enable row level security;

create policy "leadgen_agent_weekly_performance_admin_all"
  on public.leadgen_agent_weekly_performance for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_agent_weekly_performance_agent_select_own"
  on public.leadgen_agent_weekly_performance for select
  using (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');
