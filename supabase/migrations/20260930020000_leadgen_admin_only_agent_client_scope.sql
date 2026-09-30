-- Lead Generation CRM: an agent works ONLY the clients Admin has currently
-- assigned to them (leadgen_campaign_agents). Zero assignments now means
-- "no clients", not "every client".
--
-- Additive/non-destructive: no rows, columns or tables are deleted or
-- rewritten. Removing an assignment only deletes the leadgen_campaign_agents
-- row; call logs, leads, appointments, notes, DNC, follow-ups, emails and the
-- call-list rosters (call_list_segment_agents) are preserved, so re-assigning
-- the same client restores access with nothing recreated or duplicated.
-- Admin policies are untouched (Admin stays unrestricted).

-- 1. Strict campaign gate (was: unrestricted when the agent has no rows).
create or replace function public.leadgen_agent_campaign_allowed(uid uuid, target_campaign_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target_campaign_id is not null
    and exists (
      select 1 from public.leadgen_campaign_agents
      where agent_id = uid and campaign_id = target_campaign_id
    );
$$;

create or replace function public.leadgen_agent_client_allowed(uid uuid, target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target_client_id is not null
    and exists (
      select 1 from public.leadgen_campaign_agents a
      join public.leadgen_campaigns c on c.id = a.campaign_id
      where a.agent_id = uid and c.client_id = target_client_id
    );
$$;

create or replace function public.leadgen_agent_segment_allowed(uid uuid, target_segment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.call_list_segments s
    join public.leadgen_campaign_agents a on a.campaign_id = s.leadgen_campaign_id and a.agent_id = uid
    where s.id = target_segment_id
  );
$$;

revoke execute on function public.leadgen_agent_client_allowed(uuid, uuid) from public, anon;
grant execute on function public.leadgen_agent_client_allowed(uuid, uuid) to authenticated;
revoke execute on function public.leadgen_agent_segment_allowed(uuid, uuid) from public, anon;
grant execute on function public.leadgen_agent_segment_allowed(uuid, uuid) to authenticated;

-- 2. Call lists and their leads: roster AND client assignment required.
drop policy if exists "call_list_segments_leadgen_agent_select_assigned" on public.call_list_segments;
create policy "call_list_segments_leadgen_agent_select_assigned"
  on public.call_list_segments for select
  using (
    crm = 'lead_generation'
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (select 1 from public.call_list_segment_agents sa where sa.segment_id = call_list_segments.id and sa.agent_id = auth.uid())
    and public.leadgen_agent_campaign_allowed(auth.uid(), leadgen_campaign_id)
  );

drop policy if exists "call_list_leads_leadgen_agent_select" on public.call_list_leads;
create policy "call_list_leads_leadgen_agent_select"
  on public.call_list_leads for select
  using (
    removed_at is null
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = call_list_leads.segment_id and s.crm = 'lead_generation'
        and s.status in ('active', 'completed') and sa.agent_id = auth.uid()
    )
    and public.leadgen_agent_segment_allowed(auth.uid(), segment_id)
  );

drop policy if exists "call_list_leads_leadgen_agent_update" on public.call_list_leads;
create policy "call_list_leads_leadgen_agent_update"
  on public.call_list_leads for update
  using (
    removed_at is null
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = call_list_leads.segment_id and s.crm = 'lead_generation'
        and s.status = 'active' and sa.agent_id = auth.uid()
    )
    and public.leadgen_agent_segment_allowed(auth.uid(), segment_id)
  )
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = call_list_leads.segment_id and s.crm = 'lead_generation'
        and s.status = 'active' and sa.agent_id = auth.uid()
    )
    and public.leadgen_agent_segment_allowed(auth.uid(), segment_id)
  );

-- 3. Call logs (client-specific ones) and follow-ups (via their lead, whose
--    own policy is campaign-gated above).
drop policy if exists "leadgen_call_logs_agent_select_own" on public.leadgen_call_logs;
create policy "leadgen_call_logs_agent_select_own"
  on public.leadgen_call_logs for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent' and agent_id = auth.uid()
    and (client_id is null or public.leadgen_agent_client_allowed(auth.uid(), client_id))
  );

drop policy if exists "leadgen_call_logs_agent_insert_own" on public.leadgen_call_logs;
create policy "leadgen_call_logs_agent_insert_own"
  on public.leadgen_call_logs for insert
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent' and agent_id = auth.uid()
    and (client_id is null or public.leadgen_agent_client_allowed(auth.uid(), client_id))
  );

drop policy if exists "leadgen_followups_agent_select_own" on public.leadgen_followups;
create policy "leadgen_followups_agent_select_own"
  on public.leadgen_followups for select
  using (
    agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent'
    and (lead_id is null or exists (select 1 from public.leadgen_leads l where l.id = leadgen_followups.lead_id))
  );

drop policy if exists "leadgen_followups_agent_insert_own" on public.leadgen_followups;
create policy "leadgen_followups_agent_insert_own"
  on public.leadgen_followups for insert
  with check (
    agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent'
    and (lead_id is null or exists (select 1 from public.leadgen_leads l where l.id = leadgen_followups.lead_id))
  );

drop policy if exists "leadgen_followups_agent_update_own" on public.leadgen_followups;
create policy "leadgen_followups_agent_update_own"
  on public.leadgen_followups for update
  using (
    agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent'
    and (lead_id is null or exists (select 1 from public.leadgen_leads l where l.id = leadgen_followups.lead_id))
  )
  with check (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');

-- 4. Agents can only read the clients/campaigns they are assigned to.
drop policy if exists "leadgen_clients_agent_select" on public.leadgen_clients;
create policy "leadgen_clients_agent_select"
  on public.leadgen_clients for select
  using (public.leadgen_user_role(auth.uid()) = 'agent' and public.leadgen_agent_client_allowed(auth.uid(), id));

drop policy if exists "leadgen_campaigns_agent_select" on public.leadgen_campaigns;
create policy "leadgen_campaigns_agent_select"
  on public.leadgen_campaigns for select
  using (public.leadgen_user_role(auth.uid()) = 'agent' and public.leadgen_agent_campaign_allowed(auth.uid(), id));

-- 5. Agents can never pick/switch their own client: close the self-service RPC.
revoke execute on function public.set_my_leadgen_current_campaign(uuid) from public, anon, authenticated;

-- 6. Admin removal: no "last assignment => sees everything" confirmation any
--    more, active call lists no longer block removal (their rosters are kept
--    but inert, so re-assigning restores them), and a Primary pointing at the
--    removed client is always cleared/replaced.
create or replace function public.leadgen_remove_agent_client(
  p_agent_id uuid,
  p_client_id uuid,
  p_list_mode text default 'none',            -- none (roster kept, inert) | reassign | unassign
  p_reassign_to uuid default null,
  p_primary_action text default 'keep',       -- keep|clear => clear; set => another assigned client
  p_new_primary_client uuid default null,
  p_confirm_unrestricted boolean default false, -- ignored; kept for signature compatibility
  p_admin_id uuid default null,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaigns uuid[];
  v_client_name text;
  v_total_rows int;
  v_client_rows int;
  v_current_campaign uuid;
  v_primary_affected boolean;
  v_active_lists jsonb;
  v_list_ids uuid[];
  v_eligible jsonb;
  v_other_clients jsonb;
  v_owned_leads int;
  v_new_primary_campaign uuid;
  v_moved int := 0;
begin
  if p_list_mode not in ('none', 'reassign', 'unassign') then raise exception 'Invalid list option.'; end if;
  if p_primary_action not in ('keep', 'clear', 'set') then raise exception 'Invalid Primary option.'; end if;
  if not exists (select 1 from leadgen_users where id = p_agent_id and role = 'agent') then raise exception 'Agent not found.'; end if;
  select name into v_client_name from leadgen_clients where id = p_client_id;
  if v_client_name is null then raise exception 'Client not found.'; end if;

  select coalesce(array_agg(id), '{}') into v_campaigns from leadgen_campaigns where client_id = p_client_id;
  select count(*) into v_total_rows from leadgen_campaign_agents where agent_id = p_agent_id;
  select count(*) into v_client_rows from leadgen_campaign_agents where agent_id = p_agent_id and campaign_id = any (v_campaigns);
  select current_campaign_id into v_current_campaign from leadgen_users where id = p_agent_id;
  v_primary_affected := v_current_campaign is not null and v_current_campaign = any (v_campaigns);

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb), coalesce(array_agg(s.id), '{}')
    into v_active_lists, v_list_ids
  from call_list_segments s
  join call_list_segment_agents a on a.segment_id = s.id and a.agent_id = p_agent_id
  where s.crm = 'lead_generation' and s.status = 'active' and s.leadgen_campaign_id = any (v_campaigns);

  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', coalesce(u.full_name, u.email)) order by coalesce(u.full_name, u.email)), '[]'::jsonb)
    into v_eligible
  from leadgen_users u
  where u.role = 'agent' and u.active = true and u.id <> p_agent_id
    and exists (select 1 from leadgen_campaign_agents ca where ca.agent_id = u.id and ca.campaign_id = any (v_campaigns));

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name), '[]'::jsonb)
    into v_other_clients
  from leadgen_clients c
  where c.id <> p_client_id and c.active = true
    and exists (select 1 from leadgen_campaign_agents ca join leadgen_campaigns cp on cp.id = ca.campaign_id where ca.agent_id = p_agent_id and cp.client_id = c.id);

  select count(*) into v_owned_leads from leadgen_leads where assigned_agent_id = p_agent_id and campaign_id = any (v_campaigns);

  if p_dry_run then
    return jsonb_build_object(
      'clientName', v_client_name, 'assigned', v_client_rows > 0,
      'lastAssignment', v_client_rows > 0 and v_total_rows - v_client_rows <= 0,
      'primaryAffected', v_primary_affected, 'activeLists', v_active_lists,
      'eligibleAgents', v_eligible, 'otherClients', v_other_clients, 'leadsStillOwned', v_owned_leads);
  end if;

  if array_length(v_list_ids, 1) is not null and p_list_mode = 'reassign' then
    if p_reassign_to is null or not exists (select 1 from jsonb_array_elements(v_eligible) e where (e->>'id')::uuid = p_reassign_to) then
      raise exception 'Choose an eligible agent assigned to this client to take over the call lists.';
    end if;
    insert into call_list_segment_agents (segment_id, agent_id)
      select unnest(v_list_ids), p_reassign_to on conflict (segment_id, agent_id) do nothing;
    get diagnostics v_moved = row_count;
  end if;
  -- 'reassign' / 'unassign' take the agent off the list roster; 'none' keeps it
  -- (inert while unassigned) so a later re-assignment restores it untouched.
  if array_length(v_list_ids, 1) is not null and p_list_mode in ('reassign', 'unassign') then
    delete from call_list_segment_agents where agent_id = p_agent_id and segment_id = any (v_list_ids);
  end if;

  delete from leadgen_campaign_agents where agent_id = p_agent_id and campaign_id = any (v_campaigns);

  if v_primary_affected then
    if p_primary_action = 'set' then
      if p_new_primary_client is null or not exists (select 1 from jsonb_array_elements(v_other_clients) e where (e->>'id')::uuid = p_new_primary_client) then
        raise exception 'The new Primary client must be another client assigned to this agent.';
      end if;
      select id into v_new_primary_campaign from leadgen_campaigns
        where client_id = p_new_primary_client
          and exists (select 1 from leadgen_campaign_agents ca where ca.campaign_id = leadgen_campaigns.id and ca.agent_id = p_agent_id)
        order by (status = 'active') desc, created_at desc limit 1;
      update leadgen_users set current_campaign_id = v_new_primary_campaign where id = p_agent_id;
    else
      update leadgen_users set current_campaign_id = null where id = p_agent_id;
    end if;
  end if;

  return jsonb_build_object('listsAffected', case when p_list_mode = 'none' then 0 else coalesce(array_length(v_list_ids, 1), 0) end, 'listMode', p_list_mode, 'leadsStillOwned', v_owned_leads);
end;
$$;

revoke all on function public.leadgen_remove_agent_client(uuid, uuid, text, uuid, text, uuid, boolean, uuid, boolean) from public, anon, authenticated;
grant execute on function public.leadgen_remove_agent_client(uuid, uuid, text, uuid, text, uuid, boolean, uuid, boolean) to service_role;
