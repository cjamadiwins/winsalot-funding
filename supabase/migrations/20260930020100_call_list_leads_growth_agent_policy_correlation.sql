-- Security fix (cross-CRM leak), separate from the Lead Gen scope migration so it
-- can be reviewed on its own.
--
-- call_list_leads_growth_agent_select/_update checked "is this agent on SOME active
-- Growth segment?" but never tied that segment to the row being read
-- (the subquery compared s.id = sa.segment_id only). Any user with a Growth-agent
-- role and one active Growth list could therefore read/update EVERY call_list_leads
-- row, including Lead Generation rows for clients an admin had not assigned them.
--
-- The only change: require the segment to be the lead's own segment
-- (s.id = call_list_leads.segment_id). Growth agents keep exactly the access the
-- policy was written to give (leads of their own assigned, active Growth lists).
-- No Growth data, table, column or application code is changed.

drop policy if exists "call_list_leads_growth_agent_select" on public.call_list_leads;
create policy "call_list_leads_growth_agent_select"
  on public.call_list_leads for select
  using (
    removed_at is null
    and public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = call_list_leads.segment_id and s.crm = 'growth'
        and s.status in ('active', 'completed') and sa.agent_id = auth.uid()
    )
  );

drop policy if exists "call_list_leads_growth_agent_update" on public.call_list_leads;
create policy "call_list_leads_growth_agent_update"
  on public.call_list_leads for update
  using (
    removed_at is null
    and public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = call_list_leads.segment_id and s.crm = 'growth'
        and s.status = 'active' and sa.agent_id = auth.uid()
    )
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = call_list_leads.segment_id and s.crm = 'growth'
        and s.status = 'active' and sa.agent_id = auth.uid()
    )
  );
