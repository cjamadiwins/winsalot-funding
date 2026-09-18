-- Growth CRM: Client Consultation Guide - a structured, admin-only guide
-- Admin fills out live while speaking with a prospective client, distinct
-- from winsalot_appointments (which only tracks the booked call/meeting
-- itself, not what was discussed). Named "consultation_guide" rather than
-- "consultation" to keep it clearly separate from that existing
-- appointment-booking concept.
--
-- The many free-text Q&A prompts (Business & Growth Discovery, Lead
-- Generation Fit, Campaign Expectations & Handoff, Business Lending
-- Support Fit, Consultation Summary, Final Checklist) are stored as jsonb
-- per section rather than one column per question - the question set is
-- guide copy that can be refined without a migration, and nothing here
-- needs to filter/sort on an individual answer. The two "fit" statuses
-- and the guide's own status are real columns since those do drive
-- filtering/display.
--
-- Entirely additive: no existing table, column, row, policy, or trigger
-- is altered.

create table if not exists public.crm_consultation_guides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,

  -- Set when opened from an existing Growth CRM prospect/client record so
  -- the guide can be reopened from that record's activity history; null
  -- when a consultation is logged for someone not yet in the CRM.
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,

  status text not null default 'draft' check (status in ('draft', 'completed')),
  completed_at timestamptz,
  completed_by uuid references public.crm_users(id) on delete set null,

  -- Section 1: Consultation Details.
  business_name text,
  contact_name text,
  phone text,
  email text,
  industry text,
  location text,
  consultation_date date,
  consultant_name text,

  -- Section 3 (renumbered per the update below): Business & Growth
  -- Discovery - 6 free-text questions.
  discovery jsonb not null default '{}'::jsonb,

  -- Section 4: Lead Generation / Appointment-Setting Fit.
  leadgen_fit_status text check (leadgen_fit_status in ('interested_now', 'possible_future_fit', 'not_a_fit')),
  leadgen_fit jsonb not null default '{}'::jsonb,

  -- Section 5: Campaign Expectations & Handoff.
  campaign_expectations jsonb not null default '{}'::jsonb,

  -- Section 6: Business Lending Support Fit.
  lending_fit_status text check (lending_fit_status in ('interested_now', 'possible_future_need', 'not_applicable')),
  lending_fit jsonb not null default '{}'::jsonb,

  -- Section 7: Consultation Summary (primary_need, recommended_service,
  -- target_market, qualification_criteria, next_step, follow_up_date).
  summary jsonb not null default '{}'::jsonb,

  -- Section 9: Final Checklist - one boolean per item, keyed by a short
  -- slug (see CONSULTATION_GUIDE_CHECKLIST_ITEMS in
  -- src/lib/consultation-guide.ts).
  checklist jsonb not null default '{}'::jsonb,

  -- Free-form notes an admin can type anywhere during the call.
  notes text
);

create index if not exists crm_consultation_guides_opportunity_idx on public.crm_consultation_guides(opportunity_id);
create index if not exists crm_consultation_guides_status_idx on public.crm_consultation_guides(status);
create index if not exists crm_consultation_guides_created_by_idx on public.crm_consultation_guides(created_by);
create index if not exists crm_consultation_guides_created_at_idx on public.crm_consultation_guides(created_at desc);

alter table public.crm_consultation_guides enable row level security;

-- Admin-only, single policy - same pattern as crm_lending_partners
-- (migration 0158): this feature is explicitly Admin-only for now per
-- CJ's request, so no agent-facing policy is added.
create policy "crm_consultation_guides_admin_all"
  on public.crm_consultation_guides for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create or replace function public.crm_consultation_guides_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_consultation_guides_set_updated_at_trigger on public.crm_consultation_guides;

create trigger crm_consultation_guides_set_updated_at_trigger
  before update on public.crm_consultation_guides
  for each row
  execute function public.crm_consultation_guides_set_updated_at();
