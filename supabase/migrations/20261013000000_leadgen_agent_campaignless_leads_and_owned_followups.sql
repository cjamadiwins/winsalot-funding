-- Lead Generation CRM: restore agents' access to their own leads and follow-ups.
--
-- Root cause (found while investigating Henry Osuji's empty dashboard):
--  1. 20260930020000 made leadgen_agent_campaign_allowed() strict, and the
--     leadgen_leads agent policies call it on lead.campaign_id. A lead with
--     campaign_id IS NULL can therefore never pass, even when its client is one
--     the agent is assigned to. The agent "New Lead" form defaults Campaign to
--     "No campaign", so agents kept creating leads they could not see.
--  2. Follow-ups scheduled by Admin on an agent's lead carry the Admin's
--     agent_id, and the agent follow-up policies required agent_id = auth.uid(),
--     so the lead owner could not see or complete them.
--
-- Policy-only and additive in effect: no rows, columns, grants or functions are
-- changed, nothing is reassigned, and Admin policies are untouched.
-- Still enforced: an agent only reaches leads assigned to them, and only for a
-- client Admin has assigned to them (via leadgen_campaign_agents). Leads of
-- clients the agent is NOT assigned to (e.g. after "remove client") stay hidden
-- exactly as before; re-assigning the client restores them.

-- 1. Leads: campaign-less leads are visible when their client is assigned.
drop policy if exists "leadgen_leads_agent_select_own" on public.leadgen_leads;
create policy "leadgen_leads_agent_select_own"
  on public.leadgen_leads for select
  using (
    assigned_agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and (
      public.leadgen_agent_campaign_allowed(auth.uid(), campaign_id)
      or (campaign_id is null and public.leadgen_agent_client_allowed(auth.uid(), client_id))
    )
  );

drop policy if exists "leadgen_leads_agent_update_own" on public.leadgen_leads;
create policy "leadgen_leads_agent_update_own"
  on public.leadgen_leads for update
  using (
    assigned_agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and (
      public.leadgen_agent_campaign_allowed(auth.uid(), campaign_id)
      or (campaign_id is null and public.leadgen_agent_client_allowed(auth.uid(), client_id))
    )
  )
  with check (
    assigned_agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and (
      public.leadgen_agent_campaign_allowed(auth.uid(), campaign_id)
      or (campaign_id is null and public.leadgen_agent_client_allowed(auth.uid(), client_id))
    )
  );

-- 2. Follow-ups: the agent's own, plus any on a lead assigned to them. The
--    subquery on leadgen_leads runs under the leads policy above, so the
--    assigned-client gate still applies.
drop policy if exists "leadgen_followups_agent_select_own" on public.leadgen_followups;
create policy "leadgen_followups_agent_select_own"
  on public.leadgen_followups for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and (
      (agent_id = auth.uid() and (lead_id is null or exists (select 1 from public.leadgen_leads l where l.id = leadgen_followups.lead_id)))
      or (lead_id is not null and exists (select 1 from public.leadgen_leads l where l.id = leadgen_followups.lead_id and l.assigned_agent_id = auth.uid()))
    )
  );

drop policy if exists "leadgen_followups_agent_update_own" on public.leadgen_followups;
create policy "leadgen_followups_agent_update_own"
  on public.leadgen_followups for update
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and (
      (agent_id = auth.uid() and (lead_id is null or exists (select 1 from public.leadgen_leads l where l.id = leadgen_followups.lead_id)))
      or (lead_id is not null and exists (select 1 from public.leadgen_leads l where l.id = leadgen_followups.lead_id and l.assigned_agent_id = auth.uid()))
    )
  )
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and (
      agent_id = auth.uid()
      or (lead_id is not null and exists (select 1 from public.leadgen_leads l where l.id = leadgen_followups.lead_id and l.assigned_agent_id = auth.uid()))
    )
  );
