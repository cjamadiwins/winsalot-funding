-- Agents may only touch call_list_leads of lists they are currently assigned to.
--
-- The existing Growth agent policies on call_list_leads check "is this agent on
-- SOME active Growth list?" without tying that list to the row being read, so an
-- agent on any Growth list could read every call_list_leads row - including
-- lists Admin never assigned (or had just removed them from) in either CRM.
--
-- Fix without touching any existing policy: one RESTRICTIVE policy (AND-ed with
-- the existing ones) requiring an agent to be on the row's own list roster
-- (call_list_segment_agents). Admins and every non-agent role pass unchanged,
-- and the service-role client used by server code is unaffected. Removing an
-- agent from a list is therefore immediate at the database layer; no data is
-- changed and re-adding the agent restores access.

create or replace function public.call_list_agent_on_roster(uid uuid, target_segment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when coalesce(public.crm_user_role(uid), '') = 'admin' or coalesce(public.leadgen_user_role(uid), '') = 'admin' then true
    when coalesce(public.crm_user_role(uid), '') = 'agent' or coalesce(public.leadgen_user_role(uid), '') = 'agent' then
      exists (select 1 from public.call_list_segment_agents sa where sa.segment_id = target_segment_id and sa.agent_id = uid)
    else true
  end;
$$;

revoke execute on function public.call_list_agent_on_roster(uuid, uuid) from public, anon;
grant execute on function public.call_list_agent_on_roster(uuid, uuid) to authenticated;

create policy "call_list_leads_agent_roster_scope"
  on public.call_list_leads as restrictive for all to authenticated
  using (public.call_list_agent_on_roster(auth.uid(), segment_id));
