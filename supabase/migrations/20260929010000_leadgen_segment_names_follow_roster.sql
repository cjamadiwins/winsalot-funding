-- Lead CRM segment labels follow the current roster. Only names are modified;
-- roster, leads, campaign links and history remain untouched.
create schema if not exists private;

create or replace function private.sync_leadgen_segment_name(p_segment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_segment public.call_list_segments%rowtype;
  v_agent_name text;
  v_count integer;
  v_base text;
  v_name text;
begin
  select * into v_segment from public.call_list_segments where id = p_segment_id for update;
  if not found or v_segment.crm <> 'lead_generation' then return; end if;

  -- Existing Admin-review labels take precedence even if a legacy roster exists.
  if v_segment.name ~* '(Admin Only|Review Required|Off-Category|Uncontactable|Duplicate Review)' then
    return;
  end if;
  if v_segment.status = 'draft' then return; end if;

  select count(*), max(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''))
    into v_count, v_agent_name
    from public.call_list_segment_agents sa
    join auth.users u on u.id = sa.agent_id
   where sa.segment_id = p_segment_id;
  -- A shared or unresolved roster has no single truthful agent suffix.
  if v_count <> 1 or v_agent_name is null then return; end if;

  v_base := v_segment.name;
  -- Strip an existing suffix only when it matches a real agent's profile name.
  select left(v_base, length(v_base) - length(' — ' || (u.raw_user_meta_data->>'full_name')))
    into v_name
    from auth.users u
   where nullif(btrim(u.raw_user_meta_data->>'full_name'), '') is not null
     and right(v_base, length(' — ' || (u.raw_user_meta_data->>'full_name'))) = ' — ' || (u.raw_user_meta_data->>'full_name')
   order by length(u.raw_user_meta_data->>'full_name') desc
   limit 1;
  v_base := coalesce(v_name, v_base);
  v_base := regexp_replace(v_base, ' \(segment [0-9a-f]{8}\)$', '');
  v_name := v_base || ' — ' || v_agent_name;
  if exists (select 1 from public.call_list_segments other where other.crm = 'lead_generation' and other.id <> p_segment_id and other.name = v_name) then
    v_name := coalesce(v_base, v_segment.name) || ' (segment ' || left(p_segment_id::text, 8) || ') — ' || v_agent_name;
  end if;
  if v_name is distinct from v_segment.name then
    update public.call_list_segments set name = v_name where id = p_segment_id;
  end if;
end;
$$;
revoke all on function private.sync_leadgen_segment_name(uuid) from public, anon, authenticated;

create or replace function private.leadgen_segment_roster_name_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_leadgen_segment_name(case when tg_op = 'DELETE' then old.segment_id else new.segment_id end);
  return null;
end;
$$;
revoke all on function private.leadgen_segment_roster_name_trigger() from public, anon, authenticated;

drop trigger if exists leadgen_segment_roster_name on public.call_list_segment_agents;
create trigger leadgen_segment_roster_name
  after insert or delete or update of agent_id, segment_id on public.call_list_segment_agents
  for each row execute function private.leadgen_segment_roster_name_trigger();

create or replace function private.leadgen_segment_status_name_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_leadgen_segment_name(new.id);
  return null;
end;
$$;
revoke all on function private.leadgen_segment_status_name_trigger() from public, anon, authenticated;

drop trigger if exists leadgen_segment_status_name on public.call_list_segments;
create trigger leadgen_segment_status_name
  after insert or update of name, status on public.call_list_segments
  for each row when (new.crm = 'lead_generation')
  execute function private.leadgen_segment_status_name_trigger();

-- Repair existing names using current assignments; the function is idempotent.
do $$ declare r record; begin
  for r in select id from public.call_list_segments where crm = 'lead_generation' loop
    perform private.sync_leadgen_segment_name(r.id);
  end loop;
end $$;
