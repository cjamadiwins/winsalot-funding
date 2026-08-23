-- Onboards "Mantra Collab" as a second, fully separate Lead Generation
-- CRM client + campaign, alongside three small pieces of genuinely new,
-- generic functionality the brief needs that don't exist yet:
--
-- 1. leadgen_campaigns gets an optional appointment_goal/pilot_label so
--    a campaign can display "3-Appointment Pilot" / "X of Y qualified
--    appointments booked" - both nullable, so every existing campaign
--    (Brent's Essentials') is completely unaffected.
-- 2. leadgen_campaign_agents: an explicit, opt-in agent -> campaign
--    restriction. An agent with zero rows here behaves exactly as
--    before (unrestricted) - only an agent an admin deliberately adds
--    here becomes limited to their assigned campaign(s), enforced by
--    RLS below, not just by the UI.
-- 3. The Mantra Collab client/campaign/email-template rows themselves,
--    seeded here (not via the admin "+ Add Client" UI) so they exist
--    identically in every environment, matching the precedent set by
--    migration 0031's own seeded email template.
--
-- Nothing here touches an existing leadgen_clients/leadgen_campaigns/
-- leadgen_leads/leadgen_appointments row, and the RLS change below is
-- additive-only for every agent who isn't explicitly opted into
-- leadgen_campaign_agents.

alter table public.leadgen_campaigns
  add column if not exists appointment_goal integer,
  add column if not exists pilot_label text;

-- ---------------------------------------------------------------------
-- leadgen_campaign_agents: which agents are restricted to which
-- campaign(s). Presence of ANY row for an agent flips them into
-- "restricted" mode (see leadgen_agent_campaign_allowed below); absence
-- (the case for every agent today) leaves them fully unrestricted,
-- exactly as before this migration.
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_campaign_agents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.leadgen_campaigns(id) on delete cascade,
  agent_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (campaign_id, agent_id)
);

create index if not exists leadgen_campaign_agents_agent_idx on public.leadgen_campaign_agents(agent_id);
create index if not exists leadgen_campaign_agents_campaign_idx on public.leadgen_campaign_agents(campaign_id);

alter table public.leadgen_campaign_agents enable row level security;

create policy "leadgen_campaign_agents_admin_all"
  on public.leadgen_campaign_agents for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_campaign_agents_agent_select_own"
  on public.leadgen_campaign_agents for select
  using (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');

-- security definer, same pattern as leadgen_user_role/leadgen_user_client_id
-- (migration 0031) - avoids self-referential RLS recursion.
create or replace function public.leadgen_agent_campaign_restricted(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.leadgen_campaign_agents where agent_id = uid);
$$;

-- True when the agent is unrestricted (no rows at all - today's default
-- for every agent), or when target_campaign_id is one of the specific
-- campaigns this agent has been explicitly assigned to. A restricted
-- agent is denied for a null campaign_id too (ambiguous - could belong
-- to any client), which is the intended, safer behavior.
create or replace function public.leadgen_agent_campaign_allowed(uid uuid, target_campaign_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    not public.leadgen_agent_campaign_restricted(uid)
    or (
      target_campaign_id is not null
      and exists (
        select 1 from public.leadgen_campaign_agents
        where agent_id = uid and campaign_id = target_campaign_id
      )
    );
$$;

revoke execute on function public.leadgen_agent_campaign_restricted(uuid) from public, anon;
grant execute on function public.leadgen_agent_campaign_restricted(uuid) to authenticated;
revoke execute on function public.leadgen_agent_campaign_allowed(uuid, uuid) from public, anon;
grant execute on function public.leadgen_agent_campaign_allowed(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Extend the existing agent policies on leadgen_leads/leadgen_appointments
-- with the campaign-allowed check. Every current agent has zero rows in
-- leadgen_campaign_agents, so leadgen_agent_campaign_allowed() is true
-- for them unconditionally - these replacements are a no-op for every
-- existing agent/lead/appointment (Brent's Essentials included).
-- ---------------------------------------------------------------------
drop policy if exists "leadgen_leads_agent_select_own" on public.leadgen_leads;
create policy "leadgen_leads_agent_select_own"
  on public.leadgen_leads for select
  using (
    assigned_agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and public.leadgen_agent_campaign_allowed(auth.uid(), campaign_id)
  );

drop policy if exists "leadgen_leads_agent_update_own" on public.leadgen_leads;
create policy "leadgen_leads_agent_update_own"
  on public.leadgen_leads for update
  using (
    assigned_agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and public.leadgen_agent_campaign_allowed(auth.uid(), campaign_id)
  )
  with check (
    assigned_agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and public.leadgen_agent_campaign_allowed(auth.uid(), campaign_id)
  );

drop policy if exists "leadgen_appointments_agent_select_own" on public.leadgen_appointments;
create policy "leadgen_appointments_agent_select_own"
  on public.leadgen_appointments for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and public.leadgen_agent_campaign_allowed(auth.uid(), campaign_id)
    and (
      assigned_specialist_id = auth.uid()
      or exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
    )
  );

drop policy if exists "leadgen_appointments_agent_insert_own" on public.leadgen_appointments;
create policy "leadgen_appointments_agent_insert_own"
  on public.leadgen_appointments for insert
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and public.leadgen_agent_campaign_allowed(auth.uid(), campaign_id)
    and (
      assigned_specialist_id = auth.uid()
      or exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
    )
  );

drop policy if exists "leadgen_appointments_agent_update_own" on public.leadgen_appointments;
create policy "leadgen_appointments_agent_update_own"
  on public.leadgen_appointments for update
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and public.leadgen_agent_campaign_allowed(auth.uid(), campaign_id)
    and (
      assigned_specialist_id = auth.uid()
      or exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- Seed the Mantra Collab client + campaign + email template. Guarded by
-- a "does this client slug already exist" check so re-running this
-- migration (or a future deploy re-applying it) never creates a
-- duplicate client/campaign.
-- ---------------------------------------------------------------------
do $$
declare
  v_client_id uuid;
  v_campaign_id uuid;
begin
  if not exists (select 1 from public.leadgen_clients where slug = 'mantra-collab') then
    insert into public.leadgen_clients (name, slug, services_info_link, notes, active)
    values (
      'Mantra Collab',
      'mantra-collab',
      'https://mantracollab.com',
      E'Value statement: "Mantra Collab helps businesses promote their services and receive quote requests."',
      true
    )
    returning id into v_client_id;

    insert into public.leadgen_campaigns (client_id, name, description, status, pilot_label, appointment_goal)
    values (
      v_client_id,
      'Mantra Collab Business Applications',
      'Mantra Collab helps businesses promote their services and receive quote requests.',
      'active',
      '3-Appointment Pilot',
      3
    )
    returning id into v_campaign_id;

    -- Relative path, not an absolute URL - resolved to this deployment's
    -- own domain at render time (see resolveSiteRelativeUrl in
    -- src/lib/site-url.ts) rather than guessing a production hostname
    -- inside this migration.
    update public.leadgen_clients set booking_link = '/book/mantra-collab' where id = v_client_id;
  end if;
end $$;

-- Distinct activity-timeline entry for the new "Send Mantra Collab
-- Email" action, same additive pattern as every prior extension of this
-- constraint (e.g. migrations 0032, 0066, 0067, 0068).
alter table public.leadgen_lead_activities
  drop constraint leadgen_lead_activities_activity_type_check;

alter table public.leadgen_lead_activities
  add constraint leadgen_lead_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'note', 'status_change', 'lead_assigned', 'lead_reassigned',
    'follow_up_scheduled', 'follow_up_completed', 'appointment_booked',
    'appointment_updated', 'consultation_email_sent',
    'consultation_invitation_sent', 'consultation_follow_up_sent',
    'appointment_confirmation_resent', 'appointment_reminder_sent',
    'appointment_reminder_auto_sent', 'appointment_business_reminder_auto_sent',
    'mantra_collab_intro_sent'
  ));

insert into public.leadgen_email_templates (key, name, subject, body, description)
values (
  'mantra_collab_intro',
  'Mantra Collab Introduction',
  'Grow Your Business with Mantra Collab',
  E'Hi {{first_name}},\n\nThank you for your interest.\n\nMantra Collab helps businesses promote their services and receive quote requests through an affordable business platform.\n\nYou can schedule a free 15-minute consultation to learn how it could support your business.\n\n{{booking_section}}\n\n{{visit_section}}',
  'Fixed Mantra Collab-branded intro email - sent only for Mantra Collab leads, never for any other client.'
)
on conflict (key) do nothing;
