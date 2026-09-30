-- Lead Generation CRM: a test-only client (leadgen_clients.is_internal_test, already
-- set for "Winsalot Corp. Test") can NEVER own production call lists or receive
-- production call-list leads/calls. Enforced in the database so it holds for the UI,
-- server actions, CSV imports, SQL migrations, automation and any future workflow.
--
-- Existing test data is left exactly as it is and nothing is deleted. The client keeps
-- its portal/dashboard: leads, appointments, emails and call logs created directly for
-- it (no call list involved) are not restricted. Only these are blocked:
--   * call_list_segments (crm = 'lead_generation') pointing at a test-only client's campaign
--   * leadgen_leads / leadgen_call_logs that reference a call list AND a test-only client
--   * flagging a client test-only while it owns call lists, or clearing the flag
-- Guard: refuses to apply if any of those states already exists.

comment on column public.leadgen_clients.is_internal_test is
  'Test-only client (client-portal/dashboard testing). Must never own production call lists - enforced by triggers.';

create or replace function public.leadgen_client_is_test_only(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_internal_test from public.leadgen_clients where id = p_client_id), false);
$$;

create or replace function public.leadgen_campaign_is_test_only(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select cl.is_internal_test from public.leadgen_campaigns c join public.leadgen_clients cl on cl.id = c.client_id where c.id = p_campaign_id), false);
$$;

revoke execute on function public.leadgen_client_is_test_only(uuid) from public, anon;
revoke execute on function public.leadgen_campaign_is_test_only(uuid) from public, anon;
grant execute on function public.leadgen_client_is_test_only(uuid) to authenticated;
grant execute on function public.leadgen_campaign_is_test_only(uuid) to authenticated;

-- Refuse to install over existing violations (there are none today).
do $guard$
begin
  if exists (select 1 from public.call_list_segments s where s.crm = 'lead_generation' and public.leadgen_campaign_is_test_only(s.leadgen_campaign_id)) then
    raise exception 'A test-only client still owns call lists; reassign them before applying this safeguard.';
  end if;
  if exists (select 1 from public.leadgen_leads l where l.call_list_segment_id is not null and public.leadgen_client_is_test_only(l.client_id)) then
    raise exception 'Call-list leads are still attributed to a test-only client.';
  end if;
  if exists (select 1 from public.leadgen_call_logs g where g.call_list_segment_id is not null and public.leadgen_client_is_test_only(g.client_id)) then
    raise exception 'Call-list call logs are still attributed to a test-only client.';
  end if;
end $guard$;

-- 1. Call lists.
create or replace function public.leadgen_block_test_client_call_lists()
returns trigger language plpgsql as $$
begin
  if new.crm = 'lead_generation' and public.leadgen_campaign_is_test_only(new.leadgen_campaign_id) then
    raise exception 'Winsalot Corp. Test is a test-only client and cannot own production call lists. Assign this list to a real client campaign.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists leadgen_block_test_client_call_lists on public.call_list_segments;
create trigger leadgen_block_test_client_call_lists
  before insert or update of crm, leadgen_campaign_id on public.call_list_segments
  for each row execute function public.leadgen_block_test_client_call_lists();

-- 2. Leads and calls that come from a call list.
create or replace function public.leadgen_block_test_client_list_records()
returns trigger language plpgsql as $$
begin
  if new.call_list_segment_id is not null
     and (public.leadgen_client_is_test_only(new.client_id) or public.leadgen_campaign_is_test_only(new.campaign_id)) then
    raise exception 'Winsalot Corp. Test is a test-only client and cannot receive production call-list leads or calls.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists leadgen_block_test_client_list_leads on public.leadgen_leads;
create trigger leadgen_block_test_client_list_leads
  before insert or update of client_id, campaign_id, call_list_segment_id on public.leadgen_leads
  for each row execute function public.leadgen_block_test_client_list_records();

drop trigger if exists leadgen_block_test_client_list_calls on public.leadgen_call_logs;
create trigger leadgen_block_test_client_list_calls
  before insert or update of client_id, campaign_id, call_list_segment_id on public.leadgen_call_logs
  for each row execute function public.leadgen_block_test_client_list_records();

-- 3. The flag itself: can't be cleared, and can't be set on a client that owns call lists.
create or replace function public.leadgen_guard_test_only_flag()
returns trigger language plpgsql as $$
begin
  if old.is_internal_test and not new.is_internal_test then
    raise exception 'The test-only flag on this client cannot be cleared.' using errcode = 'check_violation';
  end if;
  if new.is_internal_test and not old.is_internal_test and exists (
       select 1 from public.call_list_segments s join public.leadgen_campaigns c on c.id = s.leadgen_campaign_id
        where c.client_id = new.id and s.crm = 'lead_generation') then
    raise exception 'This client owns call lists and cannot be marked test-only.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists leadgen_guard_test_only_flag on public.leadgen_clients;
create trigger leadgen_guard_test_only_flag
  before update of is_internal_test on public.leadgen_clients
  for each row execute function public.leadgen_guard_test_only_flag();
