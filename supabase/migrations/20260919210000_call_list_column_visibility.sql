-- Admin-controlled "Hide Columns" for the Call List Segments spreadsheet,
-- both CRMs. No existing structure can hold this: user_time_zone_
-- preferences (migration 0065) is per-individual-user with fixed typed
-- columns, no JSONB/array, and no admin-shared scope; call_list_segments
-- had its only JSONB columns (column_mapping, last_sync_summary) dropped
-- in 20260919150000_call_list_segments_upload_workflow.sql when the
-- Google Sheets sync design was retired, and nothing replaced them. A
-- migration is genuinely needed.
--
-- Follows this schema's own established pattern for an admin-controlled,
-- CRM-wide toggle (see winsalot_incentive_settings, migration
-- 0059_agent_incentive_ledger.sql, and winsalot_appointment_reminder_
-- settings, migration 0126): one singleton row per CRM, admin can read/
-- write it, agents can only read it (never write) - "Enforce this
-- server-side" per the brief, not just hide the button in the UI.
--
-- This only changes what the Call List *displays* - hidden_fields is
-- purely a list of field keys the UI skips rendering. It never touches
-- call_list_leads itself: no column is dropped, no imported data is
-- deleted or altered, and nothing here can affect Call Logs, notes,
-- assignments, or duplicate checking, all of which read call_list_leads
-- directly and have no awareness of this table.
create table if not exists public.call_list_column_visibility (
  crm text primary key check (crm in ('growth', 'lead_generation')),
  -- Each entry is either a fixed field's own key (e.g. 'business_name',
  -- 'last_outcome', 'callback_at') or an imported extra_fields column
  -- prefixed 'extra:' (e.g. 'extra:IS_WORDPRESS') - the 'extra:' prefix
  -- keeps an imported column that happens to share a name with a fixed
  -- field (e.g. a source file with its own "Phone" header already mapped
  -- into extra_fields under a different key) from colliding with it.
  hidden_fields text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- One row per CRM to update in place (never insert a second row) -
-- mirrors the same on-conflict-do-nothing seed used by every other
-- singleton settings table in this schema.
insert into public.call_list_column_visibility (crm) values ('growth'), ('lead_generation')
  on conflict (crm) do nothing;

alter table public.call_list_column_visibility enable row level security;

create policy "call_list_column_visibility_growth_admin_all"
  on public.call_list_column_visibility for all
  using (crm = 'growth' and public.crm_user_role(auth.uid()) = 'admin')
  with check (crm = 'growth' and public.crm_user_role(auth.uid()) = 'admin');

create policy "call_list_column_visibility_growth_agent_select"
  on public.call_list_column_visibility for select
  using (crm = 'growth' and public.crm_user_role(auth.uid()) = 'agent');

create policy "call_list_column_visibility_leadgen_admin_all"
  on public.call_list_column_visibility for all
  using (crm = 'lead_generation' and public.leadgen_user_role(auth.uid()) = 'admin')
  with check (crm = 'lead_generation' and public.leadgen_user_role(auth.uid()) = 'admin');

create policy "call_list_column_visibility_leadgen_agent_select"
  on public.call_list_column_visibility for select
  using (crm = 'lead_generation' and public.leadgen_user_role(auth.uid()) = 'agent');

comment on table public.call_list_column_visibility is
  'Admin-controlled column visibility for the Call List Segments spreadsheet - display only, never affects call_list_leads data, Call Logs, notes, assignments, or duplicate checking. One row per CRM (growth / lead_generation).';
comment on column public.call_list_column_visibility.hidden_fields is
  'Field keys currently hidden from the Call List display - a fixed field''s own key, or an imported extra_fields column as ''extra:<name>''. Agents never see anything in this list; Admin can re-enable any entry at any time.';
