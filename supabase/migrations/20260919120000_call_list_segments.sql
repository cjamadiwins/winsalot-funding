-- Admin-only "Call List Segments" feature: an Admin connects a Google
-- Sheet (via a secure per-admin Google OAuth connection - never a public/
-- view-only link) as the editable master call list for a named segment,
-- in both the Growth CRM and the Lead Generation CRM. Google Sheets stays
-- the source of *editable lead details*; the CRM stays the source of all
-- work history. Purely additive, same convention as every migration in
-- this repo: no existing table, column, row, policy, or trigger is
-- altered or removed.
--
-- Design notes (see also src/lib/call-list-*.ts):
--   * Both CRMs share these new tables (crm text discriminator column),
--     the same way crm_dnc_suppressions (migration 0157) is shared - but
--     every RLS policy below still keeps the two CRMs' admin/agent role
--     models (crm_user_role vs leadgen_user_role) completely separate,
--     exactly like every other shared/cross-CRM table in this schema.
--   * Google OAuth tokens are secrets, not just admin-visible data - so
--     call_list_google_connections gets RLS enabled with NO policies at
--     all (same "service-role client only" pattern as crm_dnc_suppressions/
--     crm_dnc_audit_log), never selected through the browser session
--     client even by an admin.
--   * A synced lead's agent stays visible to normal agent RLS with ZERO
--     new agent policies on crm_opportunities/leadgen_leads: new leads
--     created by a sync are assigned (round-robin) directly to one of the
--     segment's assigned agents via the existing assigned_agent_id column,
--     so the pre-existing "assigned_agent_id = auth.uid()" policies
--     already govern agent visibility correctly.
--   * "Call log automatically linked to lead + segment" is implemented as
--     a denormalized, trigger-maintained call_list_segment_id column on
--     crm_activities/crm_followups/leadgen_lead_activities/leadgen_followups
--     (the tables that are already FK-linked to a lead/opportunity) - the
--     separate, deliberately lead-decoupled crm_call_logs/leadgen_call_logs
--     quick-log tables (migration 0130) are untouched, per the brief's
--     "Do not change... call-log functions."
--   * Duplicate/DNC checks and the sheet <-> CRM diff run entirely in
--     application code (src/lib/call-list-sync.ts) against the normalized
--     phone/business-name already available on crm_opportunities/
--     leadgen_leads - no synthetic per-row key column is needed, which
--     also sidesteps Google Sheets rows having no stable identity of
--     their own (a deleted/re-inserted row has no persistent row id).

-- ---------------------------------------------------------------------
-- call_list_google_connections: one Google account OAuth grant per
-- connection. Multiple segments may reuse the same connection (one
-- Google Sheet can have several tabs, each its own segment).
-- ---------------------------------------------------------------------
create table if not exists public.call_list_google_connections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  crm text not null check (crm in ('growth', 'lead_generation')),
  connected_by uuid not null references auth.users(id) on delete restrict,
  google_email text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  token_expires_at timestamptz not null,
  scope text not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'error')),
  last_error text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);

create index if not exists call_list_google_connections_crm_idx on public.call_list_google_connections(crm, status);

create or replace function public.call_list_google_connections_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger call_list_google_connections_set_updated_at
  before update on public.call_list_google_connections
  for each row execute function public.call_list_google_connections_set_updated_at();

alter table public.call_list_google_connections enable row level security;
-- Deliberately no policies (see header note) - service-role only, always
-- through src/lib/call-list-connections.ts after an app-level
-- requireCrmAdmin()/requireLeadgenAdmin() check.

-- ---------------------------------------------------------------------
-- call_list_segments
-- ---------------------------------------------------------------------
create table if not exists public.call_list_segments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  crm text not null check (crm in ('growth', 'lead_generation')),
  name text not null check (length(trim(name)) > 0),
  google_connection_id uuid not null references public.call_list_google_connections(id) on delete restrict,
  spreadsheet_id text not null,
  spreadsheet_url text not null,
  sheet_tab_name text not null,
  sheet_tab_gid integer not null,
  column_mapping jsonb not null default '{}'::jsonb,

  -- Growth CRM: which crm_opportunities.opportunity_type new leads from
  -- this segment become. Lead Generation CRM: which campaign (and, via
  -- it, which client) new leads belong to. Exactly one side is set,
  -- matching which CRM owns this segment.
  growth_opportunity_type text check (growth_opportunity_type in ('lead_generation', 'business_financing', 'both_services')),
  leadgen_campaign_id uuid references public.leadgen_campaigns(id) on delete restrict,

  status text not null default 'active' check (status in ('active', 'paused', 'error', 'disconnected')),
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'partial', 'error')),
  last_sync_summary jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,

  constraint call_list_segments_crm_fields check (
    (crm = 'growth' and growth_opportunity_type is not null and leadgen_campaign_id is null)
    or
    (crm = 'lead_generation' and leadgen_campaign_id is not null and growth_opportunity_type is null)
  ),
  unique (crm, name)
);

-- "Each connected Google Sheet or individual sheet tab must create a
-- unique named Call List Segment" - one tab can back at most one segment.
create unique index if not exists call_list_segments_tab_idx
  on public.call_list_segments(spreadsheet_id, sheet_tab_gid);
create index if not exists call_list_segments_crm_idx on public.call_list_segments(crm, status);
create index if not exists call_list_segments_connection_idx on public.call_list_segments(google_connection_id);

create or replace function public.call_list_segments_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger call_list_segments_set_updated_at
  before update on public.call_list_segments
  for each row execute function public.call_list_segments_set_updated_at();

alter table public.call_list_segments enable row level security;

create policy "call_list_segments_growth_admin_all"
  on public.call_list_segments for all
  using (crm = 'growth' and public.crm_user_role(auth.uid()) = 'admin')
  with check (crm = 'growth' and public.crm_user_role(auth.uid()) = 'admin');

create policy "call_list_segments_leadgen_admin_all"
  on public.call_list_segments for all
  using (crm = 'lead_generation' and public.leadgen_user_role(auth.uid()) = 'admin')
  with check (crm = 'lead_generation' and public.leadgen_user_role(auth.uid()) = 'admin');

-- Note: the agent-select policies for call_list_segments (read-only
-- visibility into a segment an agent is assigned to) are created further
-- below, once call_list_segment_agents exists for them to reference.

-- ---------------------------------------------------------------------
-- call_list_segment_agents: the roster of agents a segment's Admin has
-- assigned it to. Also the pool new synced leads are round-robin
-- assigned across (see src/lib/call-list-sync.ts).
-- ---------------------------------------------------------------------
create table if not exists public.call_list_segment_agents (
  segment_id uuid not null references public.call_list_segments(id) on delete cascade,
  agent_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (segment_id, agent_id)
);

alter table public.call_list_segment_agents enable row level security;

create policy "call_list_segment_agents_growth_admin_all"
  on public.call_list_segment_agents for all
  using (
    public.crm_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'growth')
  )
  with check (
    public.crm_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'growth')
  );

create policy "call_list_segment_agents_leadgen_admin_all"
  on public.call_list_segment_agents for all
  using (
    public.leadgen_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'lead_generation')
  )
  with check (
    public.leadgen_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'lead_generation')
  );

create policy "call_list_segment_agents_self_select"
  on public.call_list_segment_agents for select
  using (agent_id = auth.uid());

-- Agents may see (read-only) the segments they're assigned to, purely so
-- the CRM can show "this lead's Call List Segment is X" and let an agent
-- filter their own lead list by segment - they can never create, edit,
-- reconnect, or sync a segment; that stays Admin-only per the brief.
create policy "call_list_segments_growth_agent_select_assigned"
  on public.call_list_segments for select
  using (
    crm = 'growth'
    and public.crm_user_role(auth.uid()) = 'agent'
    and exists (select 1 from public.call_list_segment_agents sa where sa.segment_id = id and sa.agent_id = auth.uid())
  );

create policy "call_list_segments_leadgen_agent_select_assigned"
  on public.call_list_segments for select
  using (
    crm = 'lead_generation'
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (select 1 from public.call_list_segment_agents sa where sa.segment_id = id and sa.agent_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- call_list_sync_runs: one row per "Sync Now" (or future scheduled sync),
-- with the exact summary counts the brief requires shown per run and
-- mirrored onto call_list_segments.last_sync_summary for the latest one.
-- ---------------------------------------------------------------------
create table if not exists public.call_list_sync_runs (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.call_list_segments(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'error')),
  triggered_by uuid references auth.users(id) on delete set null,
  new_leads_count integer not null default 0,
  updated_count integer not null default 0,
  duplicates_skipped_count integer not null default 0,
  dnc_skipped_count integer not null default 0,
  archived_count integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  error_message text
);

create index if not exists call_list_sync_runs_segment_idx on public.call_list_sync_runs(segment_id, started_at desc);

alter table public.call_list_sync_runs enable row level security;

create policy "call_list_sync_runs_growth_admin_all"
  on public.call_list_sync_runs for all
  using (
    public.crm_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'growth')
  )
  with check (
    public.crm_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'growth')
  );

create policy "call_list_sync_runs_leadgen_admin_all"
  on public.call_list_sync_runs for all
  using (
    public.leadgen_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'lead_generation')
  )
  with check (
    public.leadgen_user_role(auth.uid()) = 'admin'
    and exists (select 1 from public.call_list_segments s where s.id = segment_id and s.crm = 'lead_generation')
  );

-- ---------------------------------------------------------------------
-- Additive columns on the existing lead tables: permanent segment
-- linkage + non-destructive archive flag ("mark Archived / Removed from
-- source. Do not delete the lead, call logs, or history"). Also two new
-- *list* fields (website for Growth, source_notes for both) so a sync
-- never has to write into an agent-owned notes field to represent
-- sheet-sourced context.
-- ---------------------------------------------------------------------
alter table public.crm_opportunities
  add column if not exists call_list_segment_id uuid references public.call_list_segments(id) on delete set null,
  add column if not exists website text,
  add column if not exists source_notes text,
  add column if not exists archived boolean not null default false,
  add column if not exists archived_reason text,
  add column if not exists archived_at timestamptz;

create index if not exists crm_opportunities_call_list_segment_idx on public.crm_opportunities(call_list_segment_id);

alter table public.leadgen_leads
  add column if not exists call_list_segment_id uuid references public.call_list_segments(id) on delete set null,
  add column if not exists source_notes text,
  add column if not exists archived boolean not null default false,
  add column if not exists archived_reason text,
  add column if not exists archived_at timestamptz;

create index if not exists leadgen_leads_call_list_segment_idx on public.leadgen_leads(call_list_segment_id);

-- ---------------------------------------------------------------------
-- Denormalized, trigger-maintained call_list_segment_id on the
-- activity/follow-up tables already FK-linked to a lead/opportunity, so
-- "every new call-log entry is automatically linked to the lead's Call
-- List Segment" without touching any existing insert code path, and so
-- the Admin segment performance view can filter/count these directly
-- instead of joining back through the lead every time.
-- ---------------------------------------------------------------------
alter table public.crm_activities add column if not exists call_list_segment_id uuid references public.call_list_segments(id) on delete set null;
alter table public.crm_followups add column if not exists call_list_segment_id uuid references public.call_list_segments(id) on delete set null;
alter table public.leadgen_lead_activities add column if not exists call_list_segment_id uuid references public.call_list_segments(id) on delete set null;
alter table public.leadgen_followups add column if not exists call_list_segment_id uuid references public.call_list_segments(id) on delete set null;

create index if not exists crm_activities_call_list_segment_idx on public.crm_activities(call_list_segment_id, occurred_at desc);
create index if not exists crm_followups_call_list_segment_idx on public.crm_followups(call_list_segment_id);
create index if not exists leadgen_lead_activities_call_list_segment_idx on public.leadgen_lead_activities(call_list_segment_id, occurred_at desc);
create index if not exists leadgen_followups_call_list_segment_idx on public.leadgen_followups(call_list_segment_id);

create or replace function public.crm_activities_set_call_list_segment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.call_list_segment_id is null and new.opportunity_id is not null then
    select call_list_segment_id into new.call_list_segment_id
    from public.crm_opportunities where id = new.opportunity_id;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_activities_set_call_list_segment_trigger on public.crm_activities;
create trigger crm_activities_set_call_list_segment_trigger
  before insert on public.crm_activities
  for each row execute function public.crm_activities_set_call_list_segment();

create or replace function public.crm_followups_set_call_list_segment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.call_list_segment_id is null and new.opportunity_id is not null then
    select call_list_segment_id into new.call_list_segment_id
    from public.crm_opportunities where id = new.opportunity_id;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_followups_set_call_list_segment_trigger on public.crm_followups;
create trigger crm_followups_set_call_list_segment_trigger
  before insert on public.crm_followups
  for each row execute function public.crm_followups_set_call_list_segment();

create or replace function public.leadgen_lead_activities_set_call_list_segment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.call_list_segment_id is null and new.lead_id is not null then
    select call_list_segment_id into new.call_list_segment_id
    from public.leadgen_leads where id = new.lead_id;
  end if;
  return new;
end;
$$;

drop trigger if exists leadgen_lead_activities_set_call_list_segment_trigger on public.leadgen_lead_activities;
create trigger leadgen_lead_activities_set_call_list_segment_trigger
  before insert on public.leadgen_lead_activities
  for each row execute function public.leadgen_lead_activities_set_call_list_segment();

create or replace function public.leadgen_followups_set_call_list_segment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.call_list_segment_id is null and new.lead_id is not null then
    select call_list_segment_id into new.call_list_segment_id
    from public.leadgen_leads where id = new.lead_id;
  end if;
  return new;
end;
$$;

drop trigger if exists leadgen_followups_set_call_list_segment_trigger on public.leadgen_followups;
create trigger leadgen_followups_set_call_list_segment_trigger
  before insert on public.leadgen_followups
  for each row execute function public.leadgen_followups_set_call_list_segment();

revoke execute on function public.crm_activities_set_call_list_segment() from public, anon, authenticated;
revoke execute on function public.crm_followups_set_call_list_segment() from public, anon, authenticated;
revoke execute on function public.leadgen_lead_activities_set_call_list_segment() from public, anon, authenticated;
revoke execute on function public.leadgen_followups_set_call_list_segment() from public, anon, authenticated;

comment on table public.call_list_segments is
  'Admin-only Call List Segments: one named, permanently-tagged segment per connected Google Sheet tab, shared schema across the Growth CRM and Lead Generation CRM.';
comment on table public.call_list_google_connections is
  'Secure per-admin Google OAuth grants used to read a Call List Segment''s source Google Sheet. Service-role access only - never exposed to a browser session, even an admin''s.';
