-- Follow-Up Calendar: dedicated callback scheduling, separate from the
-- crm_activities timeline. A single crm_leads.next_follow_up_at scalar
-- can't represent a real calendar (multiple upcoming callbacks, each with
-- its own pending/completed state that can be rescheduled independently),
-- so this introduces crm_followups as the source of truth for scheduled
-- callbacks, and turns crm_leads.next_follow_up_at into a derived,
-- trigger-maintained convenience column (still readable everywhere it
-- already was, just no longer written to directly by application code).

create table if not exists public.crm_followups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  scheduled_by uuid references public.crm_users(id) on delete set null,
  scheduled_at timestamptz not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  completed_at timestamptz,
  completed_by uuid references public.crm_users(id) on delete set null
);

create index if not exists crm_followups_lead_idx on public.crm_followups(lead_id);
create index if not exists crm_followups_pending_scheduled_at_idx
  on public.crm_followups(scheduled_at)
  where status = 'pending';

alter table public.crm_followups enable row level security;

create policy "crm_followups_admin_all"
  on public.crm_followups for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Access is scoped through the lead's *current* assigned_agent_id, not a
-- stored ownership column on the followup itself - so reassigning a lead
-- to a different agent transfers its pending callbacks immediately, and
-- the previous agent loses access to them just as immediately, with no
-- extra bookkeeping required.
create policy "crm_followups_agent_select_own_lead"
  on public.crm_followups for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    )
  );

create policy "crm_followups_agent_insert_own_lead"
  on public.crm_followups for insert
  with check (
    scheduled_by = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    )
  );

-- Covers both "mark completed" and "reschedule" - both are updates to the
-- same row. No agent delete policy: mirrors the rest of this CRM's
-- "agents don't get delete controls" rule; nothing in this feature asked
-- for removing a callback outright.
create policy "crm_followups_agent_update_own_lead"
  on public.crm_followups for update
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    )
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    )
  );

-- Keeps crm_leads.next_follow_up_at as "the earliest pending callback for
-- this lead" automatically, so every existing dashboard/list that already
-- reads that column (agent dashboard, /admin/crm, lead detail pages)
-- keeps working unchanged. security definer so it isn't subject to the
-- caller's own RLS when writing crm_leads; EXECUTE is revoked from every
-- role below since - like crm_leads_restrict_agent_stage in migration
-- 0009 - it's only ever invoked by the trigger mechanism, never called
-- directly.
create or replace function public.crm_followups_sync_lead_next_follow_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lead_id uuid;
  next_pending timestamptz;
begin
  target_lead_id := coalesce(new.lead_id, old.lead_id);

  select min(scheduled_at) into next_pending
  from public.crm_followups
  where lead_id = target_lead_id and status = 'pending';

  update public.crm_leads
  set next_follow_up_at = next_pending
  where id = target_lead_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists crm_followups_sync_lead_trigger on public.crm_followups;

create trigger crm_followups_sync_lead_trigger
  after insert or update or delete on public.crm_followups
  for each row
  execute function public.crm_followups_sync_lead_next_follow_up();

revoke execute on function public.crm_followups_sync_lead_next_follow_up() from public;
revoke execute on function public.crm_followups_sync_lead_next_follow_up() from anon;
revoke execute on function public.crm_followups_sync_lead_next_follow_up() from authenticated;
