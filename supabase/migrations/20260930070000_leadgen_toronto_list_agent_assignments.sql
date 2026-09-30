-- Lead Generation CRM: Toronto list -> agent assignments, per Admin.
--   Goodness Ugbana -> Toronto Auto Repair + Toronto Home Renovation (Hidebrandt Web Services)
--   Henry Osuji     -> Toronto Pest Control (Teknokraft Canada Inc.)
--
-- Roster (call_list_segment_agents) + client access only, plus one attribution
-- correction:
--   * Only the ACTIVE Toronto lists' rosters change (Admin-only drafts have none).
--   * Each agent gets the client campaign that owns their lists (no-op if held).
--   * Henry's 33 existing Pest Control calls were recorded under the internal test
--     client/campaign while the lists sat there. They belong to the Toronto Pest
--     Control campaign Henry now works, so ONLY their client_id/campaign_id move to
--     Teknokraft / Toronto Pest Control. Agent, outcome, notes, timestamps and the
--     call-list link are untouched; no row is created or deleted.
--   * No other campaign, list, lead, call log, appointment, note or DNC record changes.
-- Guarded: raises (rolling everything back) unless exactly the expected rows exist.

do $fix$
declare
  v_hid uuid;
  v_tek uuid;
  v_tek_client uuid;
  v_test_client uuid;
  v_goodness uuid;
  v_henry uuid;
  v_admin uuid;
  v_n integer;
begin
  select c.id into strict v_hid
  from public.leadgen_campaigns c join public.leadgen_clients cl on cl.id = c.client_id
  where cl.name = 'Hidebrandt Web Services' and cl.active
    and c.name = 'Hidebrandt Web Services – Website Services Lead Generation' and c.status = 'active';

  select c.id, c.client_id into strict v_tek, v_tek_client
  from public.leadgen_campaigns c join public.leadgen_clients cl on cl.id = c.client_id
  where cl.name = 'Teknokraft Canada Inc.' and cl.active
    and c.name = 'Teknokraft Canada Inc. — Toronto Pest Control' and c.status = 'active';

  select id into strict v_test_client from public.leadgen_clients where name = 'Winsalot Corp. Test' and is_internal_test;
  select id into strict v_goodness from auth.users where email = 'ogbonnagoodness44@gmail.com';
  select id into strict v_henry from auth.users where email = 'henryosuji2@gmail.com';
  select id into strict v_admin from auth.users where email = 'cjamadiwins@gmail.com';

  -- Expected active lists: 6 Auto Repair + 6 Home Renovation on Hidebrandt, 6 Pest Control on Teknokraft.
  select count(*) into v_n from public.call_list_segments
   where crm = 'lead_generation' and status = 'active' and leadgen_campaign_id = v_hid
     and (source_file_name like 'campaign-125195-search-923402-auto-repair-shop_toronto%'
       or source_file_name like 'campaign-125196-search-923436-home-renovations-and-repair_toronto%');
  if v_n <> 12 then raise exception 'Expected 12 active Toronto Auto Repair/Home Renovation lists, found %', v_n; end if;
  select count(*) into v_n from public.call_list_segments
   where crm = 'lead_generation' and status = 'active' and leadgen_campaign_id = v_tek
     and source_file_name like 'campaign-125197-search-923437-pest-control-service_toronto%';
  if v_n <> 6 then raise exception 'Expected 6 active Toronto Pest Control lists, found %', v_n; end if;

  -- Client access (idempotent; existing assignments untouched).
  insert into public.leadgen_campaign_agents (campaign_id, agent_id, assigned_by) values (v_hid, v_goodness, v_admin), (v_tek, v_henry, v_admin)
  on conflict (campaign_id, agent_id) do nothing;

  -- Goodness works every active Toronto Auto Repair + Home Renovation list; Henry is taken off them.
  delete from public.call_list_segment_agents sa using public.call_list_segments s
   where sa.segment_id = s.id and s.crm = 'lead_generation' and s.status = 'active' and s.leadgen_campaign_id = v_hid
     and (s.source_file_name like 'campaign-125195-search-923402-auto-repair-shop_toronto%'
       or s.source_file_name like 'campaign-125196-search-923436-home-renovations-and-repair_toronto%')
     and sa.agent_id <> v_goodness;
  insert into public.call_list_segment_agents (segment_id, agent_id)
  select s.id, v_goodness from public.call_list_segments s
   where s.crm = 'lead_generation' and s.status = 'active' and s.leadgen_campaign_id = v_hid
     and (s.source_file_name like 'campaign-125195-search-923402-auto-repair-shop_toronto%'
       or s.source_file_name like 'campaign-125196-search-923436-home-renovations-and-repair_toronto%')
  on conflict (segment_id, agent_id) do nothing;

  -- Henry works every active Toronto Pest Control list; Goodness is taken off them.
  delete from public.call_list_segment_agents sa using public.call_list_segments s
   where sa.segment_id = s.id and s.crm = 'lead_generation' and s.status = 'active' and s.leadgen_campaign_id = v_tek
     and s.source_file_name like 'campaign-125197-search-923437-pest-control-service_toronto%'
     and sa.agent_id <> v_henry;
  insert into public.call_list_segment_agents (segment_id, agent_id)
  select s.id, v_henry from public.call_list_segments s
   where s.crm = 'lead_generation' and s.status = 'active' and s.leadgen_campaign_id = v_tek
     and s.source_file_name like 'campaign-125197-search-923437-pest-control-service_toronto%'
  on conflict (segment_id, agent_id) do nothing;

  -- Attribution correction for Henry's existing Pest Control calls (client/campaign only).
  select count(*) into v_n from public.leadgen_call_logs g
   where g.call_list_segment_id in (select id from public.call_list_segments where crm = 'lead_generation' and leadgen_campaign_id = v_tek
           and source_file_name like 'campaign-125197-search-923437-pest-control-service_toronto%');
  if v_n <> 33 then raise exception 'Expected 33 call logs on the Toronto Pest Control lists, found %', v_n; end if;
  select count(*) into v_n from public.leadgen_call_logs g
   where g.call_list_segment_id in (select id from public.call_list_segments where crm = 'lead_generation' and leadgen_campaign_id = v_tek
           and source_file_name like 'campaign-125197-search-923437-pest-control-service_toronto%')
     and g.agent_id = v_henry and g.client_id = v_test_client;
  if v_n <> 33 then raise exception 'Expected all 33 Pest Control calls to be Henry''s and on the test client, found %', v_n; end if;

  update public.leadgen_call_logs g set client_id = v_tek_client, campaign_id = v_tek
   where g.agent_id = v_henry and g.client_id = v_test_client
     and g.call_list_segment_id in (select id from public.call_list_segments where crm = 'lead_generation' and leadgen_campaign_id = v_tek
           and source_file_name like 'campaign-125197-search-923437-pest-control-service_toronto%');
  get diagnostics v_n = row_count;
  if v_n <> 33 then raise exception 'Attribution correction updated % call logs instead of 33', v_n; end if;
end;
$fix$;
