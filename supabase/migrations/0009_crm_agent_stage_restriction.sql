-- Restricts agents from manually moving a lead into a stage that's meant
-- to come from the automatic quote-sync (Customer accepted/declined) or
-- the admin-only Final Approval action (Closed/completed).
--
-- A plain RLS `with check` can't express "the new stage must either equal
-- the old stage, or be one of these values" (with check only sees the
-- new row, not the old one), so this uses a BEFORE UPDATE trigger, which
-- has both OLD and NEW available. It only fires when the stage is
-- actually changing, so agents can still freely update notes, next
-- follow-up date, etc. on a lead that's already in a system-only stage.
-- Admins (and the service-role client used by the public customer-quote
-- sync, which has no auth.uid() at all) are unaffected.
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
       'No response'
     )
  then
    raise exception 'Agents cannot set a lead to this stage.';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_leads_restrict_agent_stage_trigger on public.crm_leads;

create trigger crm_leads_restrict_agent_stage_trigger
  before update on public.crm_leads
  for each row
  execute function public.crm_leads_restrict_agent_stage();

-- Unlike crm_user_role(), this function is only ever invoked by the
-- trigger mechanism itself (not called directly in a policy expression or
-- from application code), and trigger firing isn't subject to the calling
-- role's EXECUTE privilege - so it's safe, and more locked down, to leave
-- EXECUTE revoked from every role rather than granting it to authenticated.
revoke execute on function public.crm_leads_restrict_agent_stage() from public;
revoke execute on function public.crm_leads_restrict_agent_stage() from anon;
revoke execute on function public.crm_leads_restrict_agent_stage() from authenticated;
