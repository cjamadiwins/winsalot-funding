-- Map shared Dialpad accounts to the people shown in CRM performance.
-- info@ is one C.J Amadi row with the Admin role; it is never double-counted.
update public.dialpad_user_stats
set
  agent_name = case lower(agent_email)
    when 'agent1@winsalotcorp.com' then 'Henry Osuji'
    when 'agent2@winsalotcorp.com' then 'Goodness Ugbana'
    when 'info@winsalotcorp.com' then 'C.J Amadi'
    else agent_name
  end,
  agent_role = case
    when lower(agent_email) = 'info@winsalotcorp.com' then 'admin'
    else 'agent'
  end
where lower(agent_email) in (
  'agent1@winsalotcorp.com',
  'agent2@winsalotcorp.com',
  'info@winsalotcorp.com'
);

update public.dialpad_call_rows
set
  agent_name = case lower(agent_email)
    when 'agent1@winsalotcorp.com' then 'Henry Osuji'
    when 'agent2@winsalotcorp.com' then 'Goodness Ugbana'
    when 'info@winsalotcorp.com' then 'C.J Amadi'
    else agent_name
  end,
  agent_role = case
    when lower(agent_email) = 'info@winsalotcorp.com' then 'admin'
    else 'agent'
  end
where lower(agent_email) in (
  'agent1@winsalotcorp.com',
  'agent2@winsalotcorp.com',
  'info@winsalotcorp.com'
);

drop policy if exists "dialpad_user_stats_agent_select_own" on public.dialpad_user_stats;
create policy "dialpad_user_stats_agent_select_own" on public.dialpad_user_stats for select
  using (
    exists (
      select 1 from public.crm_users u
      where u.id = auth.uid() and u.role = 'agent'
        and (lower(u.email) = lower(agent_email) or lower(u.full_name) = lower(agent_name))
    )
    or exists (
      select 1 from public.leadgen_users u
      where u.id = auth.uid() and u.role = 'agent'
        and (lower(u.email) = lower(agent_email) or lower(u.full_name) = lower(agent_name))
    )
  );

drop policy if exists "dialpad_call_rows_agent_select_own" on public.dialpad_call_rows;
create policy "dialpad_call_rows_agent_select_own" on public.dialpad_call_rows for select
  using (
    exists (
      select 1 from public.crm_users u
      where u.id = auth.uid() and u.role = 'agent'
        and (lower(u.email) = lower(agent_email) or lower(u.full_name) = lower(agent_name))
    )
    or exists (
      select 1 from public.leadgen_users u
      where u.id = auth.uid() and u.role = 'agent'
        and (lower(u.email) = lower(agent_email) or lower(u.full_name) = lower(agent_name))
    )
  );

drop policy if exists "dialpad_call_reports_agent_select_own" on public.dialpad_call_reports;
create policy "dialpad_call_reports_agent_select_own" on public.dialpad_call_reports for select
  using (
    exists (
      select 1 from public.dialpad_user_stats s
      where s.report_id = id
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
