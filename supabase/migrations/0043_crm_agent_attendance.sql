-- Manual agent attendance tracking (clock in / clock out) for the existing
-- CRM auth model. Uses auth.uid() as agent_id and crm_user_role() for RLS.

create table if not exists public.agent_attendance (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  total_minutes integer,
  created_at timestamptz not null default now(),
  constraint agent_attendance_clock_order check (clock_out is null or clock_out >= clock_in),
  constraint agent_attendance_total_minutes_nonnegative check (
    total_minutes is null or total_minutes >= 0
  )
);

create index if not exists agent_attendance_agent_clock_in_idx
  on public.agent_attendance(agent_id, clock_in desc);

-- Enforces one open shift per agent at the database level.
create unique index if not exists agent_attendance_one_open_shift_per_agent
  on public.agent_attendance(agent_id)
  where clock_out is null;

create or replace function public.set_agent_attendance_total_minutes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.clock_out is not null then
    new.total_minutes := greatest(
      floor(extract(epoch from (new.clock_out - new.clock_in)) / 60)::integer,
      0
    );
  else
    new.total_minutes := null;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_agent_attendance_close_only_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.clock_out is not null then
      raise exception 'Attendance record is already closed.';
    end if;

    if new.clock_out is null then
      raise exception 'Clock-out time is required when updating attendance.';
    end if;

    if new.agent_id <> old.agent_id then
      raise exception 'agent_id cannot be modified.';
    end if;

    if new.clock_in <> old.clock_in then
      raise exception 'clock_in cannot be modified when clocking out.';
    end if;

    if new.created_at <> old.created_at then
      raise exception 'created_at cannot be modified.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_agent_attendance_total_minutes_trigger
  on public.agent_attendance;

create trigger set_agent_attendance_total_minutes_trigger
before insert or update of clock_in, clock_out
on public.agent_attendance
for each row
execute function public.set_agent_attendance_total_minutes();

drop trigger if exists enforce_agent_attendance_close_only_update_trigger
  on public.agent_attendance;

create trigger enforce_agent_attendance_close_only_update_trigger
before update
on public.agent_attendance
for each row
execute function public.enforce_agent_attendance_close_only_update();

alter table public.agent_attendance enable row level security;

create policy "agent_attendance_admin_select_all"
  on public.agent_attendance for select
  using (public.crm_user_role(auth.uid()) = 'admin');

create policy "agent_attendance_agent_select_own"
  on public.agent_attendance for select
  using (agent_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent');

create policy "agent_attendance_agent_insert_own_open"
  on public.agent_attendance for insert
  with check (
    agent_id = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and clock_out is null
  );

-- Agents can only close (clock out) their own currently open shift.
create policy "agent_attendance_agent_clock_out_own_open"
  on public.agent_attendance for update
  using (
    agent_id = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and clock_out is null
  )
  with check (
    agent_id = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and clock_out is not null
    and total_minutes is not null
  );