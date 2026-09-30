-- Growth CRM: automatic Approved Call Script open/closed tracking.
--
-- Mirrors leadgen_agent_script_status (20260930110000) for the Growth CRM, as
-- its own table so the two CRMs' data stay separate. One row per
-- (agent, call list) holding only the CRM script-panel state. Growth ownership
-- is unchanged (Winsalot Corp -> Campaign/List -> Agent(s) -> Leads); no client
-- or assignment data is stored or duplicated here - agent and list reference
-- the existing crm_users / call_list_segments rows.
--
-- Access model (no broad grants):
--   * Writes: service_role only, from a server action that first verifies the
--     signed-in agent is assigned to the list.
--   * Reads: Admin only (RLS). Agents cannot read any status row, so an agent
--     never sees another agent's status.
-- Additive only; no existing table, row, policy or grant is changed.

create table if not exists public.crm_agent_script_status (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.crm_users(id) on delete cascade,
  segment_id uuid not null references public.call_list_segments(id) on delete cascade,
  service_key text,
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
  constraint crm_agent_script_status_one_per_agent_list unique (agent_id, segment_id)
);

create index if not exists crm_agent_script_status_segment_idx
  on public.crm_agent_script_status(segment_id);

alter table public.crm_agent_script_status enable row level security;

drop policy if exists "crm_agent_script_status_admin_select" on public.crm_agent_script_status;
create policy "crm_agent_script_status_admin_select"
  on public.crm_agent_script_status for select
  using (public.crm_user_role(auth.uid()) = 'admin');

revoke all on table public.crm_agent_script_status from anon, authenticated;
grant select on table public.crm_agent_script_status to authenticated;
grant all on table public.crm_agent_script_status to service_role;

comment on table public.crm_agent_script_status is
  'Growth CRM approved call script panel state per agent and call list (open/closed, opened at, last script activity). Written only by reportGrowthScriptStateAction via service_role; readable by Admin only. No screenshots, keystrokes or other browser activity are recorded.';
