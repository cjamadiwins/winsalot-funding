-- Two access-control gaps to close before shipping agent invitations and
-- deactivation as real security boundaries:
--
-- 1. crm_users_select_active_members let any active CRM member (agent or
--    admin) read every row in crm_users - full_name, email, role, active
--    for every OTHER agent too. No agent-facing code actually needs the
--    full roster (only admin pages do), so agents should only ever see
--    their own row.
--
-- 2. crm_leads_agent_select_own / crm_leads_agent_update_own /
--    crm_activities_agent_select_own_lead / crm_activities_agent_insert_own_lead
--    only checked `assigned_agent_id = auth.uid()` - they never checked
--    that the caller is still an *active* agent. Deactivating an agent
--    (crm_users.active = false) didn't actually revoke their database-level
--    access to leads already assigned to them; only the application-code
--    checks in requireCrmUser() caught it. Adding a crm_user_role() check
--    closes this at the RLS layer too.

drop policy if exists "crm_users_select_active_members" on public.crm_users;

create policy "crm_users_select_self"
  on public.crm_users for select
  using (id = auth.uid());

create policy "crm_users_admin_select_all"
  on public.crm_users for select
  using (public.crm_user_role(auth.uid()) = 'admin');

drop policy if exists "crm_leads_agent_select_own" on public.crm_leads;

create policy "crm_leads_agent_select_own"
  on public.crm_leads for select
  using (assigned_agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent');

drop policy if exists "crm_leads_agent_update_own" on public.crm_leads;

create policy "crm_leads_agent_update_own"
  on public.crm_leads for update
  using (assigned_agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent')
  with check (assigned_agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent');

drop policy if exists "crm_activities_agent_select_own_lead" on public.crm_activities;

create policy "crm_activities_agent_select_own_lead"
  on public.crm_activities for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    )
  );

drop policy if exists "crm_activities_agent_insert_own_lead" on public.crm_activities;

create policy "crm_activities_agent_insert_own_lead"
  on public.crm_activities for insert
  with check (
    agent_id = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    )
  );
