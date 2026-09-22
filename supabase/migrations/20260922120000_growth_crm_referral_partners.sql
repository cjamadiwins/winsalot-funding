-- Winsalot Growth CRM: Subcontractor/Referral Partners.
--
-- Extends the existing crm_subcontractors table (migrations 0135/0136/0137)
-- with a second kind of subcontractor row: a "Referral Partner" (e.g.
-- Tony) who introduces Lead Generation clients and Business Lending
-- referrals to Winsalot Corp. in exchange for a recurring revenue share /
-- commission share - a fundamentally different relationship from the
-- existing "Contractor" row shape those migrations built (hourly/project
-- pay, an Independent Contractor Agreement, required training, CRM
-- login). Rather than forcing a referral partner through that onboarding
-- checklist/agreement/training machinery (none of which applies to them),
-- crm_subcontractors gets a new `partner_type` column so both kinds of
-- row can live in the same Subcontractors section/list, while every new
-- column and table below is additive and nullable/defaulted so every
-- existing contractor row is completely unaffected (partner_type defaults
-- to 'contractor', matching every row that exists today).
--
-- Growth-CRM-only, same as 0135/0136/0137: nothing here touches
-- leadgen_subcontractors/leadgen_subcontractor_payments or any Lead
-- Generation CRM table.
--
-- Entirely additive: no existing column, row, policy, trigger, or check
-- constraint is narrowed - the two check constraints widened below
-- (crm_subcontractor_audit_log's action list) use the same drop+recreate
-- technique already established by 0099/0158 for crm_activities'
-- "exactly one target" constraint, and every value that constraint
-- already accepted remains accepted.

-- ---------------------------------------------------------------------
-- 1. crm_subcontractors: partner type + referral-partner-only fields.
--    All nullable/defaulted - a pure additive ALTER.
-- ---------------------------------------------------------------------

alter table public.crm_subcontractors
  add column if not exists partner_type text not null default 'contractor'
    check (partner_type in ('contractor', 'referral_partner')),
  -- e.g. {"Website Design", "SEO", "Business Lending Referrals"} - only
  -- meaningful for partner_type = 'referral_partner'.
  add column if not exists primary_markets text[],
  -- "Recurring Revenue Share" - the percentage of collected Lead
  -- Generation revenue this partner receives on clients they directly
  -- introduce (brief: "Do not label it as 'profit sharing'"). Nullable:
  -- only set for referral partners; never used or shown for contractors.
  add column if not exists lead_gen_revenue_share_percent numeric(5, 2)
    check (lead_gen_revenue_share_percent is null or (lead_gen_revenue_share_percent >= 0 and lead_gen_revenue_share_percent <= 100)),
  -- "Business Lending Commission Share" - the percentage of the net
  -- lender commission Winsalot Corp. actually receives.
  add column if not exists lending_commission_share_percent numeric(5, 2)
    check (lending_commission_share_percent is null or (lending_commission_share_percent >= 0 and lending_commission_share_percent <= 100)),
  -- Send Partner Overview Email (brief: "Create the email and button but
  -- leave the final sending action under Admin control") - same
  -- generate-once-then-review-then-send-manually shape as
  -- crm_consultation_guides.follow_up_email_* (migration
  -- 20260921130000/20260921170000), scoped to this one subcontractor row
  -- instead of a per-guide row since a referral partner has exactly one
  -- overview email, not one per prospect.
  add column if not exists partner_overview_email_subject text,
  add column if not exists partner_overview_email_body text,
  add column if not exists partner_overview_email_status text not null default 'not_sent'
    check (partner_overview_email_status in ('not_sent', 'sending', 'sent', 'failed')),
  add column if not exists partner_overview_email_sent_at timestamptz,
  add column if not exists partner_overview_email_error text;

create index if not exists crm_subcontractors_partner_type_idx on public.crm_subcontractors(partner_type);

comment on column public.crm_subcontractors.partner_type is
  'contractor (default, every existing row) = the full onboarding/agreement/training/payroll lifecycle from migrations 0135-0137, unaffected by this migration. referral_partner = an introducer paid a revenue/commission share (see lead_gen_revenue_share_percent / lending_commission_share_percent and the crm_subcontractor_referral_revenue / crm_subcontractor_lending_referrals tables below) - no onboarding checklist, agreement, training, or CRM login applies.';

-- ---------------------------------------------------------------------
-- 2. crm_subcontractor_audit_log: widen the action list to cover
--    referral-partner-specific actions. Same drop+recreate technique as
--    crm_activities_exactly_one_target (0099/0158) - every action value
--    already accepted remains accepted.
-- ---------------------------------------------------------------------

alter table public.crm_subcontractor_audit_log drop constraint if exists crm_subcontractor_audit_log_action_check;
alter table public.crm_subcontractor_audit_log add constraint crm_subcontractor_audit_log_action_check
  check (action in (
    'created', 'profile_updated', 'agreement_accepted', 'client_assignment_changed',
    'compensation_changed', 'crm_access_granted', 'crm_access_revoked',
    'permissions_changed', 'training_completed', 'payroll_approved', 'payroll_paid',
    'status_changed', 'deactivated', 'reactivated',
    'referral_prospect_linked', 'referral_prospect_unlinked',
    'referral_client_linked', 'referral_client_unlinked',
    'referral_revenue_recorded', 'referral_revenue_commission_paid',
    'lending_referral_recorded', 'lending_referral_commission_paid',
    'partner_overview_email_sent'
  ));

-- ---------------------------------------------------------------------
-- 3. Referral attribution on prospects/clients - "the relationship must
--    stay attached to the prospect/client even if [it] progresses
--    through Prospect -> Consultation -> Interested -> Client -> Active
--    Client." crm_opportunities is one row across its entire pipeline
--    (New Prospect through Client Won - migration 0080), so setting this
--    once there survives every stage change automatically. crm_clients is
--    a separate, independently-created table with no conversion link
--    from crm_opportunities today (client records are created directly by
--    Admin, not auto-generated from a won opportunity) and is itself one
--    row across ITS OWN stages (Prospect -> Pilot -> Active -> ... -
--    migration 0091), so the same column there keeps the attribution
--    intact across those transitions too. Both are plain nullable FKs -
--    no RLS policy change needed on either table (Postgres RLS is
--    row-level, not column-level, so the existing admin/agent policies on
--    both tables already cover this new column).
-- ---------------------------------------------------------------------

alter table public.crm_opportunities
  add column if not exists referral_partner_id uuid references public.crm_subcontractors(id) on delete set null;

create index if not exists crm_opportunities_referral_partner_idx on public.crm_opportunities(referral_partner_id);

alter table public.crm_clients
  add column if not exists referral_partner_id uuid references public.crm_subcontractors(id) on delete set null;

create index if not exists crm_clients_referral_partner_idx on public.crm_clients(referral_partner_id);

-- ---------------------------------------------------------------------
-- 4. crm_subcontractor_referral_revenue: Lead Generation recurring
--    revenue-share tracking, one row per client per billing period (brief
--    section "REFERRAL TRACKING" example fields: Client / Monthly Amount
--    / Amount Collected / Tony Share / Winsalot Share / Payment Status /
--    Commission Status / Payment Date). revenue_share_percent_snapshot
--    mirrors crm_subcontractor_payments.rate_snapshot (migration 0136) -
--    "historical records should not change when the subcontractor's
--    future rate changes." partner_share/winsalot_share are generated
--    columns computed off amount_collected (never monthly_amount), so the
--    brief's "Do not calculate Tony's share on unpaid invoices - only
--    calculate...after payment is recorded as received" is enforced at
--    the schema level, not just by application code discipline.
-- ---------------------------------------------------------------------

create table if not exists public.crm_subcontractor_referral_revenue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,

  subcontractor_id uuid not null references public.crm_subcontractors(id) on delete cascade,
  client_id uuid not null references public.crm_clients(id) on delete restrict,

  period_start date not null,
  period_end date not null,

  monthly_amount numeric(12, 2) not null default 0 check (monthly_amount >= 0),
  amount_collected numeric(12, 2) not null default 0 check (amount_collected >= 0),
  revenue_share_percent_snapshot numeric(5, 2) not null check (revenue_share_percent_snapshot >= 0 and revenue_share_percent_snapshot <= 100),

  partner_share numeric(12, 2) generated always as (round(amount_collected * revenue_share_percent_snapshot / 100, 2)) stored,
  winsalot_share numeric(12, 2) generated always as (amount_collected - round(amount_collected * revenue_share_percent_snapshot / 100, 2)) stored,

  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  payment_date date,

  commission_status text not null default 'not_due' check (commission_status in ('not_due', 'due', 'paid')),
  commission_paid_at date,

  notes text,

  constraint crm_subcontractor_referral_revenue_period_order check (period_end >= period_start),
  constraint crm_subcontractor_referral_revenue_commission_paid_pairing check (
    (commission_status = 'paid' and commission_paid_at is not null)
    or (commission_status <> 'paid' and commission_paid_at is null)
  )
);

create index if not exists crm_subcontractor_referral_revenue_subcontractor_idx
  on public.crm_subcontractor_referral_revenue(subcontractor_id, period_start desc);
create index if not exists crm_subcontractor_referral_revenue_client_idx
  on public.crm_subcontractor_referral_revenue(client_id, period_start desc);

create or replace function public.crm_subcontractor_referral_revenue_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_subcontractor_referral_revenue_set_updated_at on public.crm_subcontractor_referral_revenue;
create trigger crm_subcontractor_referral_revenue_set_updated_at
  before update on public.crm_subcontractor_referral_revenue
  for each row execute function public.crm_subcontractor_referral_revenue_set_updated_at();

alter table public.crm_subcontractor_referral_revenue enable row level security;

create policy "crm_subcontractor_referral_revenue_admin_all"
  on public.crm_subcontractor_referral_revenue for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- 5. crm_subcontractor_lending_referrals: Business Lending Commission
--    Share tracking, one row per funded/referred deal. Mirrors the
--    revenue table's snapshot + generated-share-columns shape. The brief:
--    "Payment should only become payable after Winsalot Corp. actually
--    receives the lender commission" - partner_share/winsalot_share are
--    generated off lender_commission_received (0 until Admin records it)
--    net of clawback_adjustment, and commission_status only reaches
--    'paid_to_partner' once Admin explicitly records that payout.
-- ---------------------------------------------------------------------

create table if not exists public.crm_subcontractor_lending_referrals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,

  subcontractor_id uuid not null references public.crm_subcontractors(id) on delete cascade,
  -- Optional link to the underlying financing opportunity - nullable
  -- since not every referred lending deal necessarily has (or still has)
  -- a crm_opportunities row by the time the commission is recorded.
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  business_name text not null check (length(trim(business_name)) > 0),

  funded_at date,
  commission_share_percent_snapshot numeric(5, 2) not null check (commission_share_percent_snapshot >= 0 and commission_share_percent_snapshot <= 100),

  lender_commission_received numeric(12, 2) not null default 0 check (lender_commission_received >= 0),
  -- Any lender clawback/reversal/cancellation/deduction (brief: "must be
  -- accounted for before the final commission distribution") - reduces
  -- the net amount shared between partner and Winsalot.
  clawback_adjustment numeric(12, 2) not null default 0 check (clawback_adjustment >= 0),
  commission_received_at date,

  partner_share numeric(12, 2) generated always as (round(greatest(lender_commission_received - clawback_adjustment, 0) * commission_share_percent_snapshot / 100, 2)) stored,
  winsalot_share numeric(12, 2) generated always as (greatest(lender_commission_received - clawback_adjustment, 0) - round(greatest(lender_commission_received - clawback_adjustment, 0) * commission_share_percent_snapshot / 100, 2)) stored,

  commission_status text not null default 'pending_funding'
    check (commission_status in ('pending_funding', 'funded_awaiting_commission', 'commission_received', 'paid_to_partner')),
  commission_paid_at date,

  notes text,

  constraint crm_subcontractor_lending_referrals_paid_pairing check (
    (commission_status = 'paid_to_partner' and commission_paid_at is not null)
    or (commission_status <> 'paid_to_partner' and commission_paid_at is null)
  )
);

create index if not exists crm_subcontractor_lending_referrals_subcontractor_idx
  on public.crm_subcontractor_lending_referrals(subcontractor_id, created_at desc);

create or replace function public.crm_subcontractor_lending_referrals_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_subcontractor_lending_referrals_set_updated_at on public.crm_subcontractor_lending_referrals;
create trigger crm_subcontractor_lending_referrals_set_updated_at
  before update on public.crm_subcontractor_lending_referrals
  for each row execute function public.crm_subcontractor_lending_referrals_set_updated_at();

alter table public.crm_subcontractor_lending_referrals enable row level security;

create policy "crm_subcontractor_lending_referrals_admin_all"
  on public.crm_subcontractor_lending_referrals for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');
