-- Client Portal / Campaign & Payment Setup, Phase 1: admin-controlled
-- campaign configuration for a Lead Generation CRM client's campaign. Purely
-- additive - no existing table, column, row, policy, or trigger is altered
-- or removed. All new columns are nullable (or default to an empty array),
-- so every existing leadgen_campaigns row stays valid unchanged.
--
-- No RLS policy changes are needed: leadgen_campaigns already carries
-- exactly the shape this needs -
--   leadgen_campaigns_admin_all        (ALL, admin-only)   -> only Admin can write these columns
--   leadgen_campaigns_agent_select     (SELECT, agent-only) -> Agents can view, never edit
--   leadgen_campaigns_client_select_own (SELECT, own client) -> Client can view, never edit
-- and those three policies apply to every column on the table, including
-- the ones added here. Free-text rather than enum-constrained (campaign_type,
-- service_type, target_industry, territory, assigned_team, current_stage) so
-- a future client with a target industry/service this repo hasn't seen yet
-- never needs a schema change to be onboarded.
alter table public.leadgen_campaigns
  add column if not exists campaign_type text,
  add column if not exists service_type text,
  add column if not exists target_industry text,
  add column if not exists secondary_industries text[] not null default '{}',
  add column if not exists territory text,
  add column if not exists qualification_criteria text[] not null default '{}',
  add column if not exists assigned_team text,
  add column if not exists current_stage text;

comment on column public.leadgen_campaigns.campaign_type is 'Admin-controlled campaign category (e.g. "Standard Monthly", "Pilot") - free text, view-only for agents/clients.';
comment on column public.leadgen_campaigns.service_type is 'Admin-controlled service being promoted (e.g. "Website Design Lead Generation") - free text, view-only for agents/clients.';
comment on column public.leadgen_campaigns.target_industry is 'Admin-controlled primary target industry - free text, view-only for agents/clients.';
comment on column public.leadgen_campaigns.secondary_industries is 'Admin-controlled secondary target industries, if any - view-only for agents/clients.';
comment on column public.leadgen_campaigns.territory is 'Admin-controlled geographic territory (e.g. "Brampton / Mississauga") - free text, view-only for agents/clients.';
comment on column public.leadgen_campaigns.qualification_criteria is 'Admin-controlled qualified-lead criteria agreed with the client (e.g. "Decision-maker reached") - view-only for agents/clients.';
comment on column public.leadgen_campaigns.assigned_team is 'Admin-controlled display label for the Winsalot agent/team assigned to this campaign, if shown - free text, view-only for agents/clients.';
comment on column public.leadgen_campaigns.current_stage is 'Admin-controlled current campaign stage label (e.g. "Prospecting & Booking Consultations") - free text, view-only for agents/clients.';
