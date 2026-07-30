-- Lead Generation CRM attendance tracking (separate from cleaning CRM attendance).
-- Captures clock-in/clock-out shifts for leadgen agents and admin reporting.

create table if not exists public.leadgen_agent_attendance (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id) on delete cascade,
  agent_name text not null,
  attendance_date date not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  total_minutes integer,
  created_at timestamptz not null default now(),
  constraint leadgen_agent_attendance_clock_order check (clock_out is null or clock_out >= clock_in),
  constraint leadgen_agent_attendance_total_minutes_nonnegative check (
    total_minutes is null or total_minutes >= 0
  )
);

create index if not exists leadgen_agent_attendance_agent_date_idx
  on public.leadgen_agent_attendance(agent_id, attendance_date desc, clock_in desc);

create unique index if not exists leadgen_agent_attendance_one_open_shift_per_agent
  on public.leadgen_agent_attendance(agent_id)
  where clock_out is null;

create or replace function public.set_leadgen_agent_attendance_derived_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.attendance_date := (new.clock_in at time zone 'UTC')::date;

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

create or replace function public.enforce_leadgen_attendance_close_only_update()
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

    if new.agent_name <> old.agent_name then
      raise exception 'agent_name cannot be modified.';
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

drop trigger if exists set_leadgen_agent_attendance_derived_fields_trigger
  on public.leadgen_agent_attendance;

create trigger set_leadgen_agent_attendance_derived_fields_trigger
before insert or update of clock_in, clock_out
on public.leadgen_agent_attendance
for each row
execute function public.set_leadgen_agent_attendance_derived_fields();

drop trigger if exists enforce_leadgen_attendance_close_only_update_trigger
  on public.leadgen_agent_attendance;

create trigger enforce_leadgen_attendance_close_only_update_trigger
before update
on public.leadgen_agent_attendance
for each row
execute function public.enforce_leadgen_attendance_close_only_update();

alter table public.leadgen_agent_attendance enable row level security;

create policy "leadgen_agent_attendance_admin_select_all"
  on public.leadgen_agent_attendance for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_agent_attendance_agent_select_own"
  on public.leadgen_agent_attendance for select
  using (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');

create policy "leadgen_agent_attendance_agent_insert_own_open"
  on public.leadgen_agent_attendance for insert
  with check (
    agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and clock_out is null
  );

create policy "leadgen_agent_attendance_agent_clock_out_own_open"
  on public.leadgen_agent_attendance for update
  using (
    agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and clock_out is null
  )
  with check (
    agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and clock_out is not null
    and total_minutes is not null
  );