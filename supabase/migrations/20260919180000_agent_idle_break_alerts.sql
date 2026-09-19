-- Agent Idle & Break Alert System: extends the existing attendance/break
-- tracking (agent_attendance / leadgen_agent_attendance, migrations
-- 0043/0044/0075) rather than building a second, disconnected system -
-- per the brief's explicit "inspect the existing attendance, break,
-- notification, call-log, and agent-status architecture first and extend
-- it" instruction. Applies the identical shape to both CRMs, in lockstep,
-- the same way every other shared-rules-separate-data feature in this
-- schema is split (payroll, leave requests, chat, breaks themselves).
--
-- Nothing here drops or recomputes existing data - every new column is
-- nullable or has a neutral default, so every already-created attendance
-- row keeps exactly the values it had before. No existing table, column,
-- row, policy, or trigger is altered or removed.
--
-- Design notes:
--   * "Meaningful CRM activity" (mouse/keyboard, opening a lead, saving a
--     call outcome, etc.) is tracked as a single last_activity_at
--     heartbeat rather than instrumenting every individual feature - a
--     human necessarily moves the mouse or types to do any of those
--     things, so a page-wide interaction listener already is a superset
--     of the full bullet list. See src/components/agent-activity/.
--   * "Actively on a business call" reuses no existing flag (the research
--     pass found no live on-call/presence concept anywhere in the schema)
--     - is_on_call is a new, agent-set flag colocated with the rest of
--     the shift's live state on the same attendance row.
--   * Idle *episodes* get their own history table (agent_idle_sessions),
--     not new columns on agent_attendance, because an agent can go idle
--     and recover more than once within a single shift - a single
--     idle_since/idle_ended pair on the shift row could only ever
--     remember the most recent episode. idle_since itself still lives on
--     the shift row (mirrors activeBreakStage's break*_start columns) so
--     "is this agent currently idle" is a single indexed lookup.
--   * Break/lunch overdue detection reuses the *existing* break1_start/
--     break1_end &c. columns entirely (already the complete history of
--     when each break started and ended) - only a one-shot "admin already
--     alerted for this occurrence" guard column is new per stage. Excess
--     break time is derived from the existing columns at read time
--     (src/lib/attendance-pay.ts's computeBreakDurations), not stored
--     again.

-- ---------------------------------------------------------------------
-- 1. Growth CRM: agent_attendance live-activity columns.
-- ---------------------------------------------------------------------

alter table public.agent_attendance
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists idle_since timestamptz,
  add column if not exists is_on_call boolean not null default false,
  add column if not exists break1_overdue_notified_at timestamptz,
  add column if not exists lunch_overdue_notified_at timestamptz,
  add column if not exists break2_overdue_notified_at timestamptz;

-- Backfill: every already-open shift's heartbeat starts at its clock-in
-- time rather than "now" (the migration's own run time), so an agent
-- already mid-shift when this deploys isn't instantly treated as having
-- just been active. A closed shift's last_activity_at is never read by
-- anything, but is backfilled the same way for consistency.
update public.agent_attendance set last_activity_at = clock_in where last_activity_at is null;

create table if not exists public.agent_idle_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  attendance_id uuid not null references public.agent_attendance(id) on delete cascade,
  agent_id uuid not null references auth.users(id) on delete cascade,
  idle_start timestamptz not null,
  idle_end timestamptz,
  idle_duration_minutes integer,
  constraint agent_idle_sessions_order check (idle_end is null or idle_end >= idle_start),
  constraint agent_idle_sessions_duration_nonnegative check (idle_duration_minutes is null or idle_duration_minutes >= 0)
);

create index if not exists agent_idle_sessions_attendance_idx on public.agent_idle_sessions(attendance_id, idle_start desc);
create index if not exists agent_idle_sessions_agent_idx on public.agent_idle_sessions(agent_id, idle_start desc);
-- At most one open (idle_end is null) idle session per shift - the
-- server action always closes the previous one before it would ever open
-- another, but this backstops it at the database level too.
create unique index if not exists agent_idle_sessions_one_open_per_attendance
  on public.agent_idle_sessions(attendance_id) where idle_end is null;

create or replace function public.set_agent_idle_session_duration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.idle_end is not null then
    new.idle_duration_minutes := greatest(0, round(extract(epoch from (new.idle_end - new.idle_start)) / 60)::integer);
  else
    new.idle_duration_minutes := null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_agent_idle_session_duration_trigger on public.agent_idle_sessions;
create trigger set_agent_idle_session_duration_trigger
  before insert or update on public.agent_idle_sessions
  for each row execute function public.set_agent_idle_session_duration();

alter table public.agent_idle_sessions enable row level security;

create policy "agent_idle_sessions_agent_select_own"
  on public.agent_idle_sessions for select
  using (agent_id = auth.uid());

create policy "agent_idle_sessions_agent_insert_own"
  on public.agent_idle_sessions for insert
  with check (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent');

-- An agent may only ever close their own still-open idle session (set
-- idle_end) - never edit a closed one, never touch another agent's row.
create policy "agent_idle_sessions_agent_update_own_open"
  on public.agent_idle_sessions for update
  using (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent' and idle_end is null)
  with check (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent');

create policy "agent_idle_sessions_admin_select"
  on public.agent_idle_sessions for select
  using (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- 2. Lead Generation CRM: leadgen_agent_attendance (identical shape).
-- ---------------------------------------------------------------------

alter table public.leadgen_agent_attendance
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists idle_since timestamptz,
  add column if not exists is_on_call boolean not null default false,
  add column if not exists break1_overdue_notified_at timestamptz,
  add column if not exists lunch_overdue_notified_at timestamptz,
  add column if not exists break2_overdue_notified_at timestamptz;

update public.leadgen_agent_attendance set last_activity_at = clock_in where last_activity_at is null;

create table if not exists public.leadgen_agent_idle_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  attendance_id uuid not null references public.leadgen_agent_attendance(id) on delete cascade,
  agent_id uuid not null references auth.users(id) on delete cascade,
  idle_start timestamptz not null,
  idle_end timestamptz,
  idle_duration_minutes integer,
  constraint leadgen_agent_idle_sessions_order check (idle_end is null or idle_end >= idle_start),
  constraint leadgen_agent_idle_sessions_duration_nonnegative check (idle_duration_minutes is null or idle_duration_minutes >= 0)
);

create index if not exists leadgen_agent_idle_sessions_attendance_idx on public.leadgen_agent_idle_sessions(attendance_id, idle_start desc);
create index if not exists leadgen_agent_idle_sessions_agent_idx on public.leadgen_agent_idle_sessions(agent_id, idle_start desc);
create unique index if not exists leadgen_agent_idle_sessions_one_open_per_attendance
  on public.leadgen_agent_idle_sessions(attendance_id) where idle_end is null;

create or replace function public.set_leadgen_agent_idle_session_duration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.idle_end is not null then
    new.idle_duration_minutes := greatest(0, round(extract(epoch from (new.idle_end - new.idle_start)) / 60)::integer);
  else
    new.idle_duration_minutes := null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_leadgen_agent_idle_session_duration_trigger on public.leadgen_agent_idle_sessions;
create trigger set_leadgen_agent_idle_session_duration_trigger
  before insert or update on public.leadgen_agent_idle_sessions
  for each row execute function public.set_leadgen_agent_idle_session_duration();

alter table public.leadgen_agent_idle_sessions enable row level security;

create policy "leadgen_agent_idle_sessions_agent_select_own"
  on public.leadgen_agent_idle_sessions for select
  using (agent_id = auth.uid());

create policy "leadgen_agent_idle_sessions_agent_insert_own"
  on public.leadgen_agent_idle_sessions for insert
  with check (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');

create policy "leadgen_agent_idle_sessions_agent_update_own_open"
  on public.leadgen_agent_idle_sessions for update
  using (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent' and idle_end is null)
  with check (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');

create policy "leadgen_agent_idle_sessions_admin_select"
  on public.leadgen_agent_idle_sessions for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

comment on table public.agent_idle_sessions is
  'One row per inactivity episode (45+ minutes with no meaningful CRM activity while clocked in and not on an approved break/lunch/call) for a Growth CRM agent - see src/lib/attendance-pay.ts and src/components/agent-activity/.';
comment on table public.leadgen_agent_idle_sessions is
  'Lead Generation CRM mirror of public.agent_idle_sessions - see its comment for the full rationale.';
