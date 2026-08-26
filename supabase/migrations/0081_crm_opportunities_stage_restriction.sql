-- Ports crm_leads' agent-stage-restriction and closed-delete-prevention
-- triggers (migrations 0009/0024) to crm_opportunities. Agents may set any
-- stage via the plain dropdown except the two closing stages ('Client Won'
-- / 'Not Interested'), which always require a reason and therefore only
-- ever go through the dedicated Close Opportunity panel/action - same
-- rationale as crm_leads' Close Lead panel.
create or replace function public.crm_opportunities_restrict_agent_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.crm_user_role(auth.uid()) = 'agent'
     and new.stage is distinct from old.stage
     and new.stage in ('Client Won', 'Not Interested')
     and new.closed_reason is null
  then
    raise exception 'Closing an opportunity requires a reason. Use the Close Opportunity panel.';
  end if;
  return new;
end;
$$;

revoke execute on function public.crm_opportunities_restrict_agent_stage() from public;
revoke execute on function public.crm_opportunities_restrict_agent_stage() from anon;
revoke execute on function public.crm_opportunities_restrict_agent_stage() from authenticated;

drop trigger if exists crm_opportunities_restrict_agent_stage_trigger on public.crm_opportunities;

create trigger crm_opportunities_restrict_agent_stage_trigger
  before update on public.crm_opportunities
  for each row
  execute function public.crm_opportunities_restrict_agent_stage();

-- A closing reason is mandatory whenever an opportunity is in one of the
-- two closing stages, enforced at the database level regardless of which
-- client writes it (defense in depth, same pattern as
-- crm_leads_closed_reason_required in migration 0024). Added here (not in
-- 0080) is fine since no rows exist yet at this point in the migration
-- sequence; the data-migration step (0083) backfills closed_reason before
-- this constraint would ever see a violating row.
alter table public.crm_opportunities
  add constraint crm_opportunities_closed_reason_required check (
    stage not in ('Client Won', 'Not Interested') or closed_reason is not null
  );

-- "Closed opportunities are never deleted" - same guard as
-- crm_leads_prevent_closed_delete_trigger (migration 0024).
create or replace function public.crm_opportunities_prevent_closed_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.stage in ('Client Won', 'Not Interested') then
    raise exception 'Closed opportunities cannot be deleted. Reopen the opportunity first if this was a mistake.';
  end if;
  return old;
end;
$$;

drop trigger if exists crm_opportunities_prevent_closed_delete_trigger on public.crm_opportunities;

create trigger crm_opportunities_prevent_closed_delete_trigger
  before delete on public.crm_opportunities
  for each row
  execute function public.crm_opportunities_prevent_closed_delete();

revoke execute on function public.crm_opportunities_prevent_closed_delete() from public;
revoke execute on function public.crm_opportunities_prevent_closed_delete() from anon;
revoke execute on function public.crm_opportunities_prevent_closed_delete() from authenticated;
