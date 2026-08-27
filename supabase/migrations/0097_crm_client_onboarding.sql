-- Winsalot Growth CRM: admin-only Client Onboarding workflow.
--
-- A brand-new, fully independent subsystem tracking a client's journey
-- from "Client Agreed" through a signed service agreement, a
-- client-specific intake form, a lightweight invoice/payment record, and
-- campaign activation. Entirely additive - no existing table, column, or
-- row is altered except crm_activities, which only gains new allowed
-- activity_type values (same technique 0082/0091 already used to grow
-- that same check constraint - no existing activity row's type is
-- affected). None of this touches the Lead Generation CRM (`leadgen_*`
-- tables/routes) or the standalone public lead-generation marketing form
-- (`lead_generation` table, migration 0002) at all.
--
-- Reuses two existing subsystems rather than duplicating them:
--   * crm_clients (migration 0091) is "the client" here - no new client
--     table. crm_opportunities is where onboarding starts from (an
--     admin action resolves-or-creates the crm_clients row, checking its
--     email for a duplicate first - see actions.ts).
--   * crm_invoices (migration 0091) is NOT reused for the lightweight
--     invoice/payment tracker below (crm_agreement_invoices) - the brief
--     explicitly asks for a small, manual 4-state log ("for now"), not
--     the full line-item/PDF/reminder invoice lifecycle. Keeping it a
--     separate table means this feature can never affect that existing,
--     working invoicing system.
--
-- Every table here is RLS-enabled, admin-only (single `_admin_all`
-- policy via the existing public.crm_user_role() helper, migration 0007
-- - no agent policy at all), matching the same "financial/contract data
-- is administrator-only" design already used for crm_clients/
-- crm_invoices. Public, unauthenticated pages (the agreement-sign link,
-- the intake-fill link) never use the anon/session client - they resolve
-- their secure token through the service-role client only, exactly like
-- src/lib/winsalot-consultation-tokens.ts, so RLS never has to grant
-- anon access to any of these tables.

-- ---------------------------------------------------------------------
-- Agreement templates: shared legal boilerplate. Every agreement
-- snapshots which template version it was built from (template_id on
-- crm_client_agreements below), so approving a later template version
-- never rewrites the wording an already-sent/signed agreement showed its
-- client.
-- ---------------------------------------------------------------------
create table if not exists public.crm_agreement_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null,
  -- Ordered array of {key, title, body} sections. `body` may contain
  -- {{placeholder}} tokens (monthly_target, service_noun_plural, etc.)
  -- filled in at render time by src/lib/crm-agreement-types.ts - never
  -- baked in here as static per-client text.
  content jsonb not null,
  legal_status text not null default 'draft_pending_review'
    check (legal_status in ('draft_pending_review', 'approved')),
  approved_by uuid references public.crm_users(id) on delete set null,
  approved_at timestamptz
);

create unique index if not exists crm_agreement_templates_version_idx
  on public.crm_agreement_templates (version);

alter table public.crm_agreement_templates enable row level security;

create or replace function public.crm_agreement_templates_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_agreement_templates_set_updated_at
  before update on public.crm_agreement_templates
  for each row execute function public.crm_agreement_templates_set_updated_at();

create policy "crm_agreement_templates_admin_all" on public.crm_agreement_templates for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Seed version 1, unapproved - covers every required section (qualified-
-- lead/appointment definition, services, monthly target, fees/payment
-- terms, client responsibilities, confidentiality, data ownership,
-- renewal/cancellation, no-guarantee clause, signature fields) but has
-- not been reviewed by counsel, so it starts and stays "Draft - pending
-- legal review" until an admin explicitly approves it from the Client
-- Agreements section.
insert into public.crm_agreement_templates (version, content, legal_status)
values (
  1,
  '[
    {"key": "definition", "title": "Definition of a Qualified {{service_noun_singular}}", "body": "A \"qualified {{service_noun_singular}}\" means a prospective customer or business contact that meets the targeting criteria (industries, locations, and qualification requirements) agreed between Winsalot Corp and the Client, and that Winsalot Corp has delivered to the Client in accordance with this Agreement."},
    {"key": "services", "title": "Services Provided", "body": "Winsalot Corp will provide {{service_label}} services to the Client, including prospecting, outreach, and qualification activities directed at the Client''s target industries and locations, for the purpose of generating {{service_noun_plural}} on the Client''s behalf."},
    {"key": "monthly_target", "title": "Monthly Target", "body": "Winsalot Corp will target {{monthly_target}} qualified {{service_noun_plural}} per month. Results may vary based on market conditions, prospect availability, targeting criteria and the Client''s responsiveness. Winsalot Corp does not guarantee that a lead or appointment will result in a sale."},
    {"key": "fees", "title": "Fees and Payment Terms", "body": "The Client will pay Winsalot Corp the monthly fee and, if applicable, the one-time setup fee set out in this Agreement, on the billing frequency and payment due terms set out in this Agreement."},
    {"key": "client_responsibilities", "title": "Client Responsibilities", "body": "The Client agrees to respond to delivered leads/appointments in a timely manner, provide accurate information about its products, services, and target market, and promptly notify Winsalot Corp of any change in availability, pricing, or offerings that would affect campaign accuracy."},
    {"key": "confidentiality", "title": "Confidentiality", "body": "Each party agrees to keep confidential any non-public business, technical, or customer information disclosed by the other party in connection with this Agreement, and to use it only to perform its obligations under this Agreement."},
    {"key": "data_ownership", "title": "Data Ownership", "body": "All lead and appointment data generated for the Client under this Agreement belongs to the Client. Winsalot Corp may retain records of the campaigns it has run solely for its own internal record-keeping and performance-reporting purposes."},
    {"key": "renewal_cancellation", "title": "Renewal and Cancellation", "body": "This Agreement renews and may be cancelled on the renewal and cancellation terms set out in this Agreement."},
    {"key": "no_guarantee", "title": "No Guarantee of Sales", "body": "Winsalot Corp does not guarantee that any lead or appointment delivered under this Agreement will result in a sale, booking, or any other business outcome for the Client."},
    {"key": "signatures", "title": "Signatures", "body": "By signing below, each party agrees to be bound by the terms of this Agreement."}
  ]'::jsonb,
  'draft_pending_review'
);

-- ---------------------------------------------------------------------
-- Client agreements: the core commercial record. client_id is required;
-- opportunity_id is set when the agreement was started from an existing
-- crm_opportunities row (the normal path per the brief) but stays
-- nullable so a directly-created agreement is never blocked.
-- ---------------------------------------------------------------------
create table if not exists public.crm_client_agreements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,
  updated_by uuid references public.crm_users(id) on delete set null,

  client_id uuid not null references public.crm_clients(id) on delete restrict,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  template_id uuid not null references public.crm_agreement_templates(id) on delete restrict,

  -- Versioning: any change to a signed agreement's commercial terms
  -- creates a new row with version = previous + 1 and supersedes_id
  -- pointing at the prior version, which is simultaneously moved to
  -- status = 'superseded' (never edited, never deleted - see the
  -- immutability trigger below).
  version int not null default 1,
  supersedes_id uuid references public.crm_client_agreements(id) on delete set null,

  status text not null default 'draft'
    check (status in ('draft', 'sent', 'signed', 'superseded', 'archived')),

  legal_business_name text not null,
  contact_person text not null,
  business_email text not null,

  service_type text not null check (service_type in ('qualified_leads', 'consultation_appointments')),
  target_type text not null default 'monthly_target' check (target_type in ('monthly_target', 'guaranteed')),
  monthly_target int not null check (monthly_target > 0),
  monthly_fee numeric(10, 2) not null check (monthly_fee >= 0),
  setup_fee numeric(10, 2) check (setup_fee >= 0),

  target_industries text[] not null default '{}',
  target_locations text[] not null default '{}',

  campaign_start_date date,
  billing_frequency text not null default 'monthly' check (billing_frequency in ('monthly', 'quarterly', 'annually')),
  payment_due_terms text,

  initial_term text,
  renewal_terms text,
  cancellation_terms text,
  additional_notes text,

  -- Review-and-send confirmation (brief section 4): "I have reviewed the
  -- price, monthly target and agreement terms." Required true before the
  -- send action will fire - enforced in the server action, not just the
  -- UI checkbox.
  admin_reviewed_confirmation boolean not null default false,

  -- Electronic acceptance (brief section 5) - folded into the same row
  -- since each agreement *version* is signed at most once. A typed
  -- signature only (no drawing canvas).
  signer_full_name text,
  signer_job_title text,
  signer_business_name text,
  signer_accepted boolean not null default false,
  signer_signature_text text,

  sent_at timestamptz,
  opened_at timestamptz,
  accepted_at timestamptz
);

create index if not exists crm_client_agreements_client_idx
  on public.crm_client_agreements (client_id);
create index if not exists crm_client_agreements_opportunity_idx
  on public.crm_client_agreements (opportunity_id);

alter table public.crm_client_agreements enable row level security;

create or replace function public.crm_client_agreements_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_client_agreements_set_updated_at
  before update on public.crm_client_agreements
  for each row execute function public.crm_client_agreements_set_updated_at();

-- Immutability: once an agreement is signed, its commercial terms and
-- signature fields can never change - only status transitions to
-- 'superseded'/'archived' remain allowed on a signed row (superseding
-- happens by inserting a brand-new row with supersedes_id set, never by
-- editing this one - see actions.ts). A database-level backstop, not
-- just an application-level rule.
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
    then
      raise exception 'A signed agreement cannot be edited. Create a new version instead.';
    end if;
  end if;
  return new;
end;
$$;

create trigger crm_client_agreements_guard_signed
  before update on public.crm_client_agreements
  for each row execute function public.crm_client_agreements_guard_signed();

create policy "crm_client_agreements_admin_all" on public.crm_client_agreements for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Full append-only audit trail (brief section 5: "Maintain an audit
-- record showing when the agreement was Created, Sent, Opened,
-- Accepted"). The four milestone timestamps also live directly on
-- crm_client_agreements above for fast dashboard reads, same "milestone
-- columns + full event log" split already used by crm_lead_emails / the
-- Resend webhook handler.
-- ---------------------------------------------------------------------
create table if not exists public.crm_agreement_events (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.crm_client_agreements(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'sent', 'opened', 'accepted', 'resent', 'superseded', 'archived', 'pdf_generated')),
  actor_type text not null check (actor_type in ('admin', 'client', 'system')),
  actor_id uuid,
  metadata jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists crm_agreement_events_agreement_idx
  on public.crm_agreement_events (agreement_id, occurred_at);

alter table public.crm_agreement_events enable row level security;

create policy "crm_agreement_events_admin_all" on public.crm_agreement_events for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Secure public sign-link. Same shape/convention as
-- winsalot_appointment_tokens (migration 0088) - a fresh random token per
-- send, resolved only through the service-role client
-- (src/lib/crm-agreement-tokens.ts), never a raw agreement id exposed to
-- a public visitor.
-- ---------------------------------------------------------------------
create table if not exists public.crm_agreement_tokens (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  agreement_id uuid not null references public.crm_client_agreements(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  opened_at timestamptz,
  used_at timestamptz
);

create index if not exists crm_agreement_tokens_agreement_idx
  on public.crm_agreement_tokens (agreement_id);

alter table public.crm_agreement_tokens enable row level security;

create policy "crm_agreement_tokens_admin_all" on public.crm_agreement_tokens for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Lightweight invoice/payment tracker (brief section 10) - deliberately
-- NOT crm_invoices (see module comment above): a manual 4-state log the
-- admin records after the intake form is received, amount defaulting to
-- the signed agreement's monthly_fee + setup_fee.
-- ---------------------------------------------------------------------
create table if not exists public.crm_agreement_invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,
  updated_by uuid references public.crm_users(id) on delete set null,

  agreement_id uuid not null references public.crm_client_agreements(id) on delete restrict,
  client_id uuid not null references public.crm_clients(id) on delete restrict,

  invoice_number text not null,
  invoice_amount numeric(10, 2) not null check (invoice_amount >= 0),
  date_sent date,
  payment_due_date date,

  status text not null default 'not_sent' check (status in ('not_sent', 'sent', 'payment_pending', 'payment_received')),
  paid_at timestamptz
);

create index if not exists crm_agreement_invoices_agreement_idx
  on public.crm_agreement_invoices (agreement_id);
create index if not exists crm_agreement_invoices_client_idx
  on public.crm_agreement_invoices (client_id);

alter table public.crm_agreement_invoices enable row level security;

create or replace function public.crm_agreement_invoices_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_agreement_invoices_set_updated_at
  before update on public.crm_agreement_invoices
  for each row execute function public.crm_agreement_invoices_set_updated_at();

create policy "crm_agreement_invoices_admin_all" on public.crm_agreement_invoices for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Per-client intake configuration (brief section 6/7/8) - only ever
-- creatable once the linked agreement is signed. `questions` is an
-- ordered jsonb array of admin-editable custom questions; editing one
-- client's array can never affect another client's, since there is no
-- shared template row for the custom-question list - only the shared
-- legal template above, which this table never touches. The 7
-- agreement-locked fields (legal business name, contact person, business
-- email, service type, agreed monthly target, campaign start date,
-- agreement term) are deliberately NOT columns here - the app reads them
-- live off the linked agreement, which is what makes "the client cannot
-- change them" structural rather than conventional.
-- ---------------------------------------------------------------------
create table if not exists public.crm_intake_configs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,
  updated_by uuid references public.crm_users(id) on delete set null,

  client_id uuid not null references public.crm_clients(id) on delete restrict,
  agreement_id uuid not null references public.crm_client_agreements(id) on delete restrict,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,

  status text not null default 'draft' check (status in ('draft', 'sent')),
  questions jsonb not null default '[]',

  sent_at timestamptz
);

create index if not exists crm_intake_configs_client_idx
  on public.crm_intake_configs (client_id);

alter table public.crm_intake_configs enable row level security;

create or replace function public.crm_intake_configs_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_intake_configs_set_updated_at
  before update on public.crm_intake_configs
  for each row execute function public.crm_intake_configs_set_updated_at();

create policy "crm_intake_configs_admin_all" on public.crm_intake_configs for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Secure public intake-fill link - same shape/convention as
-- crm_agreement_tokens above.
-- ---------------------------------------------------------------------
create table if not exists public.crm_intake_tokens (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  intake_config_id uuid not null references public.crm_intake_configs(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  opened_at timestamptz,
  used_at timestamptz
);

create index if not exists crm_intake_tokens_config_idx
  on public.crm_intake_tokens (intake_config_id);

alter table public.crm_intake_tokens enable row level security;

create policy "crm_intake_tokens_admin_all" on public.crm_intake_tokens for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Intake submissions: the client's original answers are never
-- overwritten. Admin corrections live in `corrected_answers` (a second,
-- optional layer) plus a full per-field audit trail in
-- crm_intake_submission_edits below - "record who changed information
-- and when" without ever losing what the client actually submitted.
-- ---------------------------------------------------------------------
create table if not exists public.crm_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  intake_config_id uuid not null references public.crm_intake_configs(id) on delete restrict,
  client_id uuid not null references public.crm_clients(id) on delete restrict,
  agreement_id uuid not null references public.crm_client_agreements(id) on delete restrict,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  answers jsonb not null,
  corrected_answers jsonb,
  submitted_at timestamptz not null default now()
);

create index if not exists crm_intake_submissions_config_idx
  on public.crm_intake_submissions (intake_config_id);
create index if not exists crm_intake_submissions_client_idx
  on public.crm_intake_submissions (client_id);

alter table public.crm_intake_submissions enable row level security;

create policy "crm_intake_submissions_admin_all" on public.crm_intake_submissions for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create table if not exists public.crm_intake_submission_edits (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.crm_intake_submissions(id) on delete cascade,
  changed_by uuid references public.crm_users(id) on delete set null,
  field_key text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists crm_intake_submission_edits_submission_idx
  on public.crm_intake_submission_edits (submission_id, created_at);

alter table public.crm_intake_submission_edits enable row level security;

create policy "crm_intake_submission_edits_admin_all" on public.crm_intake_submission_edits for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Grow crm_activities with the new onboarding milestone types, same
-- additive technique already used twice (0082, 0091) - no existing row's
-- activity_type is affected, this only widens what future rows may be.
-- Onboarding actions log to crm_activities with client_id (and
-- opportunity_id when known) set, exactly like every other client/
-- opportunity activity already does, so onboarding progress is visible
-- from the opportunity's/client's own existing timeline.
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
    'onboarding_payment_received', 'campaign_activated'
  ));
