-- Fast call logging for every outbound call, separate from the qualified
-- lead/opportunity pipelines. Agents can see and create only their own
-- rows; admins can review every agent in their own CRM.
--
-- The two tables deliberately remain separate because the Lead Generation
-- and Growth CRMs have separate user pools and RLS boundaries.

create table if not exists public.leadgen_call_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent_id uuid not null references public.leadgen_users(id) on delete restrict,
  business_name text not null check (length(trim(business_name)) > 0),
  phone text not null check (length(trim(phone)) > 0),
  outcome text not null check (outcome in (
    'No Answer', 'Voicemail', 'Gatekeeper', 'Not Interested', 'Callback'
  )),
  notes text not null check (length(trim(notes)) > 0)
);

create index if not exists leadgen_call_logs_agent_created_idx
  on public.leadgen_call_logs(agent_id, created_at desc);

alter table public.leadgen_call_logs enable row level security;

create policy "leadgen_call_logs_admin_all"
  on public.leadgen_call_logs for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_call_logs_agent_select_own"
  on public.leadgen_call_logs for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and agent_id = auth.uid()
  );

create policy "leadgen_call_logs_agent_insert_own"
  on public.leadgen_call_logs for insert
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and agent_id = auth.uid()
  );

create table if not exists public.crm_call_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent_id uuid not null references public.crm_users(id) on delete restrict,
  business_name text not null check (length(trim(business_name)) > 0),
  phone text not null check (length(trim(phone)) > 0),
  outcome text not null check (outcome in (
    'No Answer', 'Voicemail', 'Gatekeeper', 'Not Interested', 'Callback'
  )),
  notes text not null check (length(trim(notes)) > 0)
);

create index if not exists crm_call_logs_agent_created_idx
  on public.crm_call_logs(agent_id, created_at desc);

alter table public.crm_call_logs enable row level security;

create policy "crm_call_logs_admin_all"
  on public.crm_call_logs for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_call_logs_agent_select_own"
  on public.crm_call_logs for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and agent_id = auth.uid()
  );

create policy "crm_call_logs_agent_insert_own"
  on public.crm_call_logs for insert
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and agent_id = auth.uid()
  );

comment on table public.leadgen_call_logs is
  'All Lead Generation CRM outbound call attempts, including calls that never become leads.';
comment on table public.crm_call_logs is
  'All Growth CRM outbound call attempts, including calls that never become opportunities.';
