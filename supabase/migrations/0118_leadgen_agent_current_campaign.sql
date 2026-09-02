-- Agent-selected current campaign for the Lead Generation CRM only.
-- This is display/work-context state: it does not assign or move leads and
-- is intentionally independent of Opportunity Finder and every CRM workflow.

alter table public.leadgen_users
  add column if not exists current_campaign_id uuid
    references public.leadgen_campaigns(id) on delete set null;

create index if not exists leadgen_users_current_campaign_idx
  on public.leadgen_users(current_campaign_id);

-- Agents have no direct UPDATE policy on leadgen_users. This narrow RPC is
-- therefore the sole self-service write path: auth.uid() fixes the target row,
-- and only an active campaign (or null to clear the selection) is accepted.
create or replace function public.set_my_leadgen_current_campaign(campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.leadgen_user_role(auth.uid()) <> 'agent' then
    raise exception 'Only an active lead generation agent can select a campaign.';
  end if;

  if campaign_id is not null and not exists (
    select 1
    from public.leadgen_campaigns c
    where c.id = campaign_id
      and c.status = 'active'
  ) then
    raise exception 'The selected campaign is not active.';
  end if;

  update public.leadgen_users
  set current_campaign_id = campaign_id
  where id = auth.uid()
    and role = 'agent'
    and active = true;

  if not found then
    raise exception 'Active lead generation agent account not found.';
  end if;
end;
$$;

revoke execute on function public.set_my_leadgen_current_campaign(uuid) from public, anon;
grant execute on function public.set_my_leadgen_current_campaign(uuid) to authenticated;

