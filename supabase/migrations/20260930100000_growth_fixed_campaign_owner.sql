-- Growth CRM is Winsalot Corp's internal prospecting workspace.
-- Keep campaign ownership on the call-list row; prospect/customer accounts in
-- crm_clients (including Winsalot Corp. Test) are not Growth campaign owners.

alter table public.call_list_segments
  add column if not exists campaign_owner_name text;

do $$
declare
  affected integer;
begin
  update public.call_list_segments s
     set campaign_owner_name = 'Winsalot Corp',
         crm_client_id = null,
         campaign_name = concat_ws(
           ' — ',
           'Winsalot Corp',
           coalesce(nullif(trim(s.industry), ''), nullif(trim(s.name), '')),
           nullif(trim(s.territory), '')
         )
   where s.crm = 'growth'
     and s.id in (
       'ad19fe48-2bc3-455c-b9dc-e9cd01ea359b',
       '5d632b32-fe71-4718-a855-2962079e150e',
       'a6dfa656-a909-400a-98c6-a54819f47853',
       '44b6c034-e091-4cda-b9e1-9f5387ba8111',
       '4429daef-ee00-4f29-aab8-43b5f302e3b0',
       '1d42bab7-4305-4ef3-b408-f9c5a72a8705'
     )
     and s.crm_client_id is null;

  get diagnostics affected = row_count;
  if affected <> 6 then
    raise exception 'Expected to update exactly the six unowned legacy Growth lists; updated %.', affected;
  end if;
end $$;

alter table public.call_list_segments
  add constraint call_list_segments_campaign_owner_check
  check (
    (crm = 'growth' and campaign_owner_name = 'Winsalot Corp' and crm_client_id is null)
    or
    (crm = 'lead_generation' and campaign_owner_name is null and crm_client_id is null)
  );

create or replace function public.enforce_call_list_campaign_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.crm = 'growth' then
    new.campaign_owner_name := 'Winsalot Corp';
    new.crm_client_id := null;
  else
    new.campaign_owner_name := null;
    new.crm_client_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_call_list_campaign_owner on public.call_list_segments;
create trigger enforce_call_list_campaign_owner
  before insert or update of crm, crm_client_id, campaign_owner_name
  on public.call_list_segments
  for each row execute function public.enforce_call_list_campaign_owner();

comment on column public.call_list_segments.campaign_owner_name is
  'Growth CRM campaign owner. Fixed to Winsalot Corp; never a prospect/customer account. Lead Generation CRM ownership remains leadgen_campaign_id.';
