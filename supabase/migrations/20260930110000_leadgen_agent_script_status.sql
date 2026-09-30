-- Lead Generation CRM: automatic Approved Call Script open/closed tracking.
--
-- One row per (agent, call list) holding only the CRM script-panel state:
-- whether the agent currently has the approved script open while working
-- that list. Additive only - no existing table, row, policy or grant is
-- changed. The client/campaign are taken from the existing
-- Client -> Campaign/List -> Agent relationship (call_list_segments.
-- leadgen_campaign_id -> leadgen_campaigns.client_id); nothing is duplicated.
--
-- Access model (no broad grants):
--   * Writes: service_role only, from a server action that first verifies the
--     signed-in agent is assigned to the list. Agents cannot insert/update.
--   * Reads: Admin only (RLS). Agents cannot read any status row, so one agent
--     never sees another agent's monitoring/status information.

create table if not exists public.leadgen_agent_script_status (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.leadgen_users(id) on delete cascade,
  segment_id uuid not null references public.call_list_segments(id) on delete cascade,
  client_id uuid references public.leadgen_clients(id) on delete set null,
  campaign_id uuid references public.leadgen_campaigns(id) on delete set null,
  script_open boolean not null default false,
  is_working boolean not null default false,
  opened_at timestamptz,
  closed_since timestamptz,
  last_activity_at timestamptz,
  last_heartbeat_at timestamptz not null default now(),
  last_opened_notified_at timestamptz,
  last_closed_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leadgen_agent_script_status_one_per_agent_list unique (agent_id, segment_id)
);

create index if not exists leadgen_agent_script_status_segment_idx
  on public.leadgen_agent_script_status(segment_id);

alter table public.leadgen_agent_script_status enable row level security;

drop policy if exists "leadgen_agent_script_status_admin_select" on public.leadgen_agent_script_status;
create policy "leadgen_agent_script_status_admin_select"
  on public.leadgen_agent_script_status for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

revoke all on table public.leadgen_agent_script_status from anon, authenticated;
grant select on table public.leadgen_agent_script_status to authenticated;
grant all on table public.leadgen_agent_script_status to service_role;

comment on table public.leadgen_agent_script_status is
  'Approved Call Script panel state per agent and call list (open/closed, opened at, last script activity). Written only by the server action reportLeadgenScriptStateAction via service_role; readable by Admin only. No screenshots, keystrokes or other browser activity are recorded.';
