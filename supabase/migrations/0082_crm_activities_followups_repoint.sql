-- Extends crm_activities and crm_followups to also work against
-- crm_opportunities, without touching their existing lead_id-based rows
-- or triggers.
--
-- IMPORTANT: both tables already have an `opportunity_id` column, added
-- by migration 0013 and referencing `active_cleaning_opportunities` (the
-- municipal-tender bid-scraping tool being removed from the app in this
-- same change - its table/data stay in the database untouched, just no
-- longer reachable from the UI). Rather than adding a second,
-- confusingly-named column, this migration REPOINTS that existing column
-- at the new crm_opportunities table:
--   1. Null out any existing opportunity_id values (they reference
--      active_cleaning_opportunities rows, which are unrelated to and
--      cannot satisfy a FK into crm_opportunities) - this only affects
--      the cross-link from an activity/follow-up back to a retired
--      bid-scraper opportunity; the opportunity's own row and its own
--      audit log (active_cleaning_opportunities_audit_log) are untouched.
--   2. Drop the old FK (auto-named after the column) and add a new one
--      pointing at crm_opportunities.
-- The pre-existing three-way check constraints from migration 0026
-- (crm_activities_exactly_one_target / crm_followups_exactly_one_target -
-- "exactly one of lead_id/opportunity_id/provider_lead_id is set") are
-- correct as-is for the new meaning of opportunity_id too and are left
-- untouched - no need to replace them.
update public.crm_activities set opportunity_id = null where opportunity_id is not null;
update public.crm_followups set opportunity_id = null where opportunity_id is not null;

alter table public.crm_activities drop constraint if exists crm_activities_opportunity_id_fkey;
alter table public.crm_activities
  add constraint crm_activities_opportunity_id_fkey
  foreign key (opportunity_id) references public.crm_opportunities(id) on delete cascade;

alter table public.crm_followups drop constraint if exists crm_followups_opportunity_id_fkey;
alter table public.crm_followups
  add constraint crm_followups_opportunity_id_fkey
  foreign key (opportunity_id) references public.crm_opportunities(id) on delete cascade;

-- RLS: add opportunity_id-scoped policies alongside the existing
-- lead_id-scoped ones (migration 0007) and the old
-- crm_activities_agent_select_own_lead-style policies that already
-- mention opportunity_id (migration 0013/0026, still present, still
-- referencing active_cleaning_opportunities in their opportunity_id
-- branch) - that branch simply never matches a crm_opportunities id, so
-- it's a harmless dead branch rather than something that needs removing;
-- Postgres OR's multiple permissive policies together, so the new
-- policies below are what actually grant access to a crm_opportunities-
-- linked row.
create policy "crm_activities_agent_select_own_opportunity"
  on public.crm_activities for select
  using (exists (
    select 1 from public.crm_opportunities o
    where o.id = opportunity_id and o.assigned_agent_id = auth.uid()
  ));

create policy "crm_activities_agent_insert_own_opportunity"
  on public.crm_activities for insert
  with check (
    agent_id = auth.uid()
    and exists (
      select 1 from public.crm_opportunities o
      where o.id = opportunity_id and o.assigned_agent_id = auth.uid()
    )
  );

create policy "crm_followups_agent_select_own_opportunity"
  on public.crm_followups for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_opportunities o
      where o.id = opportunity_id and o.assigned_agent_id = auth.uid()
    )
  );

create policy "crm_followups_agent_insert_own_opportunity"
  on public.crm_followups for insert
  with check (
    scheduled_by = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_opportunities o
      where o.id = opportunity_id and o.assigned_agent_id = auth.uid()
    )
  );

create policy "crm_followups_agent_update_own_opportunity"
  on public.crm_followups for update
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_opportunities o
      where o.id = opportunity_id and o.assigned_agent_id = auth.uid()
    )
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_opportunities o
      where o.id = opportunity_id and o.assigned_agent_id = auth.uid()
    )
  );

-- Second sync trigger, parallel to the existing
-- crm_followups_sync_lead_trigger (migration 0011, extended in 0013/0026
-- to also maintain active_cleaning_opportunities.next_follow_up_at and
-- provider_leads.next_follow_up_at from the same function) - keeps
-- crm_opportunities.next_follow_up_at as "the earliest pending callback
-- for this opportunity." The existing trigger/function are untouched; its
-- own opportunity_id branch still runs on every insert/update/delete too,
-- but now harmlessly affects zero rows (target_opportunity_id no longer
-- matches any active_cleaning_opportunities id), since this migration
-- repointed the column above.
create or replace function public.crm_followups_sync_opportunity_next_follow_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_opportunity_id uuid;
  next_pending timestamptz;
begin
  target_opportunity_id := coalesce(new.opportunity_id, old.opportunity_id);
  if target_opportunity_id is null then
    return coalesce(new, old);
  end if;

  select min(scheduled_at) into next_pending
  from public.crm_followups
  where opportunity_id = target_opportunity_id and status = 'pending';

  update public.crm_opportunities
  set next_follow_up_at = next_pending
  where id = target_opportunity_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists crm_followups_sync_opportunity_trigger on public.crm_followups;

create trigger crm_followups_sync_opportunity_trigger
  after insert or update or delete on public.crm_followups
  for each row
  execute function public.crm_followups_sync_opportunity_next_follow_up();

revoke execute on function public.crm_followups_sync_opportunity_next_follow_up() from public;
revoke execute on function public.crm_followups_sync_opportunity_next_follow_up() from anon;
revoke execute on function public.crm_followups_sync_opportunity_next_follow_up() from authenticated;

create index if not exists crm_activities_opportunity_growth_idx on public.crm_activities(opportunity_id, occurred_at desc);
create index if not exists crm_followups_opportunity_growth_idx on public.crm_followups(opportunity_id);
