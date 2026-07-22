-- Extends the *existing* crm_activities (call/note timeline) and
-- crm_followups (scheduled callback) tables so a row can belong to either
-- a crm_leads lead or an active_cleaning_opportunities opportunity,
-- instead of building a second, parallel activity/follow-up system for
-- Cleaning Opportunities. Both tables already exist in production
-- (migrations 0007 and 0011), so this is an ALTER migration rather than a
-- rewrite of those files - purely additive, and every existing lead-only
-- row/query keeps working unchanged (lead_id stays populated exactly as
-- before for every row that already exists).

alter table public.crm_activities
  add column if not exists opportunity_id uuid references public.active_cleaning_opportunities(id) on delete cascade;

alter table public.crm_activities
  alter column lead_id drop not null;

alter table public.crm_activities
  add constraint crm_activities_exactly_one_target
  check (
    (lead_id is not null and opportunity_id is null)
    or (lead_id is null and opportunity_id is not null)
  );

create index if not exists crm_activities_opportunity_idx
  on public.crm_activities(opportunity_id, occurred_at desc);

-- Agent select/insert policies extended to also cover an activity whose
-- target is an opportunity assigned to the caller. crm_activities_admin_all
-- is untouched below - it's role-only (no lead_id/opportunity_id check),
-- so it already covers both cases with no changes needed.
drop policy if exists "crm_activities_agent_select_own_lead" on public.crm_activities;
create policy "crm_activities_agent_select_own_lead"
  on public.crm_activities for select
  using (
    (lead_id is not null and exists (
      select 1 from public.crm_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    ))
    or
    (opportunity_id is not null and exists (
      select 1 from public.active_cleaning_opportunities o
      where o.id = opportunity_id and o.assigned_agent = auth.uid()
    ))
  );

drop policy if exists "crm_activities_agent_insert_own_lead" on public.crm_activities;
create policy "crm_activities_agent_insert_own_lead"
  on public.crm_activities for insert
  with check (
    agent_id = auth.uid()
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
    )
  );

-- Same extension for crm_followups (the Follow-Up Calendar).
alter table public.crm_followups
  add column if not exists opportunity_id uuid references public.active_cleaning_opportunities(id) on delete cascade;

alter table public.crm_followups
  alter column lead_id drop not null;

alter table public.crm_followups
  add constraint crm_followups_exactly_one_target
  check (
    (lead_id is not null and opportunity_id is null)
    or (lead_id is null and opportunity_id is not null)
  );

create index if not exists crm_followups_opportunity_idx
  on public.crm_followups(opportunity_id);
create index if not exists crm_followups_opportunity_pending_scheduled_at_idx
  on public.crm_followups(scheduled_at)
  where status = 'pending' and opportunity_id is not null;

drop policy if exists "crm_followups_agent_select_own_lead" on public.crm_followups;
create policy "crm_followups_agent_select_own_lead"
  on public.crm_followups for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
    )
  );

drop policy if exists "crm_followups_agent_insert_own_lead" on public.crm_followups;
create policy "crm_followups_agent_insert_own_lead"
  on public.crm_followups for insert
  with check (
    scheduled_by = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
    )
  );

drop policy if exists "crm_followups_agent_update_own_lead" on public.crm_followups;
create policy "crm_followups_agent_update_own_lead"
  on public.crm_followups for update
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
    )
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
    )
  );

-- Extends the existing sync trigger function (created in migration 0011)
-- in place, rather than adding a second trigger - it now maintains
-- whichever side's next_follow_up_at applies to a given crm_followups row.
-- Leads keep behaving exactly as before; opportunities get the same
-- "next_follow_up_at is always the earliest pending callback" guarantee.
create or replace function public.crm_followups_sync_lead_next_follow_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lead_id uuid := coalesce(new.lead_id, old.lead_id);
  target_opportunity_id uuid := coalesce(new.opportunity_id, old.opportunity_id);
  next_pending timestamptz;
begin
  if target_lead_id is not null then
    select min(scheduled_at) into next_pending
    from public.crm_followups
    where lead_id = target_lead_id and status = 'pending';

    update public.crm_leads
    set next_follow_up_at = next_pending
    where id = target_lead_id;
  end if;

  if target_opportunity_id is not null then
    select min(scheduled_at) into next_pending
    from public.crm_followups
    where opportunity_id = target_opportunity_id and status = 'pending';

    update public.active_cleaning_opportunities
    set next_follow_up_at = next_pending
    where id = target_opportunity_id;
  end if;

  return coalesce(new, old);
end;
$$;
