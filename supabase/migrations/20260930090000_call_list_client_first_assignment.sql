-- Call-list ownership is explicit for Growth CRM; Lead Generation already
-- derives ownership from call_list_segments.leadgen_campaign_id.
-- Legacy Growth rows stay NULL for Admin review: ownership is not inferred.

alter table public.crm_clients
  add column if not exists is_internal_test boolean not null default false;

update public.crm_clients
   set is_internal_test = true
 where lower(trim(company_name)) in ('winsalot corp. test', 'winsalot corp test')
   and is_internal_test = false;

alter table public.call_list_segments
  add column if not exists crm_client_id uuid references public.crm_clients(id) on delete restrict;

alter table public.call_list_segments
  drop constraint if exists call_list_segments_crm_fields;

alter table public.call_list_segments
  add constraint call_list_segments_crm_fields check (
    (crm = 'growth' and growth_opportunity_type is not null and leadgen_campaign_id is null)
    or
    (crm = 'lead_generation' and leadgen_campaign_id is not null and growth_opportunity_type is null and crm_client_id is null)
  );

-- Existing Lead Generation rows already have an authoritative client via
-- leadgen_campaign_id. Normalize only those known, production assignments;
-- Growth rows remain untouched for Admin review because they had no client FK.
update public.call_list_segments s
   set campaign_name = concat_ws(' — ', nullif(trim(cl.name), ''), nullif(trim(s.industry), ''), nullif(trim(s.territory), ''))
  from public.leadgen_campaigns cp
  join public.leadgen_clients cl on cl.id = cp.client_id
 where s.crm = 'lead_generation'
   and s.leadgen_campaign_id = cp.id
   and not cl.is_internal_test
   and nullif(trim(cl.name), '') is not null;

create index if not exists call_list_segments_growth_client_idx
  on public.call_list_segments(crm_client_id, created_at desc)
  where crm = 'growth' and crm_client_id is not null;

create or replace function public.growth_block_internal_test_call_list_client()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.crm = 'growth' and new.crm_client_id is not null and exists (
    select 1 from public.crm_clients c where c.id = new.crm_client_id and c.is_internal_test
  ) then
    raise exception 'Winsalot Corp. Test is a dashboard-testing client and cannot own a production call list.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists growth_block_internal_test_call_list_client on public.call_list_segments;
create trigger growth_block_internal_test_call_list_client
  before insert or update of crm, crm_client_id on public.call_list_segments
  for each row execute function public.growth_block_internal_test_call_list_client();

create or replace function public.growth_guard_internal_test_client_flag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_internal_test and not new.is_internal_test then
    raise exception 'The dashboard-testing client flag cannot be cleared.' using errcode = 'check_violation';
  end if;
  if new.is_internal_test and not old.is_internal_test and exists (
    select 1 from public.call_list_segments s where s.crm = 'growth' and s.crm_client_id = new.id
  ) then
    raise exception 'A client with production call lists cannot be marked as dashboard-testing.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists growth_guard_internal_test_client_flag on public.crm_clients;
create trigger growth_guard_internal_test_client_flag
  before update of is_internal_test on public.crm_clients
  for each row execute function public.growth_guard_internal_test_client_flag();

comment on column public.call_list_segments.crm_client_id is
  'Growth CRM client ownership for a call-list campaign. NULL on legacy rows pending Admin review; Lead Generation ownership uses leadgen_campaign_id.';
