-- Lets a leadgen admin force-close an agent's open attendance shift from
-- the Attendance page, in addition to the agent's own self clock-out
-- (migration 0044). Adds an audit trail of who performed the clock-out so
-- admin-initiated closures are distinguishable from agent self-service
-- ones, and a dedicated RLS policy scoped to admins closing OPEN shifts
-- only (never touching already-closed rows, never inserting new ones).

alter table public.leadgen_agent_attendance
  add column if not exists clocked_out_by_admin_id uuid references public.leadgen_users(id) on delete set null,
  add column if not exists clocked_out_by_admin_name text;

create policy "leadgen_agent_attendance_admin_clock_out_open"
  on public.leadgen_agent_attendance for update
  using (
    public.leadgen_user_role(auth.uid()) = 'admin'
    and clock_out is null
  )
  with check (
    public.leadgen_user_role(auth.uid()) = 'admin'
    and clock_out is not null
    and total_minutes is not null
    and clocked_out_by_admin_id = auth.uid()
  );
