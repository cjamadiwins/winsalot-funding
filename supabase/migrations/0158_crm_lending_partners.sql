-- Winsalot Growth CRM: Lending & Referral Partners.
--
-- A new, admin-only registry for the *supply side* of the Business
-- Financing pipeline - lenders, brokers, and referral/reseller partners
-- Winsalot places deals with - as distinct from crm_opportunities, which
-- is the *demand side* (businesses asking Winsalot for financing). These
-- are structurally different relationships: an opportunity moves through
-- a sales funnel toward "Client Won"; a lending partner has an ongoing
-- ISO/introducer/reseller agreement, a submission email, and a
-- commission structure that don't fit that funnel or those columns at
-- all. This mirrors a precedent already set in this codebase -
-- provider_leads (migration 0026) got its own table for the identical
-- reason: cleaning providers aren't customers, so they didn't get
-- shoehorned into crm_leads either.
--
-- Built from a dry-run read of a HubSpot contacts export (see the
-- migration-plan report produced alongside this migration) - 13 Lender
-- Contacts, 2 Partner/Referral Source contacts. This migration only
-- creates the table/schema; no HubSpot rows are inserted here or by any
-- application code yet - that import happens separately, once approved.
--
-- Entirely additive: no existing table, column, row, policy, or trigger
-- is altered except crm_activities, which only gains one new nullable
-- foreign key and a widened target-count constraint (same technique
-- 0026/0091/0099 already used to grow that same check).

create table if not exists public.crm_lending_partners (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,
  assigned_agent_id uuid references public.crm_users(id) on delete set null,

  -- Traceable back to the HubSpot row it was migrated from, and lets a
  -- re-run of the import upsert instead of duplicating - unique so the
  -- same HubSpot contact can never be imported twice. Null for any
  -- partner entered directly in Growth CRM going forward.
  hubspot_record_id text unique,

  company_name text not null,
  contact_name text,
  job_title text,
  email text,
  phone text,

  contact_type text not null check (contact_type in (
    'lender_contact', 'broker', 'referral_partner'
  )),

  -- Free text on purpose (mirrors provider_leads.status being a fixed
  -- list vs. this being closer to crm_clients.internal_notes) - the
  -- source data itself uses inconsistent labels per partner ("ISO
  -- Partner Contact", "Funding Partner Contact", "onboarding in
  -- progress") rather than one clean pipeline, and forcing a fixed enum
  -- on day one would just misclassify half of them. Revisit as a check
  -- constraint once real usage settles on a fixed set of values.
  relationship_status text,
  -- Where Winsalot sends deal files for this partner (e.g.
  -- apps@canacap.ca) - distinct from the contact's own email, which may
  -- be a personal work address rather than the submission inbox.
  submission_email text,
  commission_notes text,

  notes text,

  archived_at timestamptz,
  archived_by uuid references public.crm_users(id) on delete set null
);

create index if not exists crm_lending_partners_contact_type_idx on public.crm_lending_partners(contact_type);
create index if not exists crm_lending_partners_company_name_idx on public.crm_lending_partners(lower(company_name));
create index if not exists crm_lending_partners_email_idx on public.crm_lending_partners(lower(email));
create index if not exists crm_lending_partners_phone_idx on public.crm_lending_partners(phone);
create index if not exists crm_lending_partners_assigned_agent_idx on public.crm_lending_partners(assigned_agent_id);

alter table public.crm_lending_partners enable row level security;

-- Admin-only, single policy - same pattern as crm_clients (migration
-- 0091): commission structure and lender relationship terms are
-- financial/business-sensitive data, not something every agent needs
-- direct table access to. An agent-facing, non-financial read view (the
-- crm_agent_visible_clients precedent) can be added later via a
-- SECURITY DEFINER function if agents need to see which partners are
-- available to submit deals to, without granting them RLS access to
-- this table's financial columns.
create policy "crm_lending_partners_admin_all"
  on public.crm_lending_partners for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create or replace function public.crm_lending_partners_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_lending_partners_set_updated_at_trigger on public.crm_lending_partners;

create trigger crm_lending_partners_set_updated_at_trigger
  before update on public.crm_lending_partners
  for each row
  execute function public.crm_lending_partners_set_updated_at();

-- ---------------------------------------------------------------------
-- Extend crm_activities so a timeline entry can anchor to a lending
-- partner - the same additive technique 0026 used for provider_lead_id.
-- This is what lets the semicolon-joined chronological note history on
-- each HubSpot lender/partner contact become real, individually-dated
-- crm_activities rows instead of one flattened text blob, once the data
-- import itself is approved.
-- ---------------------------------------------------------------------
alter table public.crm_activities
  add column if not exists lending_partner_id uuid references public.crm_lending_partners(id) on delete cascade;

create index if not exists crm_activities_lending_partner_idx on public.crm_activities(lending_partner_id, occurred_at desc);

-- crm_activities_exactly_one_target was already widened from "exactly
-- one" to "at least one" by migration 0099 (client_id needed to combine
-- with opportunity_id for onboarding activity). Re-widen the same
-- constraint, in place, to also accept lending_partner_id - every
-- previously-passing row (0/1 of the other five columns set) still
-- passes unchanged.
alter table public.crm_activities drop constraint if exists crm_activities_exactly_one_target;
alter table public.crm_activities add constraint crm_activities_exactly_one_target
  check (
    (case when lead_id is not null then 1 else 0 end)
    + (case when opportunity_id is not null then 1 else 0 end)
    + (case when provider_lead_id is not null then 1 else 0 end)
    + (case when cleaning_provider_id is not null then 1 else 0 end)
    + (case when client_id is not null then 1 else 0 end)
    + (case when lending_partner_id is not null then 1 else 0 end)
    >= 1
  );

-- crm_activities is admin-all-or-scoped-to-assigned-agent; since
-- crm_lending_partners has no agent-select RLS policy at all (admin-only
-- above), no new agent-facing crm_activities policy is added here either
-- - an activity row with only lending_partner_id set is simply invisible
-- to the existing agent-select/insert policies (none of their exists()
-- checks reference lending_partner_id), matching crm_lending_partners'
-- own admin-only visibility. crm_activities_admin_all already covers
-- every row regardless of which target column is set.
