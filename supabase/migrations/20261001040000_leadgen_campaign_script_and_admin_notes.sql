-- Lead Generation CRM: create/edit a campaign from the Call List Assignment panel.
--
-- Purely additive - no existing table, column, row, policy, trigger or function
-- is altered or removed, and no existing row changes value.
--
--   leadgen_campaigns.call_script_text
--     Optional campaign-level custom call script. Resolution order for agents is
--     list script (call_list_segments.call_script_text) -> campaign script ->
--     the client's script (leadgen_clients.call_script_override / structured
--     fields). NULL everywhere today, so current behaviour is unchanged until an
--     Admin writes one. Same visibility as the table's other columns (existing
--     policies: admin all, agents/clients select) - no policy change needed.
--
--   leadgen_campaign_admin_notes
--     Internal Admin notes for a campaign. Kept in its own table, NOT a column on
--     leadgen_campaigns, because leadgen_campaigns is selectable by agents and by
--     the client portal; these notes must be Admin-only. RLS is enabled with a
--     single admin policy and no agent/client policy, so only Admin (and the
--     service role used by server actions) can read or write them.

alter table public.leadgen_campaigns
  add column if not exists call_script_text text;

comment on column public.leadgen_campaigns.call_script_text is
  'Optional Admin-written custom call script for this campaign. Blank/NULL = use the client script. A list-level script (call_list_segments.call_script_text) still takes precedence for that list.';

create table if not exists public.leadgen_campaign_admin_notes (
  campaign_id uuid primary key references public.leadgen_campaigns(id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.leadgen_campaign_admin_notes enable row level security;

drop policy if exists "leadgen_campaign_admin_notes_admin_all" on public.leadgen_campaign_admin_notes;
create policy "leadgen_campaign_admin_notes_admin_all"
  on public.leadgen_campaign_admin_notes for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

comment on table public.leadgen_campaign_admin_notes is
  'Internal Admin-only notes per Lead Generation campaign. Never exposed to agents or the client portal.';
