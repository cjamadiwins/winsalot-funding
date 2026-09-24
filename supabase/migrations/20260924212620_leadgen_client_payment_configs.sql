-- Client Portal / Campaign & Payment Setup, Phase 2: client-specific
-- payment configuration for a Lead Generation CRM client. Two new tables,
-- purely additive - no existing table, column, row, policy, or trigger is
-- altered or removed.
--
-- leadgen_client_payment_configs: one row per client, the overall
-- arrangement (payment model, total fee, deposit, recurring amount,
-- amount paid, payment status, attribution window). "Amount Outstanding"
-- is deliberately NOT a stored column - it's total_campaign_fee minus
-- amount_paid, computed in the application layer, so it can never drift
-- out of sync with the two numbers it's derived from (same rule this repo
-- already follows for every other derived status - see
-- deriveCrmOnboardingStage() in src/lib/crm-agreement-types.ts).
--
-- leadgen_client_payment_milestones: many rows per config, not a fixed
-- milestone_1_*/milestone_2_* pair of columns - so "Custom" arrangements
-- (brief requirement #8) can have any number of stages, and "Standard
-- Monthly" clients simply have zero milestone rows. auto_trigger_on_nth_won
-- is nullable and inert in this migration (no trigger reads it yet) - it
-- exists now so Phase 3's "Nth Won opportunity marks a milestone Due"
-- automation (requirement #11) has a column to write to without another
-- schema change.
--
-- RLS: admin-write / client-view-own, no agent policy and NO client write
-- policy at all on either table - a client session cannot mark itself
-- paid, confirm a deposit, or touch a milestone's status even in
-- principle (brief requirement #10), and payment/financial data is never
-- exposed to agents at all (matches the Growth CRM's own
-- crm_client_agreements precedent: "Agreement terms, prices, and payment
-- information are never shown to agents").
create table public.leadgen_client_payment_configs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.leadgen_clients(id) on delete cascade,
  payment_model text not null default 'standard_monthly' check (payment_model in ('standard_monthly', 'staged', 'performance_based', 'custom')),
  currency text not null default 'CAD' check (currency in ('CAD', 'USD')),
  total_campaign_fee numeric(10,2),
  deposit_required numeric(10,2),
  deposit_received boolean not null default false,
  deposit_received_at timestamptz,
  deposit_received_by uuid references auth.users(id) on delete set null,
  recurring_monthly_amount numeric(10,2),
  amount_paid numeric(10,2) not null default 0,
  payment_status text not null default 'not_started' check (payment_status in ('not_started', 'in_progress', 'paid_in_full', 'overdue', 'waived')),
  attribution_period_days integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.leadgen_client_payment_milestones (
  id uuid primary key default gen_random_uuid(),
  payment_config_id uuid not null references public.leadgen_client_payment_configs(id) on delete cascade,
  -- Denormalized (also reachable via payment_config_id -> client_id) so
  -- RLS can scope this table directly, same convention as
  -- leadgen_client_activities.client_id.
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  milestone_order integer not null default 0,
  label text not null,
  amount numeric(10,2),
  trigger_description text,
  auto_trigger_on_nth_won integer,
  status text not null default 'pending' check (status in ('pending', 'due', 'received')),
  received_at timestamptz,
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leadgen_client_payment_milestones_config_idx on public.leadgen_client_payment_milestones(payment_config_id);

alter table public.leadgen_client_payment_configs enable row level security;
alter table public.leadgen_client_payment_milestones enable row level security;

create policy "leadgen_client_payment_configs_admin_all" on public.leadgen_client_payment_configs for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_client_payment_configs_client_select_own" on public.leadgen_client_payment_configs for select
  using (client_id = public.leadgen_user_client_id(auth.uid()));

create policy "leadgen_client_payment_milestones_admin_all" on public.leadgen_client_payment_milestones for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_client_payment_milestones_client_select_own" on public.leadgen_client_payment_milestones for select
  using (client_id = public.leadgen_user_client_id(auth.uid()));

comment on table public.leadgen_client_payment_configs is 'Admin-only-editable payment arrangement per Lead Gen CRM client. Client can view via RLS; never write. Never stores internal Winsalot commission/margin data.';
comment on table public.leadgen_client_payment_milestones is 'Admin-only-editable milestone rows for a leadgen_client_payment_configs arrangement (deposit, staged milestones, performance-based trigger, or custom). Client can view via RLS; never write - only Admin can mark a milestone received.';
comment on column public.leadgen_client_payment_configs.amount_paid is 'Admin-set total amount paid so far. "Outstanding" is total_campaign_fee - amount_paid, computed in the app layer, never stored.';
comment on column public.leadgen_client_payment_milestones.auto_trigger_on_nth_won is 'Optional: when set, this milestone becomes Due once the client''s Nth Won opportunity is recorded (Phase 3). Null means the milestone has no automatic trigger (e.g. a deposit) and stays Admin-set only.';
