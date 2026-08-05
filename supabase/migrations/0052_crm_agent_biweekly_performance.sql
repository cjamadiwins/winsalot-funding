-- Agent Performance Report history (Cleaning CRM): a permanent,
-- append-only ledger of each agent's two-week result, mirroring
-- leadgen_agent_weekly_performance (migration 0051) for the Lead Gen
-- CRM's weekly report. Lets a Monthly Performance view roll up real
-- history without depending only on the live "last 8 periods" computed
-- by computeCrmAgentPerformance (lib/crm-performance.ts), which reads
-- through crm_leads - and a lead that's not yet in a CLOSED_STAGE can
-- still be deleted (deleteLeadAction, crm/leads/[id]/actions.ts; only
-- closed leads are protected by crm_leads_prevent_closed_delete_trigger,
-- migration 0024). Deleting such a lead would silently erase whatever
-- quotes-sent/received credit it had already contributed to a past,
-- otherwise-completed period if that period were only ever computed
-- live. Freezing a completed period here the first time it's seen fixes
-- that: the row is written once (insert-only, never rewritten
-- afterward - see the sync module, leadgen-performance-history-sync.ts's
-- Cleaning CRM counterpart), so it survives a later lead deletion the
-- same way a closed accounting period isn't reopened by later edits to
-- the underlying records.
create table if not exists public.crm_agent_biweekly_performance (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.crm_users(id) on delete set null,
  agent_name text not null,
  period_start date not null,
  period_end date not null,
  quotes_sent integer not null,
  quotes_sent_target integer not null,
  quotes_sent_percentage integer not null,
  quotes_received integer not null,
  quotes_received_target integer not null,
  quotes_received_percentage integer not null,
  overall_percentage integer not null,
  status text not null,
  created_at timestamptz not null default now(),
  constraint crm_agent_biweekly_performance_unique unique (agent_id, period_start)
);

create index if not exists crm_agent_biweekly_performance_agent_idx
  on public.crm_agent_biweekly_performance(agent_id, period_start desc);

alter table public.crm_agent_biweekly_performance enable row level security;

create policy "crm_agent_biweekly_performance_admin_all"
  on public.crm_agent_biweekly_performance for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_agent_biweekly_performance_agent_select_own"
  on public.crm_agent_biweekly_performance for select
  using (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent');
