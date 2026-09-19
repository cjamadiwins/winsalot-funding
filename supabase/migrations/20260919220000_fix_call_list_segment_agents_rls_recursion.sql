-- Fixes a bug reported as: an agent (e.g. C.J Amadi) sees "No call lists
-- have been assigned to you yet." under My Call Lists even though Admin
-- shows the segment (e.g. "Website Designer - Winnipeg MB") clearly
-- assigned and Active. Root cause confirmed directly against this
-- project: querying call_list_segments as that agent's own session
-- (SET ROLE authenticated + their real auth.uid()) errors with
-- "infinite recursion detected in policy for relation
-- call_list_segments" - the agent's own page.tsx swallows that error
-- (`const { data } = await supabase.from(...)`, no `error` check) and
-- silently falls through to the empty state, which is what made this
-- look like a missing/broken assignment when the assignment itself
-- (call_list_segment_agents row, crm_users.id, auth.users.id) was
-- already 100% correct.
--
-- The cycle (both introduced together in 20260919120000_call_list_
-- segments.sql, so this has been latent since that migration, not
-- something a later migration broke):
--   call_list_segments_growth_agent_select_assigned (on
--   call_list_segments) subqueries call_list_segment_agents to check the
--   caller is on the segment's roster; call_list_segment_agents_growth_
--   admin_all (on call_list_segment_agents) subqueries call_list_segments
--   right back, purely to re-confirm crm = 'growth'. Postgres detects the
--   cycle and errors the entire query - same shape for the Lead Gen pair.
--
-- Fix: drop the now-redundant call_list_segments subquery from the two
-- ADMIN policies on call_list_segment_agents. It never protected
-- anything the app doesn't already enforce elsewhere: the only real
-- write path to this table, setSegmentAgents() in
-- src/lib/call-list-segments.ts, uses the service-role client and
-- bypasses RLS entirely (deploySegmentAction/updateSegmentStatusAction
-- already verify segment.crm before ever calling it) - these policies
-- only ever mattered for a hypothetical direct API call using an admin's
-- own session, and crm_user_role(auth.uid()) = 'admin' alone still fully
-- covers that (crm_users is Growth-only; Lead Gen admins live in the
-- separate leadgen_users table, so the role check already implies the
-- correct CRM without re-querying call_list_segments).
--
-- No assignment data is touched by this migration - call_list_segment_
-- agents rows (C.J Amadi's, Henry Osuji's, Goodness Ugbana's, or anyone
-- else's) are completely unaffected; this only changes which policy
-- expression is used to authorize reading/writing that table.
drop policy if exists "call_list_segment_agents_growth_admin_all" on public.call_list_segment_agents;
create policy "call_list_segment_agents_growth_admin_all"
  on public.call_list_segment_agents for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

drop policy if exists "call_list_segment_agents_leadgen_admin_all" on public.call_list_segment_agents;
create policy "call_list_segment_agents_leadgen_admin_all"
  on public.call_list_segment_agents for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');
