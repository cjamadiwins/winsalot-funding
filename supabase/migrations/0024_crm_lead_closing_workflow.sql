-- Adds a dedicated closing workflow to crm_leads: two closing stages
-- ("Closed – Won" / "Closed – Lost") that replace the ad-hoc mix of
-- "Customer accepted"/"Customer declined"/"No response"/"Closed/completed"
-- as *the* two states that stop a lead counting as overdue and that admin
-- reporting filters on. The four existing stages are left in the allowed
-- set (existing rows already use them, and the automatic customer-quote
-- sync still writes "Customer accepted"/"Customer declined" as an interim
-- signal ahead of a deliberate close) - purely additive, no existing row
-- is rewritten.

alter table public.crm_leads
  drop constraint crm_leads_stage_check;

alter table public.crm_leads
  add constraint crm_leads_stage_check check (stage in (
    'New interested lead',
    'Waiting for cleaning details',
    'Quote requested from provider',
    'Provider quote received',
    'Quote sent to customer',
    'Follow-up required',
    'Customer accepted',
    'Customer declined',
    'No response',
    'Closed/completed',
    'Closed – Won',
    'Closed – Lost'
  ));

-- A closing reason/note is mandatory whenever a lead is in one of the two
-- new closing stages (requirement: "when an agent closes a lead, require a
-- closing reason or short note") - enforced here, not just in the server
-- action, same defense-in-depth pattern as the rest of this schema.
-- closed_at/closed_by back the admin reporting views (who closed it, when).
alter table public.crm_leads
  add column if not exists closed_reason text,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.crm_users(id) on delete set null;

alter table public.crm_leads
  add constraint crm_leads_closed_reason_required check (
    stage not in ('Closed – Won', 'Closed – Lost') or closed_reason is not null
  );

create index if not exists crm_leads_closed_at_idx on public.crm_leads(closed_at);

-- Agents can now move a lead directly into either closing stage themselves
-- (previously only admin-controlled stages were reachable outside the six
-- agent-settable ones) - the server action enforces the reason requirement
-- before it ever issues this update; this constraint is the backstop.
create or replace function public.crm_leads_restrict_agent_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.crm_user_role(auth.uid()) = 'agent'
     and new.stage is distinct from old.stage
     and new.stage not in (
       'New interested lead',
       'Waiting for cleaning details',
       'Quote requested from provider',
       'Provider quote received',
       'Follow-up required',
       'No response',
       'Closed – Won',
       'Closed – Lost'
     )
  then
    raise exception 'Agents cannot set a lead to this stage.';
  end if;
  return new;
end;
$$;

revoke execute on function public.crm_leads_restrict_agent_stage() from public;
revoke execute on function public.crm_leads_restrict_agent_stage() from anon;
revoke execute on function public.crm_leads_restrict_agent_stage() from authenticated;

-- "Do not delete closed leads" - enforced at the database level so it
-- holds regardless of which client (session or service-role) issues the
-- delete, not just by hiding the Delete button once a lead is closed.
create or replace function public.crm_leads_prevent_closed_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.stage in ('Closed – Won', 'Closed – Lost') then
    raise exception 'Closed leads cannot be deleted. Reopen the lead first if this was a mistake.';
  end if;
  return old;
end;
$$;

drop trigger if exists crm_leads_prevent_closed_delete_trigger on public.crm_leads;

create trigger crm_leads_prevent_closed_delete_trigger
  before delete on public.crm_leads
  for each row
  execute function public.crm_leads_prevent_closed_delete();

revoke execute on function public.crm_leads_prevent_closed_delete() from public;
revoke execute on function public.crm_leads_prevent_closed_delete() from anon;
revoke execute on function public.crm_leads_prevent_closed_delete() from authenticated;
