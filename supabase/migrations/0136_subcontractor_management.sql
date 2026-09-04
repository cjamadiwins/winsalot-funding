-- Subcontractor Management, Onboarding, Agreement, Training, and Permissions
-- (Growth CRM only). Extends the basic Subcontractor Payments feature added
-- in migration 0135 (crm_subcontractors / crm_subcontractor_payments) into
-- a full lifecycle: onboarding checklist (derived, not stored - see
-- src/lib/crm-subcontractor-types.ts), a digital Independent Contractor
-- Agreement with versioning, required training modules, a dedicated
-- 'subcontractor' crm_users role with its own restricted CRM access, and
-- an audit trail.
--
-- LEAD GENERATION CRM IS NOT TOUCHED. Every table here is new and
-- Growth-CRM-only (crm_ prefix, matching this codebase's existing naming
-- convention throughout - crm_users, crm_clients, crm_payroll,
-- crm_subcontractors - rather than the unprefixed names suggested in the
-- brief). leadgen_subcontractors / leadgen_subcontractor_payments and the
-- shared src/lib/subcontractor-actions.ts / subcontractor-payroll.ts they
-- use are not modified by this migration or by any application code in
-- this change - the Lead Generation CRM's existing Subcontractor Payments
-- feature (migration 0135) keeps working exactly as shipped.
--
-- The one shared-infrastructure touch this feature requires is a new
-- allowed value on crm_users.role ('subcontractor', alongside the existing
-- 'admin'/'agent') plus a handful of *additive* RLS policies on
-- crm_call_logs (new policy names, existing agent/admin policies
-- untouched) - both are Growth CRM's own crm_users/crm_call_logs tables,
-- entirely separate from leadgen_users/leadgen_call_logs, so neither
-- touches the Lead Generation CRM. See this migration's own inline
-- comments at each such point for why it's required.

-- ---------------------------------------------------------------------
-- 1. crm_users: new 'subcontractor' role, linked 1:1 to a crm_subcontractors
--    profile row - mirrors the existing leadgen_users.client_id + role='client'
--    pairing pattern (migration 0031) exactly.
-- ---------------------------------------------------------------------

alter table public.crm_users drop constraint if exists crm_users_role_check;
alter table public.crm_users
  add constraint crm_users_role_check check (role in ('admin', 'agent', 'subcontractor'));

alter table public.crm_users
  add column if not exists subcontractor_id uuid references public.crm_subcontractors(id) on delete cascade;

alter table public.crm_users drop constraint if exists crm_users_subcontractor_role_pairing;
alter table public.crm_users
  add constraint crm_users_subcontractor_role_pairing check (
    (role = 'subcontractor' and subcontractor_id is not null)
    or (role <> 'subcontractor' and subcontractor_id is null)
  );

create index if not exists crm_users_subcontractor_id_idx on public.crm_users(subcontractor_id);

-- Security-definer helper, same pattern as crm_user_role() (0007) - lets
-- RLS policies look up "which subcontractor profile is this caller" without
-- re-triggering RLS on crm_users itself.
create or replace function public.crm_user_subcontractor_id(uid uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select subcontractor_id from public.crm_users where id = uid and active and role = 'subcontractor' limit 1;
$$;

revoke all on function public.crm_user_subcontractor_id(uuid) from public;
grant execute on function public.crm_user_subcontractor_id(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. crm_subcontractors: extend the profile (migration 0135) with the
--    fields the brief's admin profile (section A) requires. All new
--    columns are nullable or defaulted so this is a pure additive ALTER -
--    no existing row (there are none in production yet) can violate it.
--    The existing `active` boolean/`deactivated_at`/`deactivated_by`
--    columns are left exactly as they are (still valid, just superseded
--    by the richer `status` enum for any *new* admin UI - see this
--    migration's header comment on why nothing is dropped).
-- ---------------------------------------------------------------------

alter table public.crm_subcontractors
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists business_name text,
  add column if not exists start_date date,
  add column if not exists status text not null default 'pending_onboarding'
    check (status in ('pending_onboarding', 'active', 'inactive', 'suspended', 'terminated'));

-- Backfill: every row that already exists (from 0135) only ever had the
-- boolean active/inactive model - map it onto the new status enum once,
-- so nothing silently reads as 'pending_onboarding' for a row an admin
-- already deliberately deactivated.
update public.crm_subcontractors
set status = case when active then 'active' else 'inactive' end
where status = 'pending_onboarding';

create index if not exists crm_subcontractors_status_idx on public.crm_subcontractors(status);
create index if not exists crm_subcontractors_email_idx on public.crm_subcontractors(email);

-- ---------------------------------------------------------------------
-- 3. crm_subcontractor_payments: add rate/currency/pay-type/client
--    snapshots (brief section K - "historical records should not change
--    when the subcontractor's future rate changes") and widen the status
--    enum to the brief's 4-state model (Draft/Pending Approval/Approved/
--    Paid). Table is empty in production today (0135 just shipped), so
--    this ALTER is fully safe with no data migration needed.
-- ---------------------------------------------------------------------

alter table public.crm_subcontractor_payments
  add column if not exists rate_snapshot numeric(12, 2) not null default 0,
  add column if not exists currency_snapshot text not null default 'USD'
    check (currency_snapshot in ('NGN', 'PHP', 'CAD', 'USD', 'GBP', 'EUR')),
  add column if not exists pay_type_snapshot text
    check (pay_type_snapshot in ('fixed', 'hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'per_lead_appointment')),
  add column if not exists business_client_snapshot text;

alter table public.crm_subcontractor_payments drop constraint if exists crm_subcontractor_payments_status_check;
alter table public.crm_subcontractor_payments
  add constraint crm_subcontractor_payments_status_check
  check (status in ('draft', 'pending_approval', 'approved', 'paid'));

alter table public.crm_subcontractor_payments alter column status set default 'draft';

-- ---------------------------------------------------------------------
-- 4. crm_subcontractor_client_assignments: full assignment history (brief
--    section E - "create proper assignment records instead of storing
--    comma-separated client names"). The current/primary assignment for a
--    subcontractor is the one row with unassigned_at is null - enforced
--    unique below so there is never more than one "current" assignment at
--    once, satisfying "at minimum, support one current primary
--    assignment" while the table itself can hold the full history (and,
--    since it's a normal table rather than a single FK column, would
--    support multiple concurrent assignments in the future without a
--    schema change if that's ever wanted - not built into any UI now).
--    crm_subcontractors.business_client_id (0135) is left in place but no
--    longer written by any new code - this table is the new source of
--    truth for "current assignment".
-- ---------------------------------------------------------------------

create table if not exists public.crm_subcontractor_client_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subcontractor_id uuid not null references public.crm_subcontractors(id) on delete cascade,
  client_id uuid not null references public.crm_clients(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.crm_users(id) on delete set null,
  unassigned_at timestamptz,
  notes text
);

create index if not exists crm_subcontractor_client_assignments_subcontractor_idx
  on public.crm_subcontractor_client_assignments(subcontractor_id, assigned_at desc);

create unique index if not exists crm_subcontractor_client_assignments_one_current
  on public.crm_subcontractor_client_assignments(subcontractor_id)
  where unassigned_at is null;

alter table public.crm_subcontractor_client_assignments enable row level security;

create policy "crm_subcontractor_client_assignments_admin_all"
  on public.crm_subcontractor_client_assignments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_subcontractor_client_assignments_self_select"
  on public.crm_subcontractor_client_assignments for select
  using (subcontractor_id = public.crm_user_subcontractor_id(auth.uid()));

-- Non-financial, read-only view of a subcontractor's currently assigned
-- client - same "RLS filters rows, this filters columns" rationale as
-- crm_agent_visible_clients() (migration 0091).
create or replace function public.crm_subcontractor_visible_clients()
returns table (
  id uuid,
  company_name text,
  primary_contact_name text,
  service text,
  status text
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.company_name, c.primary_contact_name, c.service, c.status
  from public.crm_clients c
  join public.crm_subcontractor_client_assignments a on a.client_id = c.id
  where a.subcontractor_id = public.crm_user_subcontractor_id(auth.uid())
    and a.unassigned_at is null;
$$;

revoke all on function public.crm_subcontractor_visible_clients() from public;
grant execute on function public.crm_subcontractor_visible_clients() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Independent Contractor Agreement: versioned template + immutable
--    per-subcontractor acceptance records (brief sections C and O).
-- ---------------------------------------------------------------------

create table if not exists public.crm_subcontractor_agreement_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  version numeric(4, 1) not null unique,
  is_current boolean not null default true,
  -- Ordered array of {key, title, body} sections, same shape/rendering
  -- convention as crm_agreement_templates.content (migration 0097) -
  -- {{token}} placeholders substituted at render time, never stored
  -- pre-filled, so the template itself stays reusable across every
  -- subcontractor.
  content jsonb not null
);

create unique index if not exists crm_subcontractor_agreement_templates_one_current
  on public.crm_subcontractor_agreement_templates(is_current)
  where is_current;

alter table public.crm_subcontractor_agreement_templates enable row level security;

create policy "crm_subcontractor_agreement_templates_admin_all"
  on public.crm_subcontractor_agreement_templates for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Any active Growth CRM member may read the template text (it's boilerplate
-- contract language, not sensitive) - needed so a subcontractor's own
-- sign page and PDF download can render it.
create policy "crm_subcontractor_agreement_templates_select_members"
  on public.crm_subcontractor_agreement_templates for select
  using (public.crm_user_role(auth.uid()) is not null);

create table if not exists public.crm_subcontractor_agreements (
  id uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.crm_subcontractors(id) on delete cascade,
  template_id uuid not null references public.crm_subcontractor_agreement_templates(id) on delete restrict,
  version numeric(4, 1) not null,

  -- Immutable snapshot of everything shown on the signed agreement -
  -- "store an agreement snapshot or immutable version reference" (brief
  -- section C). Never updated after insert; a re-sign on a later version
  -- is always a brand-new row, never an edit of this one.
  rendered_content jsonb not null,
  contractor_name_typed text not null check (length(trim(contractor_name_typed)) > 0),
  business_name_snapshot text,
  address_snapshot text,
  country_snapshot text,
  email_snapshot text,
  currency_snapshot text,
  pay_type_snapshot text,
  rate_snapshot numeric(12, 2),
  start_date_snapshot date,
  assigned_client_snapshot text,

  accepted_at timestamptz not null default now(),
  ip_address text,
  user_id uuid references public.crm_users(id) on delete set null,

  unique (subcontractor_id, version)
);

create index if not exists crm_subcontractor_agreements_subcontractor_idx
  on public.crm_subcontractor_agreements(subcontractor_id, accepted_at desc);

alter table public.crm_subcontractor_agreements enable row level security;

create policy "crm_subcontractor_agreements_admin_all"
  on public.crm_subcontractor_agreements for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_subcontractor_agreements_self_select"
  on public.crm_subcontractor_agreements for select
  using (subcontractor_id = public.crm_user_subcontractor_id(auth.uid()));

-- Insert-only for the subcontractor themselves (sign their own agreement) -
-- no self update/delete policy at all, so "do not silently change an
-- agreement that has already been accepted" is enforced at the database
-- level, not just by the application never offering an edit button.
create policy "crm_subcontractor_agreements_self_insert"
  on public.crm_subcontractor_agreements for insert
  with check (subcontractor_id = public.crm_user_subcontractor_id(auth.uid()) and user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. Subcontractor training: parallel to crm_training_modules but fully
--    separate (that system's crm_training_module_assignments.assigned_role
--    is hard-coded to 'agent' only - see this migration's header comment -
--    so reusing it would mean widening the existing agent training system
--    rather than staying additive). required_override lets an admin mark
--    a module required/not-required per subcontractor (brief section G's
--    "depending on the subcontractor assignment"); null means "use the
--    module's own is_required default".
-- ---------------------------------------------------------------------

create table if not exists public.crm_subcontractor_training_modules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  slug text not null unique,
  title text not null,
  sort_order int not null default 0,
  is_required boolean not null default true,
  is_active boolean not null default true,
  content text not null
);

alter table public.crm_subcontractor_training_modules enable row level security;

create policy "crm_subcontractor_training_modules_admin_all"
  on public.crm_subcontractor_training_modules for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_subcontractor_training_modules_select_members"
  on public.crm_subcontractor_training_modules for select
  using (public.crm_user_role(auth.uid()) is not null);

create table if not exists public.crm_subcontractor_training_progress (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  subcontractor_id uuid not null references public.crm_subcontractors(id) on delete cascade,
  module_id uuid not null references public.crm_subcontractor_training_modules(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  required_override boolean,
  started_at timestamptz,
  completed_at timestamptz,
  unique (subcontractor_id, module_id)
);

create index if not exists crm_subcontractor_training_progress_subcontractor_idx
  on public.crm_subcontractor_training_progress(subcontractor_id);

create or replace function public.crm_subcontractor_training_progress_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_subcontractor_training_progress_set_updated_at on public.crm_subcontractor_training_progress;
create trigger crm_subcontractor_training_progress_set_updated_at
  before update on public.crm_subcontractor_training_progress
  for each row execute function public.crm_subcontractor_training_progress_set_updated_at();

alter table public.crm_subcontractor_training_progress enable row level security;

create policy "crm_subcontractor_training_progress_admin_all"
  on public.crm_subcontractor_training_progress for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_subcontractor_training_progress_self_select"
  on public.crm_subcontractor_training_progress for select
  using (subcontractor_id = public.crm_user_subcontractor_id(auth.uid()));

create policy "crm_subcontractor_training_progress_self_upsert"
  on public.crm_subcontractor_training_progress for insert
  with check (subcontractor_id = public.crm_user_subcontractor_id(auth.uid()));

create policy "crm_subcontractor_training_progress_self_update"
  on public.crm_subcontractor_training_progress for update
  using (subcontractor_id = public.crm_user_subcontractor_id(auth.uid()))
  with check (subcontractor_id = public.crm_user_subcontractor_id(auth.uid()));

-- ---------------------------------------------------------------------
-- 7. crm_subcontractor_permissions: 1:1 admin-controlled CRM access grant
--    (brief section F). crm_access is scoped to Growth CRM only - the
--    brief's generic "No Access / Lead CRM / Growth CRM / Both" template
--    text is intentionally narrowed to "no_access / growth_crm" here,
--    since this entire feature is Growth-CRM-only per the task's own
--    top-level instruction and a subcontractor row/login has no
--    corresponding identity in the completely separate leadgen_users
--    table to grant Lead CRM access to.
-- ---------------------------------------------------------------------

create table if not exists public.crm_subcontractor_permissions (
  subcontractor_id uuid primary key references public.crm_subcontractors(id) on delete cascade,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.crm_users(id) on delete set null,
  crm_access text not null default 'no_access' check (crm_access in ('no_access', 'growth_crm')),
  view_assigned_leads boolean not null default false,
  add_call_logs boolean not null default false,
  update_lead_status boolean not null default false,
  book_appointments boolean not null default false,
  view_assigned_training boolean not null default true
);

create or replace function public.crm_subcontractor_permissions_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_subcontractor_permissions_set_updated_at on public.crm_subcontractor_permissions;
create trigger crm_subcontractor_permissions_set_updated_at
  before update on public.crm_subcontractor_permissions
  for each row execute function public.crm_subcontractor_permissions_set_updated_at();

alter table public.crm_subcontractor_permissions enable row level security;

create policy "crm_subcontractor_permissions_admin_all"
  on public.crm_subcontractor_permissions for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_subcontractor_permissions_self_select"
  on public.crm_subcontractor_permissions for select
  using (subcontractor_id = public.crm_user_subcontractor_id(auth.uid()));

-- ---------------------------------------------------------------------
-- 8. crm_subcontractor_audit_log: append-only admin action trail (brief
--    section P), same shape as crm_payroll_audit_log (0063) / the invoice
--    audit ledger (0091).
-- ---------------------------------------------------------------------

create table if not exists public.crm_subcontractor_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subcontractor_id uuid not null references public.crm_subcontractors(id) on delete cascade,
  action text not null check (action in (
    'created', 'profile_updated', 'agreement_accepted', 'client_assignment_changed',
    'compensation_changed', 'crm_access_granted', 'crm_access_revoked',
    'permissions_changed', 'training_completed', 'payroll_approved', 'payroll_paid',
    'status_changed', 'deactivated', 'reactivated'
  )),
  performed_by uuid references public.crm_users(id) on delete set null,
  performed_by_name text not null,
  reason text,
  details jsonb
);

create index if not exists crm_subcontractor_audit_log_subcontractor_idx
  on public.crm_subcontractor_audit_log(subcontractor_id, created_at desc);

alter table public.crm_subcontractor_audit_log enable row level security;

create policy "crm_subcontractor_audit_log_admin_all"
  on public.crm_subcontractor_audit_log for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- 9. crm_call_logs: additive subcontractor-scoped RLS (brief section G's
--    call-logging training + section F's "add_call_logs" permission).
--    New policy names only - crm_call_logs_admin_all /
--    crm_call_logs_agent_select_own / crm_call_logs_agent_insert_own
--    (migration 0130) are untouched, so agent call logging behavior is
--    unaffected. business_client_name stays pinned to 'Winsalot Corp.' by
--    the existing crm_call_logs_business_client_name_fixed check
--    constraint (0131) for every caller, subcontractors included -
--    Growth CRM subcontractors prospect on Winsalot Corp.'s own behalf,
--    same as agents, so there is no per-client business name to select
--    here (their Business/Client *assignment* is a separate, payroll/
--    reporting-facing concept - see crm_subcontractor_client_assignments
--    above - not what appears on a call log).
-- ---------------------------------------------------------------------

create policy "crm_call_logs_subcontractor_select_own"
  on public.crm_call_logs for select
  using (
    public.crm_user_role(auth.uid()) = 'subcontractor'
    and agent_id = auth.uid()
  );

create policy "crm_call_logs_subcontractor_insert_own"
  on public.crm_call_logs for insert
  with check (
    public.crm_user_role(auth.uid()) = 'subcontractor'
    and agent_id = auth.uid()
    and exists (
      select 1 from public.crm_subcontractor_permissions p
      where p.subcontractor_id = public.crm_user_subcontractor_id(auth.uid())
        and p.add_call_logs
    )
  );
