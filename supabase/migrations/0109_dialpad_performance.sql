-- Shared Dialpad weekly reporting for the Growth and Lead CRMs. A report
-- imported from either admin workspace is intentionally visible in both.

create table if not exists public.dialpad_call_reports (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  source_file_name text not null check (length(trim(source_file_name)) > 0),
  source_workspace text not null check (source_workspace in ('growth', 'lead')),
  imported_at timestamptz not null default now(),
  imported_by uuid not null,
  imported_by_name text not null check (length(trim(imported_by_name)) > 0),
  user_count integer not null default 0 check (user_count >= 0),
  call_count integer not null default 0 check (call_count >= 0),
  constraint dialpad_call_reports_valid_period check (period_end >= period_start),
  constraint dialpad_call_reports_unique_week unique (period_start, period_end)
);

create table if not exists public.dialpad_user_stats (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.dialpad_call_reports(id) on delete cascade,
  agent_name text not null check (length(trim(agent_name)) > 0),
  agent_email text,
  agent_role text not null default 'agent' check (agent_role in ('admin', 'agent')),
  total_calls integer not null default 0 check (total_calls >= 0),
  placed_calls integer not null default 0 check (placed_calls >= 0),
  answered_calls integer not null default 0 check (answered_calls >= 0),
  missed_calls integer not null default 0 check (missed_calls >= 0),
  total_duration_seconds integer not null default 0 check (total_duration_seconds >= 0),
  average_duration_seconds integer not null default 0 check (average_duration_seconds >= 0)
);

create index if not exists dialpad_user_stats_report_idx on public.dialpad_user_stats(report_id, total_calls desc);

create table if not exists public.dialpad_call_rows (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.dialpad_call_reports(id) on delete cascade,
  external_call_id text,
  agent_name text not null check (length(trim(agent_name)) > 0),
  agent_email text,
  agent_role text not null default 'agent' check (agent_role in ('admin', 'agent')),
  direction text not null default 'Unknown',
  call_status text not null default 'Unknown',
  started_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  phone_number text,
  raw_data jsonb not null default '{}'::jsonb
);

create index if not exists dialpad_call_rows_report_idx on public.dialpad_call_rows(report_id, started_at desc);
create index if not exists dialpad_call_rows_agent_idx on public.dialpad_call_rows(report_id, agent_email, agent_name);

alter table public.dialpad_call_reports enable row level security;
alter table public.dialpad_user_stats enable row level security;
alter table public.dialpad_call_rows enable row level security;

create policy "dialpad_call_reports_admin_all" on public.dialpad_call_reports for all
  using (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin');

create policy "dialpad_user_stats_admin_all" on public.dialpad_user_stats for all
  using (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin');

create policy "dialpad_call_rows_admin_all" on public.dialpad_call_rows for all
  using (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin');

-- Agents may read only a report that contains their own email, and only
-- their own summary/call rows within that report. The checks live in RLS
-- so another agent's data cannot be exposed by a changed browser request.
create policy "dialpad_user_stats_agent_select_own" on public.dialpad_user_stats for select
  using (
    agent_email is not null
    and (
      exists (
        select 1 from public.crm_users u
        where u.id = auth.uid() and u.role = 'agent' and lower(u.email) = lower(agent_email)
      )
      or exists (
        select 1 from public.leadgen_users u
        where u.id = auth.uid() and u.role = 'agent' and lower(u.email) = lower(agent_email)
      )
    )
  );

create policy "dialpad_call_rows_agent_select_own" on public.dialpad_call_rows for select
  using (
    agent_email is not null
    and (
      exists (
        select 1 from public.crm_users u
        where u.id = auth.uid() and u.role = 'agent' and lower(u.email) = lower(agent_email)
      )
      or exists (
        select 1 from public.leadgen_users u
        where u.id = auth.uid() and u.role = 'agent' and lower(u.email) = lower(agent_email)
      )
    )
  );

create policy "dialpad_call_reports_agent_select_own" on public.dialpad_call_reports for select
  using (
    exists (
      select 1 from public.dialpad_user_stats s
      where s.report_id = id
        and s.agent_email is not null
        and (
          exists (
            select 1 from public.crm_users u
            where u.id = auth.uid() and u.role = 'agent' and lower(u.email) = lower(s.agent_email)
          )
          or exists (
            select 1 from public.leadgen_users u
            where u.id = auth.uid() and u.role = 'agent' and lower(u.email) = lower(s.agent_email)
          )
        )
    )
  );

grant select, insert, update, delete on public.dialpad_call_reports to authenticated;
grant select, insert, update, delete on public.dialpad_user_stats to authenticated;
grant select, insert, update, delete on public.dialpad_call_rows to authenticated;
