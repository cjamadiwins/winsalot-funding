-- Winsalot Growth CRM: Free Pilot Program option for the Client
-- Onboarding workflow (migration 0097, PR #163, already merged to main).
--
-- Purely additive on top of 0097 - every column/table added here is
-- nullable or has a safe default, so every existing "Standard Monthly
-- Campaign" agreement keeps working completely unchanged
-- (campaign_type defaults to 'standard_monthly'). None of this touches
-- the Lead Generation CRM or any existing opportunity/client/invoice/
-- email data.
--
-- Design: a pilot walks the exact same crm_client_agreements/
-- crm_agreement_tokens/crm_intake_* pipeline a standard agreement does
-- (draft -> sent -> signed, then the existing agreement-sign flow
-- auto-creates its intake config) - only the *content* differs (its own
-- template `kind`, its own required fields, always a $0 fee, no invoice).
-- "Convert to Paid Monthly Campaign" and "Extend Pilot" are implemented
-- as a brand-new draft crm_client_agreements row (supersedes_id pointing
-- back at the pilot), which is what lets the client's second signature
-- reuse 100% of the existing send/sign/auto-intake code - see
-- src/app/admin/(dashboard)/crm/agreements/actions.ts.

-- ---------------------------------------------------------------------
-- Agreement templates: a pilot uses its own template content (its own
-- required disclosure language, no fees/billing section) rather than the
-- standard Client Service Agreement template. `kind` distinguishes the
-- two lineages; each keeps its own independent version numbering.
-- ---------------------------------------------------------------------
alter table public.crm_agreement_templates
  add column if not exists kind text not null default 'client_service_agreement'
    check (kind in ('client_service_agreement', 'pilot_program_agreement'));

drop index if exists crm_agreement_templates_version_idx;
create unique index if not exists crm_agreement_templates_kind_version_idx
  on public.crm_agreement_templates (kind, version);

-- Seed the pilot template, version 1. The disclosure paragraph is the
-- exact required text, verbatim, with no {{placeholder}} tokens - it
-- reads generically ("the agreed number", "the stated end date") so it
-- never needs per-client interpolation.
insert into public.crm_agreement_templates (version, kind, content)
values (
  1,
  'pilot_program_agreement',
  '[
    {"key": "definition", "title": "Definition of a Qualified {{service_noun_singular}}", "body": "A \"qualified {{service_noun_singular}}\" means a prospective customer or business contact that meets the targeting criteria (industries, locations, and qualification requirements) agreed between Winsalot Corp and the Client, and that Winsalot Corp has delivered to the Client in accordance with this pilot program."},
    {"key": "services", "title": "Pilot Program Scope", "body": "Winsalot Corp will provide a complimentary, time-limited pilot program to the Client, consisting of prospecting, outreach, and qualification activities directed at the Client''s target industries and locations, for the purpose of generating {{service_noun_plural}} on the Client''s behalf, for the agreed pilot duration and scope set out in this Agreement."},
    {"key": "fees", "title": "Fees", "body": "This pilot program is provided at no charge to the Client. Pilot Fee: $0. Setup Fee: $0."},
    {"key": "pilot_disclosure", "title": "Pilot Terms and No Guarantee", "body": "Winsalot Corp will provide this pilot program at no charge for the agreed period and scope. The agreed number of qualified leads or appointments is a target and not a guarantee. Results may vary based on market conditions, prospect availability, targeting criteria and the client''s responsiveness. Winsalot Corp does not guarantee that a lead or appointment will result in a sale. The pilot will end on the stated end date unless both parties agree in writing to extend it or begin a paid monthly campaign."},
    {"key": "client_responsibilities", "title": "Client Responsibilities", "body": "The Client agrees to respond to delivered leads/appointments in a timely manner, provide accurate information about its products, services, and target market, and promptly notify Winsalot Corp of any change in availability, pricing, or offerings that would affect pilot accuracy."},
    {"key": "confidentiality", "title": "Confidentiality", "body": "Each party agrees to keep confidential any non-public business, technical, or customer information disclosed by the other party in connection with this pilot program, and to use it only to perform its obligations under this Agreement."},
    {"key": "data_ownership", "title": "Data Ownership", "body": "All lead and appointment data generated for the Client under this pilot program belongs to the Client. Winsalot Corp may retain records of the pilot it has run solely for its own internal record-keeping and performance-reporting purposes."},
    {"key": "signatures", "title": "Signatures", "body": "By signing below, each party agrees to be bound by the terms of this pilot program."}
  ]'::jsonb
);

-- ---------------------------------------------------------------------
-- crm_client_agreements: campaign_type distinguishes a paid standard
-- agreement from a free pilot; pilot_status tracks the pilot-only
-- lifecycle (Pilot Active -> Results Review -> Converted/Extended/
-- Closed) independently of the shared draft/sent/signed/superseded/
-- archived `status` column. The pilot-only fields are nullable since
-- they're irrelevant to a standard agreement.
-- ---------------------------------------------------------------------
alter table public.crm_client_agreements
  add column if not exists campaign_type text not null default 'standard_monthly'
    check (campaign_type in ('standard_monthly', 'free_pilot')),
  add column if not exists pilot_status text not null default 'not_started'
    check (pilot_status in ('not_started', 'active', 'results_review', 'converted', 'extended', 'closed')),
  add column if not exists pilot_duration text,
  add column if not exists pilot_end_date date,
  add column if not exists expected_call_volume text,
  add column if not exists qualification_criteria text,
  add column if not exists results_review_date date;

-- Extend the signed-immutability guard: a signed pilot's scope/period
-- terms can't silently change either (the pilot's own required
-- disclosure promises it "will end on the stated end date unless both
-- parties agree in writing") - pilot_status is deliberately NOT included
-- here since it's expected to keep advancing after signing.
create or replace function public.crm_client_agreements_guard_signed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'signed' and new.status = 'signed' then
    if new.legal_business_name is distinct from old.legal_business_name
      or new.contact_person is distinct from old.contact_person
      or new.business_email is distinct from old.business_email
      or new.service_type is distinct from old.service_type
      or new.target_type is distinct from old.target_type
      or new.monthly_target is distinct from old.monthly_target
      or new.monthly_fee is distinct from old.monthly_fee
      or new.setup_fee is distinct from old.setup_fee
      or new.target_industries is distinct from old.target_industries
      or new.target_locations is distinct from old.target_locations
      or new.campaign_start_date is distinct from old.campaign_start_date
      or new.billing_frequency is distinct from old.billing_frequency
      or new.payment_due_terms is distinct from old.payment_due_terms
      or new.initial_term is distinct from old.initial_term
      or new.renewal_terms is distinct from old.renewal_terms
      or new.cancellation_terms is distinct from old.cancellation_terms
      or new.signer_full_name is distinct from old.signer_full_name
      or new.signer_job_title is distinct from old.signer_job_title
      or new.signer_business_name is distinct from old.signer_business_name
      or new.signer_signature_text is distinct from old.signer_signature_text
      or new.campaign_type is distinct from old.campaign_type
      or new.pilot_duration is distinct from old.pilot_duration
      or new.pilot_end_date is distinct from old.pilot_end_date
      or new.expected_call_volume is distinct from old.expected_call_volume
      or new.qualification_criteria is distinct from old.qualification_criteria
      or new.results_review_date is distinct from old.results_review_date
    then
      raise exception 'A signed agreement cannot be edited. Create a new version instead.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Pilot results dashboard (brief: "Add a pilot results dashboard"). A
-- separate table, never gated by the signed-agreement immutability
-- trigger above, since results are recorded *during and after* the
-- pilot runs, deliberately after the agreement itself is already signed
-- and locked.
-- ---------------------------------------------------------------------
create table if not exists public.crm_pilot_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.crm_users(id) on delete set null,

  agreement_id uuid not null unique references public.crm_client_agreements(id) on delete restrict,

  calls_completed int,
  decision_makers_reached int,
  interested_prospects int,
  information_emails_sent int,
  qualified_leads int,
  appointments_booked int,
  common_objections text,
  market_response text,
  admin_recommendation text
);

alter table public.crm_pilot_results enable row level security;

create or replace function public.crm_pilot_results_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_pilot_results_set_updated_at
  before update on public.crm_pilot_results
  for each row execute function public.crm_pilot_results_set_updated_at();

create policy "crm_pilot_results_admin_all" on public.crm_pilot_results for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Grow crm_activities with the pilot-lifecycle activity types, same
-- additive technique 0082/0091/0097 already used - the full existing
-- list is repeated verbatim, only new values are appended.
-- ---------------------------------------------------------------------
alter table public.crm_activities drop constraint if exists crm_activities_activity_type_check;
alter table public.crm_activities add constraint crm_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'text', 'voicemail', 'note', 'outcome',
    'consultation_booked', 'consultation_rescheduled', 'consultation_cancelled',
    'client_created', 'client_updated', 'client_archived', 'client_reactivated',
    'client_deleted', 'client_agent_assigned', 'client_agent_unassigned',
    'invoice_created', 'invoice_sent', 'invoice_reminder_sent', 'invoice_cancelled',
    'invoice_archived', 'payment_recorded', 'payment_reversed',
    'agreement_sent', 'agreement_signed', 'agreement_superseded',
    'intake_sent', 'intake_received', 'onboarding_invoice_recorded',
    'onboarding_payment_received', 'campaign_activated',
    'pilot_activated', 'pilot_results_review_started', 'pilot_converted',
    'pilot_extended', 'pilot_closed', 'pilot_results_recorded'
  ));
