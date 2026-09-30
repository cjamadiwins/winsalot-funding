-- Lead Generation CRM: remove a client from an agent, and (optionally) hand
-- that agent's ACTIVE call lists for the same client to another eligible agent,
-- in one atomic operation.
--
-- Additive only: one new function, no table/column/policy changes. It only ever
-- writes leadgen_campaign_agents (client assignment), call_list_segment_agents
-- (current call-list roster, active lists only) and leadgen_users.current_campaign_id
-- (Primary client). It never touches call logs, leads, lead ownership, appointments,
-- follow-ups, emails, notes, DNC records, reports or completed/draft lists.
--
-- Everything runs inside the function's single transaction: any RAISE EXCEPTION
-- rolls back every change, so there is no "client removed but lists still owned"
-- state. Execute is granted to service_role only (called from an admin-checked
-- server action); RLS on the tables stays untouched.

create or replace function public.leadgen_remove_agent_client(
  p_agent_id uuid,
  p_client_id uuid,
  p_list_mode text default 'none',            -- none | reassign | unassign
  p_reassign_to uuid default null,
  p_primary_action text default 'keep',       -- keep | clear | set
  p_new_primary_client uuid default null,
  p_confirm_unrestricted boolean default false,
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
  if p_list_mode not in ('none', 'reassign', 'unassign') then
    raise exception 'Invalid list option.';
  end if;
  if p_primary_action not in ('keep', 'clear', 'set') then
    raise exception 'Invalid Primary option.';
  end if;

  if not exists (select 1 from leadgen_users where id = p_agent_id and role = 'agent') then
    raise exception 'Agent not found.';
  end if;
  select name into v_client_name from leadgen_clients where id = p_client_id;
  if v_client_name is null then
    raise exception 'Client not found.';
  end if;

  select coalesce(array_agg(id), '{}') into v_campaigns from leadgen_campaigns where client_id = p_client_id;

  select count(*) into v_total_rows from leadgen_campaign_agents where agent_id = p_agent_id;
  select count(*) into v_client_rows from leadgen_campaign_agents where agent_id = p_agent_id and campaign_id = any (v_campaigns);

  select current_campaign_id into v_current_campaign from leadgen_users where id = p_agent_id;
  v_primary_affected := v_current_campaign is not null and v_current_campaign = any (v_campaigns);

  -- Active call lists belonging to this client that the agent is currently on.
  -- "Active" = status 'active' (the only production-calling state); draft,
  -- completed and archived lists are never selected.
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb),
         coalesce(array_agg(s.id), '{}')
    into v_active_lists, v_list_ids
  from call_list_segments s
  join call_list_segment_agents a on a.segment_id = s.id and a.agent_id = p_agent_id
  where s.crm = 'lead_generation' and s.status = 'active' and s.leadgen_campaign_id = any (v_campaigns);

  -- Eligible replacements: active agents, not the removed agent, already
  -- assigned to this client.
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', coalesce(u.full_name, u.email)) order by coalesce(u.full_name, u.email)), '[]'::jsonb)
    into v_eligible
  from leadgen_users u
  where u.role = 'agent' and u.active = true and u.id <> p_agent_id
    and exists (select 1 from leadgen_campaign_agents ca where ca.agent_id = u.id and ca.campaign_id = any (v_campaigns));

  -- Other clients this agent stays assigned to (Primary candidates).
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name), '[]'::jsonb)
    into v_other_clients
  from leadgen_clients c
  where c.id <> p_client_id and c.active = true
    and exists (
      select 1 from leadgen_campaign_agents ca join leadgen_campaigns cp on cp.id = ca.campaign_id
      where ca.agent_id = p_agent_id and cp.client_id = c.id
    );

  select count(*) into v_owned_leads
  from leadgen_leads where assigned_agent_id = p_agent_id and campaign_id = any (v_campaigns);

  if p_dry_run then
    return jsonb_build_object(
      'clientName', v_client_name,
      'assigned', v_client_rows > 0,
      'lastAssignment', v_client_rows > 0 and v_total_rows - v_client_rows <= 0,
      'primaryAffected', v_primary_affected,
      'activeLists', v_active_lists,
      'eligibleAgents', v_eligible,
      'otherClients', v_other_clients,
      'leadsStillOwned', v_owned_leads
    );
  end if;

  if v_client_rows > 0 and v_total_rows - v_client_rows <= 0 and not p_confirm_unrestricted then
    raise exception 'This is the agent''s last assigned client. With none assigned they can see every client - confirm to continue.';
  end if;

  if array_length(v_list_ids, 1) is not null then
    if p_list_mode = 'none' then
      raise exception 'This agent is on active call lists for this client. Choose to reassign them or remove the agent from them.';
    end if;

    if p_list_mode = 'reassign' then
      if p_reassign_to is null or not exists (select 1 from jsonb_array_elements(v_eligible) e where (e->>'id')::uuid = p_reassign_to) then
        raise exception 'Choose an eligible agent assigned to this client to take over the call lists.';
      end if;
      insert into call_list_segment_agents (segment_id, agent_id)
        select unnest(v_list_ids), p_reassign_to
        on conflict (segment_id, agent_id) do nothing;
      get diagnostics v_moved = row_count;
      -- The new agent must have access to each list's campaign (RLS).
      insert into leadgen_campaign_agents (campaign_id, agent_id, assigned_by)
        select distinct s.leadgen_campaign_id, p_reassign_to, p_admin_id
        from call_list_segments s
        where s.id = any (v_list_ids)
          and not exists (select 1 from leadgen_campaign_agents x where x.campaign_id = s.leadgen_campaign_id and x.agent_id = p_reassign_to)
          and exists (select 1 from leadgen_campaign_agents y where y.agent_id = p_reassign_to)
        on conflict (campaign_id, agent_id) do nothing;
    end if;

    delete from call_list_segment_agents where agent_id = p_agent_id and segment_id = any (v_list_ids);
  end if;

  delete from leadgen_campaign_agents where agent_id = p_agent_id and campaign_id = any (v_campaigns);

  if v_primary_affected then
    if p_primary_action = 'keep' then
      raise exception 'Choose a new Primary client for this agent, or leave Primary unselected.';
    elsif p_primary_action = 'clear' then
      update leadgen_users set current_campaign_id = null where id = p_agent_id;
    else
      if p_new_primary_client is null or not exists (select 1 from jsonb_array_elements(v_other_clients) e where (e->>'id')::uuid = p_new_primary_client) then
        raise exception 'The new Primary client must be another client assigned to this agent.';
      end if;
      select id into v_new_primary_campaign from leadgen_campaigns
        where client_id = p_new_primary_client
          and exists (select 1 from leadgen_campaign_agents ca where ca.campaign_id = leadgen_campaigns.id and ca.agent_id = p_agent_id)
        order by (status = 'active') desc, created_at desc limit 1;
      update leadgen_users set current_campaign_id = v_new_primary_campaign where id = p_agent_id;
    end if;
  end if;

  return jsonb_build_object(
    'listsAffected', coalesce(array_length(v_list_ids, 1), 0),
    'listMode', p_list_mode,
    'leadsStillOwned', v_owned_leads
  );
end;
$$;

revoke all on function public.leadgen_remove_agent_client(uuid, uuid, text, uuid, text, uuid, boolean, uuid, boolean) from public, anon, authenticated;
grant execute on function public.leadgen_remove_agent_client(uuid, uuid, text, uuid, text, uuid, boolean, uuid, boolean) to service_role;
