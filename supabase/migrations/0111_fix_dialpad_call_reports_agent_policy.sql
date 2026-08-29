-- Fix a self-join bug in "dialpad_call_reports_agent_select_own" (added in
-- migration 0110): its inner EXISTS subquery compared
-- dialpad_user_stats.report_id to an unqualified `id`, which Postgres
-- resolved to dialpad_user_stats.id (the nearest scope) instead of the
-- intended dialpad_call_reports.id - i.e. it compiled to `s.report_id =
-- s.id`, comparing a stat row's own primary key to its own report_id
-- column, which can never match. This silently made every agent's Dialpad
-- report list empty (the "No Dialpad report imported yet" page), even
-- though their own dialpad_user_stats/dialpad_call_rows rows were already
-- correctly visible via their own, unaffected policies.
--
-- No data changed here - this only restores the read access the original
-- migration intended. Admin's own policy (dialpad_call_reports_admin_all)
-- was never affected by this bug.
drop policy if exists "dialpad_call_reports_agent_select_own" on public.dialpad_call_reports;
create policy "dialpad_call_reports_agent_select_own" on public.dialpad_call_reports for select
  using (
    exists (
      select 1 from public.dialpad_user_stats s
      where s.report_id = dialpad_call_reports.id
        and (
          exists (
            select 1 from public.crm_users u
            where u.id = auth.uid() and u.role = 'agent'
              and (lower(u.email) = lower(s.agent_email) or lower(u.full_name) = lower(s.agent_name))
          )
          or exists (
            select 1 from public.leadgen_users u
            where u.id = auth.uid() and u.role = 'agent'
              and (lower(u.email) = lower(s.agent_email) or lower(u.full_name) = lower(s.agent_name))
          )
        )
    )
  );
