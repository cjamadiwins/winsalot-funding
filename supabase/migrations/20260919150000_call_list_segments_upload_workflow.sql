-- Replaces the Google Sheets OAuth/sync design from migration
-- 20260919120000_call_list_segments.sql with a simpler, fully-internal
-- workflow: Admin uploads a CSV/XLSX export (from LeadSwift or anywhere
-- else) straight into the CRM, cleans it in a spreadsheet-style editor
-- while it's a Draft, then Deploys it to one or more agents. There is no
-- external Google account, OAuth grant, or recurring sync involved
-- anymore - the CRM itself is now the staging spreadsheet.
--
-- Kept from the previous migration, unchanged: call_list_segments (crm
-- discriminator, name, growth_opportunity_type/leadgen_campaign_id,
-- created_by, unique(crm, name)) and call_list_segment_agents (the
-- assigned-agent roster). The Google-specific pieces are removed below;
-- everything else about how a segment identifies itself and who it's
-- assigned to is unchanged.
--
-- New design in one paragraph: an uploaded row lands in the new
-- call_list_leads staging table, NOT directly in crm_opportunities/
-- leadgen_leads - this is what lets Admin freely edit/delete rows pre-
-- deployment without touching the real pipeline, and lets an agent work
-- a large raw call list (logging outcomes via the CRM's EXISTING
-- crm_call_logs/leadgen_call_logs tables, extended below with a
-- call_list_lead_id/call_list_segment_id link) without every single dial
-- attempt becoming a pipeline Opportunity/Lead. A row is only promoted
-- into crm_opportunities/leadgen_leads on an explicit Admin/agent action
-- once it's actually qualified (see src/lib/call-list-promote.ts) - that
-- promoted record keeps the call_list_segment_id column already added by
-- the previous migration, so its own future activity still reports back
-- to the segment.

-- ---------------------------------------------------------------------
-- 1. Drop the Google-specific pieces.
-- ---------------------------------------------------------------------
drop index if exists public.call_list_segments_tab_idx;

alter table public.call_list_segments drop constraint if exists call_list_segments_status_check;

alter table public.call_list_segments
  drop column if exists google_connection_id,
  drop column if exists spreadsheet_id,
  drop column if exists spreadsheet_url,
  drop column if exists sheet_tab_name,
  drop column if exists sheet_tab_gid,
  drop column if exists column_mapping,
  drop column if exists last_synced_at,
  drop column if exists last_sync_status,
  drop column if exists last_sync_summary;

-- No real data ever depended on the retired 'paused'/'error'/
-- 'disconnected' sync states (this feature has never had a working
-- Google connection configured) - remapped to 'archived' purely so this
-- migration is correct on any environment, not just a fresh one.
update public.call_list_segments set status = 'archived' where status in ('paused', 'error', 'disconnected');

alter table public.call_list_segments alter column status set default 'draft';
alter table public.call_list_segments
  add constraint call_list_segments_status_check
  check (status in ('draft', 'active', 'completed', 'archived'));

alter table public.call_list_segments
  add column if not exists campaign_name text,
  add column if not exists industry text,
  add column if not exists territory text,
  add column if not exists source_file_name text,
  add column if not exists source_file_type text check (source_file_type is null or source_file_type in ('csv', 'xlsx')),
  add column if not exists total_uploaded_rows integer not null default 0,
  add column if not exists deployed_at timestamptz,
  add column if not exists deployed_by uuid references auth.users(id) on delete set null;

drop table if exists public.call_list_sync_runs;
drop table if exists public.call_list_google_connections;

-- ---------------------------------------------------------------------
-- 2. call_list_leads: the staging/working table an uploaded row lives in
-- from the moment it's parsed until (optionally) promoted.
-- ---------------------------------------------------------------------
create table if not exists public.call_list_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  segment_id uuid not null references public.call_list_segments(id) on delete cascade,
  source_row_number integer,

  business_name text not null,
  contact_name text,
  phone text,
  email text,
  website text,
  city text,
  province text,
  industry text,
  notes text,
  -- Any uploaded column that doesn't map to one of the fixed fields
  -- above (LeadSwift exports vary) - {originalHeader: value}, editable
  -- the same way as a fixed column in the spreadsheet editor.
  extra_fields jsonb not null default '{}'::jsonb,

  -- Duplicate protection (brief item 4): computed on upload and
  -- re-checked on demand, never auto-deleted - Admin decides.
  is_possible_duplicate boolean not null default false,
  duplicate_reason text,
  -- Set when this row's phone/email matches an active
  -- crm_dnc_suppressions entry, surfaced the same way as a duplicate
  -- flag (never auto-removed from the list).
  dnc_flag boolean not null default false,

  -- Denormalized "current state" for the working list view, kept in
  -- sync by the call-logging server action whenever a new
  -- crm_call_logs/leadgen_call_logs row is inserted against this lead -
  -- the call log rows themselves remain the source of truth/history.
  last_outcome text,
  last_contacted_at timestamptz,
  callback_at timestamptz,

  -- Optional per-row assignment within a deployed segment - purely
  -- informational/filterable; RLS visibility is segment-level (any agent
  -- assigned to the segment via call_list_segment_agents can see and
  -- work every lead in it), matching the brief's "agents should receive
  -- a clean working view of ONLY the segments assigned to them."
  assigned_agent_id uuid references auth.users(id) on delete set null,

  -- Set once this row has been promoted into the real pipeline (brief
  -- item 9) - exactly one of these two is ever set, and only for the
  -- CRM this segment belongs to.
  promoted_opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  promoted_leadgen_lead_id uuid references public.leadgen_leads(id) on delete set null,
  promoted_at timestamptz,

  created_by uuid references auth.users(id) on delete set null
);

create index if not exists call_list_leads_segment_idx on public.call_list_leads(segment_id);
create index if not exists call_list_leads_segment_duplicate_idx on public.call_list_leads(segment_id) where is_possible_duplicate;
create index if not exists call_list_leads_phone_idx on public.call_list_leads(phone);
create index if not exists call_list_leads_callback_idx on public.call_list_leads(callback_at) where callback_at is not null;

create or replace function public.call_list_leads_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger call_list_leads_set_updated_at
  before update on public.call_list_leads
  for each row execute function public.call_list_leads_set_updated_at();

alter table public.call_list_leads enable row level security;

create policy "call_list_leads_growth_admin_all"
  on public.call_list_leads for all
  using (
    public.crm_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'growth')
  )
  with check (
    public.crm_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'growth')
  );

create policy "call_list_leads_leadgen_admin_all"
  on public.call_list_leads for all
  using (
    public.leadgen_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'lead_generation')
  )
  with check (
    public.leadgen_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'lead_generation')
  );

-- An agent may see and work a lead only once its segment is Deployed
-- (status active/completed - never draft or archived) AND they're on
-- that segment's agent roster. Update is granted the same way (the
-- working view only ever lets an agent change the denormalized call
-- state, never the imported contact fields - that's enforced by the
-- server action, not by column-level RLS, matching the pattern used
-- everywhere else in this app for "the DB allows more than the UI ever
-- sends").
create policy "call_list_leads_growth_agent_select"
  on public.call_list_leads for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'growth' and s.status in ('active', 'completed') and sa.agent_id = auth.uid()
    )
  );

create policy "call_list_leads_growth_agent_update"
  on public.call_list_leads for update
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'growth' and s.status = 'active' and sa.agent_id = auth.uid()
    )
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'growth' and s.status = 'active' and sa.agent_id = auth.uid()
    )
  );

create policy "call_list_leads_leadgen_agent_select"
  on public.call_list_leads for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'lead_generation' and s.status in ('active', 'completed') and sa.agent_id = auth.uid()
    )
  );

create policy "call_list_leads_leadgen_agent_update"
  on public.call_list_leads for update
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'lead_generation' and s.status = 'active' and sa.agent_id = auth.uid()
    )
  )
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'lead_generation' and s.status = 'active' and sa.agent_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 3. Extend the EXISTING Call Logs tables (crm_call_logs/leadgen_call_logs,
-- migration 0130) so a call worked from a Call List Segment feeds
-- straight into them - the brief's "Do NOT create a disconnected second
-- call history." Both tables already have no FK to any lead table by
-- design (a fast quick-log for calls that may never become a lead), so
-- these are simple additive, nullable columns; no existing row, policy,
-- or insert path is affected. No RLS change is needed either - the
-- existing "agent_id = auth.uid()" insert policy already covers writing
-- these new columns.
--
-- The outcome check constraint is widened at the same time to add
-- 'Interested' and 'Appointment Booked' (brief item 7's outcome list).
-- While here: 'Do Not Call' is also added - src/lib/call-log.ts's
-- CALL_LOG_OUTCOMES/DO_NOT_CALL_OUTCOME and both createGrowthCallLogAction/
-- createLeadgenCallLogAction have referenced it since migration 0130
-- shipped, but the database constraint never actually included it, so
-- selecting "Do Not Call" in the existing Call Log form has always
-- failed at the database - this migration is also what fixes that
-- pre-existing gap.
-- ---------------------------------------------------------------------
alter table public.crm_call_logs
  add column if not exists contact_name text,
  add column if not exists call_list_segment_id uuid references public.call_list_segments(id) on delete set null,
  add column if not exists call_list_lead_id uuid references public.call_list_leads(id) on delete set null,
  add column if not exists callback_at timestamptz,
  add column if not exists appointment_at timestamptz;

alter table public.crm_call_logs drop constraint if exists crm_call_logs_outcome_check;
alter table public.crm_call_logs
  add constraint crm_call_logs_outcome_check
  check (outcome in (
    'No Answer', 'Voicemail', 'Gatekeeper', 'Not Interested', 'Callback',
    'Do Not Call', 'Interested', 'Appointment Booked'
  ));

create index if not exists crm_call_logs_call_list_segment_idx on public.crm_call_logs(call_list_segment_id);
create index if not exists crm_call_logs_call_list_lead_idx on public.crm_call_logs(call_list_lead_id);

alter table public.leadgen_call_logs
  add column if not exists contact_name text,
  add column if not exists call_list_segment_id uuid references public.call_list_segments(id) on delete set null,
  add column if not exists call_list_lead_id uuid references public.call_list_leads(id) on delete set null,
  add column if not exists callback_at timestamptz,
  add column if not exists appointment_at timestamptz;

alter table public.leadgen_call_logs drop constraint if exists leadgen_call_logs_outcome_check;
alter table public.leadgen_call_logs
  add constraint leadgen_call_logs_outcome_check
  check (outcome in (
    'No Answer', 'Voicemail', 'Gatekeeper', 'Not Interested', 'Callback',
    'Do Not Call', 'Interested', 'Appointment Booked'
  ));

create index if not exists leadgen_call_logs_call_list_segment_idx on public.leadgen_call_logs(call_list_segment_id);
create index if not exists leadgen_call_logs_call_list_lead_idx on public.leadgen_call_logs(call_list_lead_id);

comment on table public.call_list_leads is
  'Staging/working rows for a Call List Segment - uploaded, cleaned, and (once Deployed) worked here before any optional promotion into crm_opportunities/leadgen_leads.';
