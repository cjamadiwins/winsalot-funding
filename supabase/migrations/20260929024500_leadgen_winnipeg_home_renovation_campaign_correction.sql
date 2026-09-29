-- Repoint only the three already imported Winnipeg Home Renovation segments.
-- Lead rows, segment rosters, source files and all history remain untouched.
do $fix$
declare
  v_target uuid;
  v_old uuid;
  v_count integer;
begin
  select c.id into strict v_target
  from public.leadgen_campaigns c
  join public.leadgen_clients cl on cl.id = c.client_id
  where cl.name = 'Hidebrandt Web Services'
    and cl.active = true
    and c.name = 'Hidebrandt Web Services – Website Services Lead Generation'
    and c.status = 'active';

  select c.id into strict v_old
  from public.leadgen_campaigns c
  join public.leadgen_clients cl on cl.id = c.client_id
  where cl.name = 'Winsalot Corp. Test'
    and c.name = 'Website Design Lead Generation';

  select count(*) into v_count
  from public.call_list_segments s
  where s.crm = 'lead_generation'
    and s.leadgen_campaign_id = v_old
    and s.name in (
      'Home Renovation — Winnipeg, Manitoba — No Website — Goodness Ugbana',
      'Home Renovation — Winnipeg, Manitoba — Website Review — Goodness Ugbana',
      'Home Renovation — Winnipeg, Manitoba — Review Required (Admin Only)'
    )
    and s.territory = 'Winnipeg, Manitoba';
  if v_count <> 3 then
    raise exception 'Expected exactly three Winnipeg Home Renovation segments under the test campaign; found %', v_count;
  end if;

  update public.call_list_segments s
  set leadgen_campaign_id = v_target,
      campaign_name = 'Hidebrandt Web Services – Website Services Lead Generation'
  where s.crm = 'lead_generation'
    and s.leadgen_campaign_id = v_old
    and s.territory = 'Winnipeg, Manitoba'
    and s.name in (
      'Home Renovation — Winnipeg, Manitoba — No Website — Goodness Ugbana',
      'Home Renovation — Winnipeg, Manitoba — Website Review — Goodness Ugbana',
      'Home Renovation — Winnipeg, Manitoba — Review Required (Admin Only)'
    );
  get diagnostics v_count = row_count;
  if v_count <> 3 then
    raise exception 'Campaign correction updated % segments instead of three', v_count;
  end if;
end;
$fix$;
