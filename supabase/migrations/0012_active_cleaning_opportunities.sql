-- Active Cleaning Opportunities: a lead-generation table of publicly
-- available RFPs/tenders/signals indicating a business or organization in
-- Metro Vancouver or the Greater Toronto Area may be in the market for
-- commercial cleaning/janitorial/custodial services. Purely additive - no
-- existing table, column, or row is modified. Not yet applied to any live
-- project - see docs/active-cleaning-opportunities.md.
--
-- This is the "Cleaning Opportunities" section of the *existing* CRM, not
-- a parallel system: it reuses crm_users for both roles, crm_activities
-- for the notes/call timeline, and crm_followups for scheduled callbacks
-- (both extended for opportunities in migration 0013, since they're
-- already-applied tables from earlier migrations). Only the
-- opportunity-specific table and its own audit log are created here.
--
-- Rows are written by the daily collection job (src/lib/opportunities/run.ts)
-- via the service-role client (src/lib/supabase-admin.ts), the same
-- pattern already used for quote_requests writes from public forms.

create table if not exists public.active_cleaning_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_name text,
  opportunity_title text not null,
  description text,
  opportunity_type text not null check (opportunity_type in (
    'rfp_tender', 'quote_request', 'hiring_signal', 'new_location', 'other'
  )),
  service_needed text,
  city text,
  province text check (province is null or province in ('BC', 'ON')),
  contact_name text,
  public_email text,
  public_phone text,
  website text,
  source_name text not null,
  source_url text not null,
  date_posted date,
  deadline date,
  date_discovered timestamptz not null default now(),
  intent_score int not null default 0 check (intent_score between 0 and 100),
  intent_level text not null default 'Research' check (intent_level in ('Hot', 'Warm', 'Research')),
  -- 'Reviewing'/'Assigned' are admin/system stages (an admin triaging a
  -- new record, or the system marking it Assigned the moment an agent is
  -- set); the other eight are exactly the agent-facing status list from
  -- the brief and are enforced as the *only* statuses an agent can set by
  -- the trigger below.
  status text not null default 'New' check (status in (
    'New', 'Reviewing', 'Assigned', 'Contacted', 'No answer', 'Follow-up required',
    'Quote requested', 'Converted', 'Not suitable', 'Expired'
  )),
  assigned_agent uuid references public.crm_users(id) on delete set null,
  notes text,
  -- Derived/system-maintained, same split as crm_leads: next_follow_up_at
  -- is kept in sync by the crm_followups trigger (extended for
  -- opportunities in migration 0013); last_contacted_at is set directly by
  -- the "log activity" actions, mirroring crm_leads.last_contacted_at.
  next_follow_up_at timestamptz,
  last_contacted_at timestamptz,
  -- Soft delete/archive: hidden from the default active list (including
  -- from agents entirely) but still visible and restorable by an admin.
  -- Permanent deletion is a separate, explicit, confirmed action - see the
  -- audit log table below for what survives that.
  archived_at timestamptz,
  archived_by uuid references public.crm_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedup guard for the collection job's upsert (also re-checked in app code
-- via src/lib/opportunities/dedupe.ts before ever reaching this insert).
-- Applies regardless of archive status, so a re-discovered duplicate of an
-- already-archived record is still rejected rather than resurrected.
create unique index if not exists active_cleaning_opportunities_source_idx
  on public.active_cleaning_opportunities (source_url, opportunity_title);

create index if not exists active_cleaning_opportunities_city_idx
  on public.active_cleaning_opportunities (city);
create index if not exists active_cleaning_opportunities_province_idx
  on public.active_cleaning_opportunities (province);
create index if not exists active_cleaning_opportunities_intent_level_idx
  on public.active_cleaning_opportunities (intent_level);
create index if not exists active_cleaning_opportunities_status_idx
  on public.active_cleaning_opportunities (status);
create index if not exists active_cleaning_opportunities_deadline_idx
  on public.active_cleaning_opportunities (deadline);
create index if not exists active_cleaning_opportunities_assigned_agent_idx
  on public.active_cleaning_opportunities (assigned_agent);
create index if not exists active_cleaning_opportunities_date_discovered_idx
  on public.active_cleaning_opportunities (date_discovered desc);
create index if not exists active_cleaning_opportunities_archived_at_idx
  on public.active_cleaning_opportunities (archived_at);

alter table public.active_cleaning_opportunities enable row level security;

-- Admins: full read/write/delete on every row, archived or not - same
-- shape as crm_leads_admin_all.
create policy "active_cleaning_opportunities_admin_all"
  on public.active_cleaning_opportunities for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Agents: only their own assigned, non-archived opportunities - same
-- "scoped through the current assignment column" pattern as
-- crm_leads_agent_select_own/_update_own. No agent insert/delete policy:
-- opportunities are only ever created by the collection job (service-role,
-- bypasses RLS) and only ever permanently deleted by an admin.
create policy "active_cleaning_opportunities_agent_select_own"
  on public.active_cleaning_opportunities for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and assigned_agent = auth.uid()
    and archived_at is null
  );

create policy "active_cleaning_opportunities_agent_update_own"
  on public.active_cleaning_opportunities for update
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and assigned_agent = auth.uid()
    and archived_at is null
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and assigned_agent = auth.uid()
  );

-- Column-level restriction to back up the row-level policy above: RLS
-- alone would let an agent update *any* column on their own assigned row
-- (reassign it, rewrite the source URL, change the intent score, edit the
-- business's contact info). This mirrors crm_leads_restrict_agent_stage
-- (migration 0009) but covers every field the brief says agents must not
-- touch, not just one. Anything not checked here (status within the
-- agent-settable set, next_follow_up_at, last_contacted_at, updated_at) is
-- left open - those are exactly the fields the agent-facing actions in
-- src/app/agent/(dashboard)/opportunities/actions.ts are allowed to write.
create or replace function public.active_cleaning_opportunities_restrict_agent_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.crm_user_role(auth.uid()) = 'agent' then
    if new.status is distinct from old.status
      and new.status not in (
        'New', 'Contacted', 'No answer', 'Follow-up required',
        'Quote requested', 'Converted', 'Not suitable', 'Expired'
      )
    then
      raise exception 'Agents cannot set opportunities to this status.';
    end if;

    if new.assigned_agent is distinct from old.assigned_agent then
      raise exception 'Agents cannot reassign opportunities.';
    end if;

    if new.intent_score is distinct from old.intent_score
      or new.intent_level is distinct from old.intent_level
      or new.source_name is distinct from old.source_name
      or new.source_url is distinct from old.source_url
    then
      raise exception 'Agents cannot edit intent scoring or source details.';
    end if;

    if new.organization_name is distinct from old.organization_name
      or new.opportunity_title is distinct from old.opportunity_title
      or new.description is distinct from old.description
      or new.opportunity_type is distinct from old.opportunity_type
      or new.service_needed is distinct from old.service_needed
      or new.city is distinct from old.city
      or new.province is distinct from old.province
      or new.contact_name is distinct from old.contact_name
      or new.public_email is distinct from old.public_email
      or new.public_phone is distinct from old.public_phone
      or new.website is distinct from old.website
      or new.date_posted is distinct from old.date_posted
      or new.deadline is distinct from old.deadline
      or new.notes is distinct from old.notes
      or new.archived_at is distinct from old.archived_at
      or new.archived_by is distinct from old.archived_by
    then
      raise exception 'Agents cannot edit business, contact, or archive information.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists active_cleaning_opportunities_restrict_agent_edits_trigger
  on public.active_cleaning_opportunities;

create trigger active_cleaning_opportunities_restrict_agent_edits_trigger
  before update on public.active_cleaning_opportunities
  for each row
  execute function public.active_cleaning_opportunities_restrict_agent_edits();

revoke execute on function public.active_cleaning_opportunities_restrict_agent_edits() from public;
revoke execute on function public.active_cleaning_opportunities_restrict_agent_edits() from anon;
revoke execute on function public.active_cleaning_opportunities_restrict_agent_edits() from authenticated;

-- Keeps updated_at current on every edit without every Server Action
-- having to set it by hand.
create or replace function public.active_cleaning_opportunities_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists active_cleaning_opportunities_updated_at_trigger
  on public.active_cleaning_opportunities;

create trigger active_cleaning_opportunities_updated_at_trigger
  before update on public.active_cleaning_opportunities
  for each row
  execute function public.active_cleaning_opportunities_set_updated_at();

revoke execute on function public.active_cleaning_opportunities_set_updated_at() from public;
revoke execute on function public.active_cleaning_opportunities_set_updated_at() from anon;
revoke execute on function public.active_cleaning_opportunities_set_updated_at() from authenticated;

-- Audit log: who created/edited/assigned/archived/restored/deleted/merged
-- a record and when - a separate table (not crm_activities, which is the
-- agent-facing call/note timeline the brief asks to reuse for a different
-- purpose) since this is a system-of-record trail admins review, not
-- something agents write to directly. opportunity_id is ON DELETE SET
-- NULL (not CASCADE) so a permanent-delete's own audit entry survives the
-- deletion it's recording, with a title snapshot so it stays legible once
-- the source row is gone.
create table if not exists public.active_cleaning_opportunities_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  opportunity_id uuid references public.active_cleaning_opportunities(id) on delete set null,
  opportunity_title_snapshot text not null,
  actor_id uuid references public.crm_users(id) on delete set null,
  action text not null check (action in (
    'created', 'edited', 'assigned', 'reassigned', 'unassigned',
    'status_changed', 'archived', 'restored', 'deleted', 'merged'
  )),
  details text
);

create index if not exists active_cleaning_opportunities_audit_log_opportunity_idx
  on public.active_cleaning_opportunities_audit_log (opportunity_id, created_at desc);

alter table public.active_cleaning_opportunities_audit_log enable row level security;

-- Admin-only read. No insert/update/delete policy for any role - every row
-- is written either by the trigger below (security definer, bypasses RLS
-- the same way crm_user_role does) or by the merge action's service-role
-- client call (src/app/admin/(dashboard)/crm/opportunities/actions.ts),
-- never directly by a session-scoped client.
create policy "active_cleaning_opportunities_audit_log_admin_select"
  on public.active_cleaning_opportunities_audit_log for select
  using (public.crm_user_role(auth.uid()) = 'admin');

create or replace function public.active_cleaning_opportunities_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  action_name text;
  detail text;
begin
  if tg_op = 'DELETE' then
    insert into public.active_cleaning_opportunities_audit_log
      (opportunity_id, opportunity_title_snapshot, actor_id, action, details)
    values (old.id, old.opportunity_title, actor, 'deleted', null);
    return old;
  end if;

  if tg_op = 'INSERT' then
    action_name := 'created';
  elsif new.archived_at is not null and old.archived_at is null then
    action_name := 'archived';
  elsif new.archived_at is null and old.archived_at is not null then
    action_name := 'restored';
  elsif new.assigned_agent is distinct from old.assigned_agent then
    action_name := case
      when old.assigned_agent is null then 'assigned'
      when new.assigned_agent is null then 'unassigned'
      else 'reassigned'
    end;
  elsif new.status is distinct from old.status then
    action_name := 'status_changed';
    detail := old.status || ' -> ' || new.status;
  else
    action_name := 'edited';
  end if;

  insert into public.active_cleaning_opportunities_audit_log
    (opportunity_id, opportunity_title_snapshot, actor_id, action, details)
  values (new.id, new.opportunity_title, actor, action_name, detail);

  return new;
end;
$$;

drop trigger if exists active_cleaning_opportunities_audit_trigger
  on public.active_cleaning_opportunities;

create trigger active_cleaning_opportunities_audit_trigger
  after insert or update or delete on public.active_cleaning_opportunities
  for each row
  execute function public.active_cleaning_opportunities_audit();

revoke execute on function public.active_cleaning_opportunities_audit() from public;
revoke execute on function public.active_cleaning_opportunities_audit() from anon;
revoke execute on function public.active_cleaning_opportunities_audit() from authenticated;
