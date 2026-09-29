-- Keep promoted leads in their original campaign until historical reporting can be reconciled.
create or replace function public.leadgen_transfer_ottawa_painter(
  p_lead_id uuid, p_target_campaign_id uuid, p_admin_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $transfer$
declare
  v_lead public.call_list_leads%rowtype;
  v_from public.call_list_segments%rowtype;
  v_target public.leadgen_campaigns%rowtype;
  v_from_client text;
  v_target_client text;
  v_target_client_active boolean;
  v_category text;
  v_name text;
  v_to uuid;
  v_goodness uuid;
  v_promoted public.leadgen_leads%rowtype;
begin
  if not exists (select 1 from public.leadgen_users where id=p_admin_id and role='admin' and active=true) then
    raise exception 'An active Lead CRM Admin is required';
  end if;
  select * into v_lead from public.call_list_leads where id=p_lead_id for update;
  if not found or v_lead.removed_at is not null then raise exception 'Active call-list lead not found'; end if;
  select * into v_from from public.call_list_segments where id=v_lead.segment_id;
  if v_from.crm <> 'lead_generation'
     or v_from.source_file_name not like 'campaign-125288-search-924570-painters_ottawa-on-canada%.csv'
     or v_from.status <> 'active' then
    raise exception 'Only active Ottawa Painters production leads may be transferred';
  end if;
  v_category := v_lead.extra_fields->>'website_category';
  if v_category not in ('no_website','website_review') then raise exception 'Admin-review rows must be resolved before transfer'; end if;
  select cl.name into v_from_client from public.leadgen_campaigns c
    join public.leadgen_clients cl on cl.id=c.client_id where c.id=v_from.leadgen_campaign_id;
  select * into v_target from public.leadgen_campaigns where id=p_target_campaign_id;
  if not found then raise exception 'Destination campaign not found'; end if;
  select name,active into v_target_client,v_target_client_active from public.leadgen_clients where id=v_target.client_id;
  if v_from_client not in ('Hidebrandt Web Services','Web6 Solutions')
     or v_target_client not in ('Hidebrandt Web Services','Web6 Solutions')
     or v_from_client=v_target_client or v_target.status<>'active' or not v_target_client_active then
    raise exception 'Select the other active Hidebrandt or Web6 campaign';
  end if;
  select id into strict v_goodness from auth.users where email='ogbonnagoodness44@gmail.com';
  if v_lead.assigned_agent_id <> v_goodness then raise exception 'Lead is no longer assigned to Goodness'; end if;
  if not exists (select 1 from public.call_list_segment_agents where segment_id=v_from.id and agent_id=v_goodness) then
    raise exception 'Source segment roster no longer matches Goodness';
  end if;

  if v_lead.promoted_leadgen_lead_id is not null then
    raise exception 'Promoted leads require a separate history and reporting review before transfer';
  end if;

  v_name := 'Painters — Ottawa, Ontario — '
    || case v_category when 'no_website' then 'No Website' else 'Website Review' end
    || case v_target_client when 'Web6 Solutions' then ' — Web6' else '' end
    || ' — Goodness Ugbana';
  select id into v_to from public.call_list_segments
    where crm='lead_generation' and leadgen_campaign_id=v_target.id and name=v_name
      and source_file_name=v_from.source_file_name and status='active';
  if v_to is null then
    insert into public.call_list_segments
      (crm,name,leadgen_campaign_id,status,created_by,campaign_name,industry,territory,source_file_name,source_file_type,total_uploaded_rows,deployed_at,deployed_by)
    values ('lead_generation',v_name,v_target.id,'active',p_admin_id,v_target.name,'Painting Companies','Ottawa, Ontario',
      v_from.source_file_name,'csv',0,now(),p_admin_id)
    returning id into v_to;
    insert into public.call_list_segment_agents(segment_id,agent_id) values(v_to,v_goodness);
  elsif not exists (select 1 from public.call_list_segment_agents where segment_id=v_to and agent_id=v_goodness) then
    raise exception 'Destination segment roster does not match Goodness';
  end if;

  update public.call_list_leads set segment_id=v_to where id=v_lead.id;
  insert into private.leadgen_ottawa_painter_transfers
    (call_list_lead_id,from_segment_id,to_segment_id,from_campaign_id,to_campaign_id,changed_by)
  values (v_lead.id,v_from.id,v_to,v_from.leadgen_campaign_id,v_target.id,p_admin_id);
  return v_to;
end;
$transfer$;
revoke all on function public.leadgen_transfer_ottawa_painter(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.leadgen_transfer_ottawa_painter(uuid,uuid,uuid) to service_role;
