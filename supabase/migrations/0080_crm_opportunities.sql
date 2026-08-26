-- Winsalot Growth CRM: the new sales-opportunity pipeline that replaces
-- crm_leads' commercial-cleaning-quote workflow. crm_leads is intentionally
-- left untouched (frozen, no longer written to by the app) rather than
-- altered in place, since its stage set and field set are unrelated to the
-- Growth CRM's - see migration 0083 for the one-time data copy of existing
-- leads into this table.
--
-- Every opportunity is one of two services (or both): Lead Generation or
-- Business Financing. Rather than a JSONB "extras" column, this uses a
-- normalized set of nullable, type-specific columns alongside a shared
-- core - the field count is modest (~14 extra columns) and every one of
-- them needs to be independently filterable/sortable per the CRM's filter
-- requirements (industry, city, etc.), which a JSONB blob would make much
-- harder without adding expression indexes for each field anyway.
create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  opportunity_type text not null check (opportunity_type in (
    'lead_generation', 'business_financing', 'both_services'
  )),

  stage text not null default 'New Prospect' check (stage in (
    'New Prospect',
    'Contacted',
    'Interested',
    'Consultation Booked',
    'Proposal or Application Sent',
    'Client Won',
    'Follow-Up Required',
    'Not Interested'
  )),

  -- Shared core fields (both opportunity types).
  business_name text not null,
  contact_name text,
  phone text not null,
  email text,
  city text,
  province_state text,
  assigned_agent_id uuid references public.crm_users(id) on delete set null,
  created_by uuid references public.crm_users(id) on delete set null,
  notes text,
  next_follow_up_at timestamptz,
  last_contacted_at timestamptz,
  closed_reason text,
  closed_at timestamptz,
  closed_by uuid references public.crm_users(id) on delete set null,

  -- Lead Generation fields (populated when opportunity_type is
  -- 'lead_generation' or 'both_services').
  industry text,
  target_customers text,
  current_marketing_method text,
  appointments_wanted integer,
  estimated_monthly_budget numeric(12, 2),
  consultation_date timestamptz,

  -- Business Financing fields (populated when opportunity_type is
  -- 'business_financing' or 'both_services').
  business_structure text check (business_structure in ('corporation', 'sole_proprietorship')),
  time_in_business text,
  average_monthly_revenue numeric(12, 2),
  financing_amount_requested numeric(12, 2),
  bank_statements_available boolean,
  application_status text,

  -- Set once by the stage-change server action the first time an
  -- opportunity enters that stage - not by a trigger - mirroring how
  -- closed_at is already set by application code today. Used by the
  -- performance dashboard's "Proposals sent" / "Applications submitted"
  -- metrics, which need to bucket by *when* the stage was reached, not
  -- just whether it currently is that stage.
  proposal_sent_at timestamptz,
  application_submitted_at timestamptz
);

create index if not exists crm_opportunities_assigned_agent_idx on public.crm_opportunities(assigned_agent_id);
create index if not exists crm_opportunities_stage_idx on public.crm_opportunities(stage);
create index if not exists crm_opportunities_type_idx on public.crm_opportunities(opportunity_type);
create index if not exists crm_opportunities_closed_at_idx on public.crm_opportunities(closed_at);
create index if not exists crm_opportunities_industry_idx on public.crm_opportunities(industry);
create index if not exists crm_opportunities_city_idx on public.crm_opportunities(city);
create index if not exists crm_opportunities_created_at_idx on public.crm_opportunities(created_at);
create index if not exists crm_opportunities_open_follow_up_idx
  on public.crm_opportunities(next_follow_up_at)
  where stage not in ('Client Won', 'Not Interested');

alter table public.crm_opportunities enable row level security;

-- Same RLS pattern as crm_leads (migration 0007, tightened by 0010):
-- admins get full access; agents are scoped to opportunities assigned to
-- them, and can only ever insert an opportunity assigned to themselves.
create policy "crm_opportunities_admin_all"
  on public.crm_opportunities for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_opportunities_agent_select_own"
  on public.crm_opportunities for select
  using (assigned_agent_id = auth.uid());

create policy "crm_opportunities_agent_insert_own"
  on public.crm_opportunities for insert
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and created_by = auth.uid()
    and assigned_agent_id = auth.uid()
  );

create policy "crm_opportunities_agent_update_own"
  on public.crm_opportunities for update
  using (assigned_agent_id = auth.uid())
  with check (assigned_agent_id = auth.uid());
