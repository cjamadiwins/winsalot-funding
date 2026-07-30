-- Attendance tracking for CRM agents: Clock In / Clock Out, with date,
-- time, and total hours worked recorded per session. Same admin/agent
-- split as every other table in this CRM - admins see every agent's
-- attendance, agents only ever see their own (crm_user_role(), see
-- migration 0007).

create table if not exists public.crm_attendance (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent_id uuid not null references public.crm_users(id) on delete cascade,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  -- Null while still clocked in; computed once clock_out_at is set so
  -- every reader (agent view, admin view) sees the same figure without
  -- re-deriving it client-side.
  total_hours numeric generated always as (
    case
      when clock_out_at is null then null
      else round((extract(epoch from (clock_out_at - clock_in_at)) / 3600.0)::numeric, 2)
    end
  ) stored,
  constraint crm_attendance_clock_out_after_in check (clock_out_at is null or clock_out_at > clock_in_at)
);

create index if not exists crm_attendance_agent_idx
  on public.crm_attendance(agent_id, clock_in_at desc);

-- Enforces "one open session per agent" at the database level, not just
-- in application code - a second Clock In while already clocked in fails
-- this unique index rather than silently creating an overlapping session.
create unique index if not exists crm_attendance_one_open_session_per_agent
  on public.crm_attendance(agent_id)
  where clock_out_at is null;

alter table public.crm_attendance enable row level security;

create policy "crm_attendance_admin_all"
  on public.crm_attendance for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_attendance_agent_select_own"
  on public.crm_attendance for select
  using (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent');

-- Covers "Clock In" - always inserted with clock_out_at left null.
create policy "crm_attendance_agent_insert_own"
  on public.crm_attendance for insert
  with check (
    agent_id = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and clock_out_at is null
  );

-- Covers "Clock Out" (setting clock_out_at on their own session). No
-- agent delete policy, matching every other table in this CRM - only
-- admins (crm_attendance_admin_all above) can remove a record.
create policy "crm_attendance_agent_update_own"
  on public.crm_attendance for update
  using (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent')
  with check (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent');
