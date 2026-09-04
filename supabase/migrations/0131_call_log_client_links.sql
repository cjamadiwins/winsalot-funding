-- Link every new call log to the client/business whose campaign the agent
-- is working. Existing rows remain readable with a null client_id so no
-- historical call data is discarded.

alter table public.leadgen_call_logs
  add column if not exists client_id uuid references public.leadgen_clients(id) on delete restrict;

alter table public.crm_call_logs
  add column if not exists client_id uuid references public.crm_clients(id) on delete restrict;

create index if not exists leadgen_call_logs_client_created_idx
  on public.leadgen_call_logs(client_id, created_at desc);

create index if not exists crm_call_logs_client_created_idx
  on public.crm_call_logs(client_id, created_at desc);

-- A narrow, non-financial list of the Growth CRM clients assigned to the
-- signed-in agent. Pilot accounts are included because agents may work them
-- before they move to Active.
create or replace function public.crm_agent_call_log_clients()
returns table (id uuid, company_name text)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.company_name
  from public.crm_clients c
  join public.crm_client_agents ca on ca.client_id = c.id
  where ca.agent_id = auth.uid()
    and c.status in ('Prospect', 'Pilot', 'Active')
  order by c.company_name;
$$;

revoke all on function public.crm_agent_call_log_clients() from public;
grant execute on function public.crm_agent_call_log_clients() to authenticated;

-- Used by RLS so a forged client_id cannot attach a call to another agent's
-- client. SECURITY DEFINER is required because crm_client_agents itself is
-- intentionally admin-only.
create or replace function public.crm_agent_call_log_client_allowed(uid uuid, target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.crm_client_agents ca
    join public.crm_clients c on c.id = ca.client_id
    where ca.agent_id = uid
      and ca.client_id = target_client_id
      and c.status in ('Prospect', 'Pilot', 'Active')
  );
$$;

revoke all on function public.crm_agent_call_log_client_allowed(uuid, uuid) from public;
grant execute on function public.crm_agent_call_log_client_allowed(uuid, uuid) to authenticated;

drop policy if exists "leadgen_call_logs_agent_insert_own" on public.leadgen_call_logs;
create policy "leadgen_call_logs_agent_insert_own"
  on public.leadgen_call_logs for insert
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and agent_id = auth.uid()
    and client_id is not null
    and exists (
      select 1
      from public.leadgen_campaigns campaign
      where campaign.client_id = leadgen_call_logs.client_id
        and campaign.status = 'active'
        and public.leadgen_agent_campaign_allowed(auth.uid(), campaign.id)
    )
  );

drop policy if exists "crm_call_logs_agent_insert_own" on public.crm_call_logs;
create policy "crm_call_logs_agent_insert_own"
  on public.crm_call_logs for insert
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and agent_id = auth.uid()
    and client_id is not null
    and public.crm_agent_call_log_client_allowed(auth.uid(), client_id)
  );

comment on column public.leadgen_call_logs.client_id is
  'Required for new agent call logs; identifies the client/business campaign being worked.';
comment on column public.crm_call_logs.client_id is
  'Required for new agent call logs; identifies the assigned client/business being worked.';
