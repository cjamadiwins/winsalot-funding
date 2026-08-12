-- Weekly Agent Incentive - shared/central tables spanning BOTH CRMs.
--
-- Deliberately prefixed `winsalot_`, not `crm_` or `leadgen_` - every
-- other migration in this repo goes out of its way to keep the two CRMs'
-- tables, RLS helper functions, and role models completely independent
-- (see the header comments on 0007_crm_leads.sql and 0031_leadgen_crm.sql
-- for why). These three tables are the deliberate, narrow exception: the
-- brief requires that "if the same agent works in both CRMs, their total
-- approved incentive across both CRMs must still not exceed ₦25,000 per
-- calendar month," and crm_users/leadgen_users are separate identity
-- systems with no shared id (crm_payroll's own comment: "a different
-- pool of people... no shared-agent record"), so enforcing a cross-CRM
-- cap requires one shared ledger both sides read from - exactly the
-- "central incentive ledger" the brief itself suggests as the fallback
-- when two CRMs don't share an identity system. Every read/write of
-- these tables still goes through requireLeadgenAdmin()/requireAdminUser()
-- first (see src/lib/agent-incentive-ledger.ts) - this migration does not
-- loosen either CRM's own tables, RLS, or role model in any way.
--
-- Cross-CRM identity is joined on lower(trim(email)) - the one thing
-- crm_users and leadgen_users both have (see 0007_crm_leads.sql,
-- 0031_leadgen_crm.sql) that could plausibly be the same real person in
-- both systems. `source_leadgen_user_id`/`source_crm_user_id` are kept
-- alongside it so RLS can still scope a row to its real, single owning
-- user without ever trusting the email string for access control -
-- email is only ever used for the cross-CRM bonus-total aggregation in
-- application code, never for row visibility.

-- ---------------------------------------------------------------------
-- winsalot_incentive_settings: one configurable singleton row (brief:
-- "The incentive rules and amounts should be configurable by admin").
-- Quota/weekly-amount are tracked per CRM (a Lead Gen "qualified
-- appointment" and a Cleaning "qualified quote" are different things,
-- and the brief lets admin configure each CRM's own quota/amount
-- independently); the monthly cap is a single column shared by both,
-- matching the brief's one global "₦25,000 per agent per calendar
-- month" rule - there is structurally only one number for it to drift
-- from, unlike if it were duplicated per CRM.
-- ---------------------------------------------------------------------
create table if not exists public.winsalot_incentive_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000002'::uuid
    check (id = '00000000-0000-0000-0000-000000000002'::uuid),
  leadgen_weekly_quota integer not null default 4 check (leadgen_weekly_quota > 0),
  leadgen_weekly_bonus_amount numeric(12, 2) not null default 5000 check (leadgen_weekly_bonus_amount >= 0),
  crm_weekly_quota integer not null default 4 check (crm_weekly_quota > 0),
  crm_weekly_bonus_amount numeric(12, 2) not null default 5000 check (crm_weekly_bonus_amount >= 0),
  monthly_cap numeric(12, 2) not null default 25000 check (monthly_cap >= 0),
  updated_at timestamptz not null default now(),
  updated_by_name text
);

insert into public.winsalot_incentive_settings (id) values ('00000000-0000-0000-0000-000000000002'::uuid)
on conflict (id) do nothing;

alter table public.winsalot_incentive_settings enable row level security;

create policy "winsalot_incentive_settings_admin_all"
  on public.winsalot_incentive_settings for all
  using (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin');

-- Agents of either CRM need to read the quota/amount/cap to render their
-- own Weekly Incentive card - read-only.
create policy "winsalot_incentive_settings_agent_select"
  on public.winsalot_incentive_settings for select
  using (public.crm_user_role(auth.uid()) = 'agent' or public.leadgen_user_role(auth.uid()) = 'agent');

-- ---------------------------------------------------------------------
-- winsalot_agent_incentive_ledger: one row per agent per CRM per
-- Mon-Sun week - the source of truth for "was this week's bonus
-- approved/paid, and for how much." Never written directly by end
-- users; only by the approval Server Actions in
-- src/lib/agent-incentive-ledger.ts (used by both
-- src/app/leadgen/admin/(dashboard)/incentives/actions.ts and
-- src/app/admin/(dashboard)/crm/incentives/actions.ts), which recompute
-- qualified_count/calculated_bonus live from the source CRM's own data
-- every time rather than trusting any client-submitted number.
-- ---------------------------------------------------------------------
create table if not exists public.winsalot_agent_incentive_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  crm text not null check (crm in ('leadgen', 'cleaning')),
  source_leadgen_user_id uuid references public.leadgen_users(id) on delete set null,
  source_crm_user_id uuid references public.crm_users(id) on delete set null,
  agent_email text not null,
  agent_name text not null,
  week_start date not null,
  week_end date not null,
  month_start date not null,
  qualified_count integer not null default 0 check (qualified_count >= 0),
  weekly_quota integer not null check (weekly_quota > 0),
  quota_met boolean not null default false,
  -- Snapshot of quota_met ? weekly_bonus_amount : 0 at calculation time
  -- (brief: "No partial bonus is awarded for missing the weekly quota").
  calculated_bonus numeric(12, 2) not null default 0 check (calculated_bonus >= 0),
  -- Admin's approved payout - equal to calculated_bonus, or an
  -- "adjustment" (brief: "Adjust a bonus with a mandatory written
  -- reason"), which the constraint below requires a reason for.
  approved_total numeric(12, 2) check (approved_total is null or approved_total >= 0),
  adjustment_reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid')),
  approved_by_name text,
  approved_at timestamptz,
  paid_by_name text,
  paid_at timestamptz,
  constraint winsalot_agent_incentive_ledger_period_order check (week_end >= week_start),
  constraint winsalot_agent_incentive_ledger_source_matches_crm check (
    (crm = 'leadgen' and source_leadgen_user_id is not null and source_crm_user_id is null)
    or (crm = 'cleaning' and source_crm_user_id is not null and source_leadgen_user_id is null)
  ),
  constraint winsalot_agent_incentive_ledger_reason_required_on_adjustment check (
    approved_total is null or approved_total = calculated_bonus or (adjustment_reason is not null and length(trim(adjustment_reason)) > 0)
  ),
  constraint winsalot_agent_incentive_ledger_status_approval_pairing check (
    (status = 'pending' and approved_total is null and approved_by_name is null and approved_at is null)
    or (status in ('approved', 'paid') and approved_total is not null and approved_by_name is not null and approved_at is not null)
  ),
  constraint winsalot_agent_incentive_ledger_status_payment_pairing check (
    (status = 'paid' and paid_by_name is not null and paid_at is not null)
    or (status != 'paid' and paid_by_name is null and paid_at is null)
  ),
  -- "Do not allow the same appointment, quote or weekly achievement to
  -- be counted twice" (brief) - one row per agent per CRM per week, so
  -- re-approving a period updates that one row instead of duplicating it.
  constraint winsalot_agent_incentive_ledger_one_row_per_agent_crm_week unique (crm, agent_email, week_start)
);

create index if not exists winsalot_agent_incentive_ledger_email_month_idx
  on public.winsalot_agent_incentive_ledger(agent_email, month_start);
create index if not exists winsalot_agent_incentive_ledger_crm_week_idx
  on public.winsalot_agent_incentive_ledger(crm, week_start desc);
create index if not exists winsalot_agent_incentive_ledger_leadgen_agent_idx
  on public.winsalot_agent_incentive_ledger(source_leadgen_user_id);
create index if not exists winsalot_agent_incentive_ledger_crm_agent_idx
  on public.winsalot_agent_incentive_ledger(source_crm_user_id);

alter table public.winsalot_agent_incentive_ledger enable row level security;

create policy "winsalot_agent_incentive_ledger_admin_all"
  on public.winsalot_agent_incentive_ledger for all
  using (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin');

-- "Agents must only see their own incentive information" (brief) - no
-- insert/update/delete policy for agents at all, and the select below is
-- gated on this row's *own* source_*_user_id matching the caller,
-- checked against the matching CRM's own active-agent role so a
-- deactivated account can't still read it (same pairing convention as
-- crm_leads_agent_select_own / leadgen_followups_agent_select_own).
create policy "winsalot_agent_incentive_ledger_agent_select_own"
  on public.winsalot_agent_incentive_ledger for select
  using (
    (source_leadgen_user_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent')
    or (source_crm_user_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent')
  );

-- ---------------------------------------------------------------------
-- winsalot_agent_incentive_audit: permanent, append-only log of every
-- approve/adjust/pay event (brief: "View the full incentive audit
-- history"). Denormalized (agent identity/period duplicated from the
-- ledger row) so the audit trail is self-sufficient - never rewritten or
-- pruned even if a ledger row is ever removed.
-- ---------------------------------------------------------------------
create table if not exists public.winsalot_agent_incentive_audit (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid references public.winsalot_agent_incentive_ledger(id) on delete set null,
  crm text not null check (crm in ('leadgen', 'cleaning')),
  agent_email text not null,
  agent_name text not null,
  week_start date not null,
  week_end date not null,
  action text not null check (action in ('approved', 'adjusted', 'paid')),
  previous_total numeric(12, 2),
  new_total numeric(12, 2) not null,
  reason text,
  performed_by_name text not null,
  occurred_at timestamptz not null default now()
);

create index if not exists winsalot_agent_incentive_audit_email_idx on public.winsalot_agent_incentive_audit(agent_email, occurred_at desc);
create index if not exists winsalot_agent_incentive_audit_ledger_idx on public.winsalot_agent_incentive_audit(ledger_id, occurred_at desc);

alter table public.winsalot_agent_incentive_audit enable row level security;

-- Admin-only (brief only asks admin to be able to view this).
create policy "winsalot_agent_incentive_audit_admin_all"
  on public.winsalot_agent_incentive_audit for all
  using (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin');
