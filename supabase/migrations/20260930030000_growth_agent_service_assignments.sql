-- Growth CRM: Admin-controlled Agent Service Assignment.
--
-- Each Growth CRM agent is assigned by Admin to Lead Generation, Business
-- Finance, or Both. An agent only sees/works Growth records of the service(s)
-- assigned to them; Admin (and every non-agent role) is unaffected.
--
-- Design constraints honoured here:
--  * NO existing policy is dropped or changed. Enforcement is layered on with
--    RESTRICTIVE policies, which are AND-ed with the existing permissive ones.
--  * NO data is deleted or rewritten. Changing an assignment only changes what
--    an agent can currently see; every call, note, opportunity, appointment
--    and email stays in place for Admin reporting, and re-assigning restores
--    access with nothing recreated.
--  * Lead Generation CRM rows are untouched: the call-list policies below only
--    restrict crm = 'growth' segments (and leads/logs belonging to them).
--  * Existing agents are backfilled as 'both', so nothing changes until Admin
--    chooses. An agent with no assignment row can work no Growth service.

create table if not exists public.crm_agent_service_assignments (
  agent_id uuid primary key references public.crm_users(id) on delete cascade,
  service text not null check (service in ('lead_generation', 'business_financing', 'both')),
  assigned_by uuid references public.crm_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_agent_service_assignments enable row level security;

create policy "crm_agent_service_assignments_admin_all"
  on public.crm_agent_service_assignments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- An agent can read only their own row (never write it).
create policy "crm_agent_service_assignments_select_own"
  on public.crm_agent_service_assignments for select
  using (agent_id = auth.uid());

-- Minimum Data API privileges: no anon access; signed-in users can read (RLS
-- narrows to own row / admin) and admins write through RLS. No delete/truncate.
revoke all on public.crm_agent_service_assignments from public, anon, authenticated;
grant select, insert, update on public.crm_agent_service_assignments to authenticated;

-- Backfill: existing agents keep their current access.
insert into public.crm_agent_service_assignments (agent_id, service)
select id, 'both' from public.crm_users where role = 'agent'
on conflict (agent_id) do nothing;

-- ---------------------------------------------------------------------
-- Helpers (security definer so the checks are not themselves subject to RLS).
-- Only role = 'agent' is restricted; admin, subcontractor and users without a
-- crm_users row (e.g. Lead Generation-only users) pass through unchanged.
-- A 'both_services' record requires a 'both' assignment.
-- ---------------------------------------------------------------------
create or replace function public.crm_agent_service_ok(uid uuid, record_service text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.crm_user_role(uid) is distinct from 'agent' then true
    else exists (
      select 1 from public.crm_agent_service_assignments a
      where a.agent_id = uid
        and (
          a.service = 'both'
          or (a.service = 'lead_generation' and record_service = 'lead_generation')
          or (a.service = 'business_financing' and record_service = 'business_financing')
        )
    )
  end;
$$;

create or replace function public.crm_agent_opportunity_service_ok(uid uuid, target_opportunity_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.crm_user_role(uid) is distinct from 'agent' then true
    else exists (
      select 1 from public.crm_opportunities o
      where o.id = target_opportunity_id
        and public.crm_agent_service_ok(uid, o.opportunity_type)
    )
  end;
$$;

create or replace function public.crm_agent_segment_service_ok(uid uuid, target_segment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.crm_user_role(uid) is distinct from 'agent' then true
    else exists (
      select 1 from public.call_list_segments s
      where s.id = target_segment_id
        and (s.crm <> 'growth' or public.crm_agent_service_ok(uid, s.growth_opportunity_type))
    )
  end;
$$;

revoke execute on function public.crm_agent_service_ok(uuid, text) from public, anon;
revoke execute on function public.crm_agent_opportunity_service_ok(uuid, uuid) from public, anon;
revoke execute on function public.crm_agent_segment_service_ok(uuid, uuid) from public, anon;
grant execute on function public.crm_agent_service_ok(uuid, text) to authenticated;
grant execute on function public.crm_agent_opportunity_service_ok(uuid, uuid) to authenticated;
grant execute on function public.crm_agent_segment_service_ok(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RESTRICTIVE policies: AND-ed with every existing policy on these tables.
-- ---------------------------------------------------------------------
create policy "crm_opportunities_agent_service_scope"
  on public.crm_opportunities as restrictive for all to authenticated
  using (public.crm_agent_service_ok(auth.uid(), opportunity_type));

create policy "crm_opportunity_scores_agent_service_scope"
  on public.crm_opportunity_scores as restrictive for all to authenticated
  using (public.crm_agent_opportunity_service_ok(auth.uid(), opportunity_id));

create policy "crm_followups_agent_service_scope"
  on public.crm_followups as restrictive for all to authenticated
  using (opportunity_id is null or public.crm_agent_opportunity_service_ok(auth.uid(), opportunity_id));

create policy "crm_activities_agent_service_scope"
  on public.crm_activities as restrictive for all to authenticated
  using (opportunity_id is null or public.crm_agent_opportunity_service_ok(auth.uid(), opportunity_id));

create policy "crm_lead_emails_agent_service_scope"
  on public.crm_lead_emails as restrictive for all to authenticated
  using (opportunity_id is null or public.crm_agent_opportunity_service_ok(auth.uid(), opportunity_id));

create policy "winsalot_appointments_agent_service_scope"
  on public.winsalot_appointments as restrictive for all to authenticated
  using (public.crm_agent_service_ok(auth.uid(), service_type));

create policy "call_list_segments_agent_service_scope"
  on public.call_list_segments as restrictive for all to authenticated
  using (crm <> 'growth' or public.crm_agent_service_ok(auth.uid(), growth_opportunity_type));

create policy "call_list_leads_agent_service_scope"
  on public.call_list_leads as restrictive for all to authenticated
  using (public.crm_agent_segment_service_ok(auth.uid(), segment_id));

create policy "crm_call_logs_agent_service_scope"
  on public.crm_call_logs as restrictive for all to authenticated
  using (call_list_segment_id is null or public.crm_agent_segment_service_ok(auth.uid(), call_list_segment_id));
