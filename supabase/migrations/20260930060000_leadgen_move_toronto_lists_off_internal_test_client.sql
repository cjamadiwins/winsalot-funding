-- Lead Generation CRM: take the internal test client ("Winsalot Corp. Test") off
-- the Toronto production call lists, per Admin's decision:
--   Auto Repair (campaign-125195...)      -> Hidebrandt Web Services
--   Home Renovation (campaign-125196...)  -> Hidebrandt Web Services
--   Pest Control (campaign-125197...)     -> Teknokraft Canada Inc. (new Toronto Pest
--                                            Control campaign, same pattern as its other
--                                            city campaigns)
--
-- Relationship repoint only. Nothing is deleted, recreated or re-imported:
--   * call_list_leads, call_list_segment_agents (agent rosters), call logs,
--     appointments, notes, DNC records and every existing agent/client assignment
--     are untouched. Historical call logs keep the client they were recorded under.
--   * Only call_list_segments.leadgen_campaign_id / campaign_name change, plus one
--     new Teknokraft campaign and - so "assigned to Teknokraft" still means all of
--     its campaigns - a campaign row for agents who already hold Teknokraft.
--   * No agent is newly given Hidebrandt or Teknokraft: an agent who doesn't hold a
--     list's client simply can't see it until Admin assigns that client.
-- Guarded: raises (rolling everything back) unless exactly the expected lists are found.

do $fix$
declare
  v_old uuid;
  v_hid uuid;
  v_tek_client uuid;
  v_tek uuid;
  v_admin uuid;
  v_hid_name text;
  v_tek_name text := 'Teknokraft Canada Inc. — Toronto Pest Control';
  v_n integer;
begin
  select c.id into strict v_old
  from public.leadgen_campaigns c join public.leadgen_clients cl on cl.id = c.client_id
  where cl.name = 'Winsalot Corp. Test' and cl.is_internal_test = true and c.name = 'Website Design Lead Generation';

  select c.id, c.name into strict v_hid, v_hid_name
  from public.leadgen_campaigns c join public.leadgen_clients cl on cl.id = c.client_id
  where cl.name = 'Hidebrandt Web Services' and cl.active = true
    and c.name = 'Hidebrandt Web Services – Website Services Lead Generation' and c.status = 'active';

  select id into strict v_tek_client from public.leadgen_clients where name = 'Teknokraft Canada Inc.' and active = true;
  select id into strict v_admin from auth.users where email = 'cjamadiwins@gmail.com';

  -- Expected: 8 Auto Repair + 8 Home Renovation + 8 Pest Control (6 active + 2 Admin-only drafts each).
  select count(*) into v_n from public.call_list_segments
   where crm = 'lead_generation' and leadgen_campaign_id = v_old and source_file_name like 'campaign-125195-search-923402-auto-repair-shop_toronto%';
  if v_n <> 8 then raise exception 'Expected 8 Toronto Auto Repair lists under the test campaign, found %', v_n; end if;
  select count(*) into v_n from public.call_list_segments
   where crm = 'lead_generation' and leadgen_campaign_id = v_old and source_file_name like 'campaign-125196-search-923436-home-renovations-and-repair_toronto%';
  if v_n <> 8 then raise exception 'Expected 8 Toronto Home Renovation lists under the test campaign, found %', v_n; end if;
  select count(*) into v_n from public.call_list_segments
   where crm = 'lead_generation' and leadgen_campaign_id = v_old and source_file_name like 'campaign-125197-search-923437-pest-control-service_toronto%';
  if v_n <> 8 then raise exception 'Expected 8 Toronto Pest Control lists under the test campaign, found %', v_n; end if;
  select count(*) into v_n from public.call_list_segments where crm = 'lead_generation' and leadgen_campaign_id = v_old;
  if v_n <> 24 then raise exception 'Expected exactly 24 lists under the test campaign, found %', v_n; end if;

  -- Auto Repair + Home Renovation -> Hidebrandt
  update public.call_list_segments
     set leadgen_campaign_id = v_hid, campaign_name = v_hid_name
   where crm = 'lead_generation' and leadgen_campaign_id = v_old
     and (source_file_name like 'campaign-125195-search-923402-auto-repair-shop_toronto%'
       or source_file_name like 'campaign-125196-search-923436-home-renovations-and-repair_toronto%');
  get diagnostics v_n = row_count;
  if v_n <> 16 then raise exception 'Hidebrandt repoint updated % lists instead of 16', v_n; end if;

  -- Pest Control -> Teknokraft (create the campaign once)
  select id into v_tek from public.leadgen_campaigns where client_id = v_tek_client and name = v_tek_name;
  if v_tek is null then
    insert into public.leadgen_campaigns (client_id, name, description, status, territory, target_industry, assigned_team, start_date, created_by)
    values (v_tek_client, v_tek_name,
      'Toronto pest control website design and SEO prospecting. Individual eligible leads may be reassigned by Admin without duplicating records.',
      'active', 'Toronto, Ontario', 'Pest Control Services', 'Henry Osuji', current_date, v_admin)
    returning id into v_tek;
  end if;

  update public.call_list_segments
     set leadgen_campaign_id = v_tek, campaign_name = v_tek_name
   where crm = 'lead_generation' and leadgen_campaign_id = v_old
     and source_file_name like 'campaign-125197-search-923437-pest-control-service_toronto%';
  get diagnostics v_n = row_count;
  if v_n <> 8 then raise exception 'Teknokraft repoint updated % lists instead of 8', v_n; end if;

  -- Agents who already hold Teknokraft keep holding ALL of its campaigns (client-level assignment).
  insert into public.leadgen_campaign_agents (campaign_id, agent_id, assigned_by)
  select distinct v_tek, ca.agent_id, v_admin
  from public.leadgen_campaign_agents ca join public.leadgen_campaigns c on c.id = ca.campaign_id
  where c.client_id = v_tek_client and c.id <> v_tek
  on conflict (campaign_id, agent_id) do nothing;

  -- The internal test client must now own no production call lists.
  select count(*) into v_n from public.call_list_segments where crm = 'lead_generation' and leadgen_campaign_id = v_old;
  if v_n <> 0 then raise exception 'Test campaign still owns % lists', v_n; end if;
end;
$fix$;
