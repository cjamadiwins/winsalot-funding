-- Lead Generation CRM: Conversion Tracking (post-appointment pipeline).
--
-- Tracks what happens to a Winsalot-generated prospect AFTER an
-- appointment, up through the prospect actually becoming a paying
-- customer of the Winsalot client - the missing link between "appointment
-- booked" (already tracked by leadgen_appointments.status) and a client's
-- performance-based agreement fee actually becoming due
-- (crm_client_agreements.conversion_status/staged_second_conversion_status
-- in the Growth CRM, migrations 20260925170634/20260927230000).
--
-- Purely additive: one new leadgen_conversions row per existing (and every
-- future) leadgen_appointments row, referencing it rather than duplicating
-- any of its data. No existing lead/appointment/client/campaign table is
-- altered. A second table, leadgen_conversion_payment_triggers, is the
-- permanent audit trail of every performance-payment stage an Admin has
-- actually confirmed - kept separate from leadgen_conversions (which stays
-- mutable/editable) so that audit history can never be edited away.
--
-- Two tracks are deliberately kept apart on leadgen_conversions:
--   - conversion_status: the ADMIN-AUTHORITATIVE pipeline stage (the seven
--     stages the brief lists) - this is what agents see, what feeds the
--     funnel/dashboard, and what the payment-trigger logic reads. Never
--     set directly by a client submission.
--   - admin_verification_status + client_reported_*: what a client most
--     recently self-reported and whether Admin has acted on it yet. A
--     client's submission only ever changes these columns (enforced by
--     server-side logic, not just RLS) and always leaves
--     admin_verification_status = 'pending_admin_verification' - it can
--     never itself move conversion_status to converted_paid.

create table if not exists public.leadgen_conversions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Attribution - the original Winsalot lead/appointment this conversion
  -- record tracks. appointment_id is the anchor (one conversion record per
  -- appointment - the unique constraint below is this system's first line
  -- of duplicate-payment protection); lead_id/client_id/campaign_id/
  -- agent_id are denormalized from it purely for fast, simple RLS
  -- policies and list queries, never a second source of truth for who
  -- this appointment belongs to.
  lead_id uuid references public.leadgen_leads(id) on delete set null,
  appointment_id uuid not null unique references public.leadgen_appointments(id) on delete cascade,
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  campaign_id uuid references public.leadgen_campaigns(id) on delete set null,
  agent_id uuid references public.leadgen_users(id) on delete set null,

  -- Admin-authoritative pipeline stage - never advanced automatically past
  -- 'appointment_attended' merely because an appointment happened; only
  -- Admin (or the auto-backfill below, which is equally conservative)
  -- ever sets a 'converted_*'/'not_converted' value.
  conversion_status text not null default 'appointment_booked'
    check (conversion_status in (
      'appointment_booked', 'appointment_attended', 'proposal_sent', 'follow_up_open',
      'converted_payment_pending', 'converted_paid', 'not_converted'
    )),
  conversion_status_set_by uuid references public.leadgen_users(id),
  conversion_status_set_at timestamptz,

  -- The client-report review queue. 'not_submitted' until a client first
  -- reports something; 'pending_admin_verification' the moment they do;
  -- 'confirmed'/'rejected' once Admin acts. A client's own submission can
  -- only ever move this to 'pending_admin_verification' - server-side
  -- logic, not just RLS, enforces that (see reportConversionAction).
  admin_verification_status text not null default 'not_submitted'
    check (admin_verification_status in ('not_submitted', 'pending_admin_verification', 'confirmed', 'rejected')),

  -- Raw client self-report - kept even after Admin acts, as the permanent
  -- record of what the client actually claimed.
  client_reported_result text
    check (client_reported_result in ('paying_customer', 'payment_pending', 'proposal_sent', 'follow_up_ongoing', 'not_converted')),
  client_reported_at timestamptz,
  client_reported_by uuid references public.leadgen_users(id),
  client_reported_conversion_date date,
  client_reported_sale_amount numeric(12, 2),
  client_reported_notes text,
  -- The required "I confirm this prospect was generated/introduced through
  -- Winsalot Corp and has become a paying customer" checkbox - only ever
  -- true when client_reported_result = 'paying_customer'; the report
  -- action refuses to save a paying-customer report without it.
  client_confirmation_checked boolean not null default false,

  -- Admin's own authoritative figures once reviewed - may match or
  -- deliberately differ from the client's reported ones (e.g. Admin
  -- corrects a typo'd sale amount).
  admin_conversion_date date,
  admin_sale_amount numeric(12, 2),
  admin_notes text,
  rejection_reason text,

  -- Duplicate-protection override: set only when Admin explicitly
  -- confirms a second 'converted_paid' for the same lead/business in the
  -- same campaign is a legitimate separate transaction, not a mistake.
  -- See resolvePotentialDuplicateConversion() in lib/leadgen-conversions.ts.
  duplicate_override_by uuid references public.leadgen_users(id),
  duplicate_override_at timestamptz,

  updated_by uuid references public.leadgen_users(id)
);

create index if not exists leadgen_conversions_client_id_idx on public.leadgen_conversions(client_id);
create index if not exists leadgen_conversions_campaign_id_idx on public.leadgen_conversions(campaign_id);
create index if not exists leadgen_conversions_lead_id_idx on public.leadgen_conversions(lead_id);
create index if not exists leadgen_conversions_admin_verification_status_idx on public.leadgen_conversions(admin_verification_status) where admin_verification_status = 'pending_admin_verification';

-- Permanent audit trail of every performance-payment stage Admin has
-- actually confirmed. crm_agreement_id/crm_client_id point into the
-- Growth CRM's own tables (the same Postgres database - crm_clients
-- already references leadgen_clients the same cross-CRM way via its own
-- leadgen_client_id column). The unique constraint on conversion_id is
-- this system's second, stronger line of duplicate-payment protection:
-- a single conversion record can trigger at most one payment stage, ever,
-- enforced by the database itself rather than only application logic.
create table if not exists public.leadgen_conversion_payment_triggers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversion_id uuid not null unique references public.leadgen_conversions(id) on delete cascade,
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  campaign_id uuid references public.leadgen_campaigns(id) on delete set null,
  crm_client_id uuid references public.crm_clients(id),
  crm_agreement_id uuid references public.crm_client_agreements(id),
  conversion_number integer not null,
  payment_stage_label text not null,
  amount_triggered numeric(12, 2) not null,
  currency text not null default 'CAD',
  confirmed_by uuid not null references public.leadgen_users(id),
  confirmed_at timestamptz not null default now()
);

create index if not exists leadgen_conversion_payment_triggers_crm_agreement_id_idx on public.leadgen_conversion_payment_triggers(crm_agreement_id);

-- Auto-create a conversion-tracking row the moment any appointment is
-- booked, from whichever of the several existing booking paths (staff-
-- booked in either dashboard, the public /book/[slug] page, the Calendly
-- webhook) - so no individual booking action needs to be touched to keep
-- this additive. Never overwrites/duplicates an existing row for the same
-- appointment (the unique constraint above backstops this too).
create or replace function public.leadgen_conversions_ensure_for_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_campaign_id uuid;
  lead_agent_id uuid;
begin
  if new.lead_id is not null then
    select campaign_id, assigned_agent_id into lead_campaign_id, lead_agent_id
    from public.leadgen_leads where id = new.lead_id;
  end if;

  insert into public.leadgen_conversions (lead_id, appointment_id, client_id, campaign_id, agent_id)
  values (
    new.lead_id,
    new.id,
    new.client_id,
    coalesce(new.campaign_id, lead_campaign_id),
    coalesce(new.assigned_specialist_id, lead_agent_id)
  )
  on conflict (appointment_id) do nothing;
  return new;
end;
$$;

drop trigger if exists leadgen_conversions_ensure_trigger on public.leadgen_appointments;
create trigger leadgen_conversions_ensure_trigger
  after insert on public.leadgen_appointments
  for each row execute function public.leadgen_conversions_ensure_for_appointment();

-- One-time backfill for every appointment that already existed before
-- this migration - conservative mapping only ('Completed' -> attended,
-- 'No-show'/'Cancelled' -> not converted, everything else -> booked).
-- Never guesses at an actual conversion/sale for historical data.
insert into public.leadgen_conversions (lead_id, appointment_id, client_id, campaign_id, agent_id, conversion_status)
select
  a.lead_id,
  a.id,
  a.client_id,
  coalesce(a.campaign_id, l.campaign_id),
  coalesce(a.assigned_specialist_id, l.assigned_agent_id),
  case
    when a.status = 'Completed' then 'appointment_attended'
    when a.status in ('No-show', 'Cancelled') then 'not_converted'
    else 'appointment_booked'
  end
from public.leadgen_appointments a
left join public.leadgen_leads l on l.id = a.lead_id
where not exists (select 1 from public.leadgen_conversions c where c.appointment_id = a.id);

-- ---------------------------------------------------------------------
-- Row Level Security - same role functions/conventions as every other
-- leadgen_* table (leadgen_user_role/leadgen_user_client_id, migration
-- 0031_leadgen_crm.sql). No explicit Data API GRANTs added: like every
-- other table in this schema, access is controlled entirely by these
-- policies against the schema's existing authenticated/anon grants, not
-- by per-table GRANT statements (none of the ~40 existing leadgen_*/
-- crm_* tables have their own either).
-- ---------------------------------------------------------------------
alter table public.leadgen_conversions enable row level security;

create policy "leadgen_conversions_admin_all"
  on public.leadgen_conversions for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- Agents may only ever SELECT - never confirm/reject a conversion or
-- trigger billing (brief: "Agents should NOT be able to approve
-- client-reported conversions or trigger client billing"). Same
-- "assigned to the lead OR the appointment's specialist" scoping as
-- leadgen_appointments' own agent policy.
create policy "leadgen_conversions_agent_select_own"
  on public.leadgen_conversions for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid()))
      or exists (select 1 from public.leadgen_appointments a where a.id = appointment_id and a.assigned_specialist_id = auth.uid())
    )
  );

-- A client may see and report on their own campaign's conversions only.
-- Update (not insert - every row is created by the trigger above) is
-- scoped the same way; the report action itself (server-side) further
-- restricts which columns a client's submission is ever allowed to
-- change, regardless of what a crafted request body contains.
create policy "leadgen_conversions_client_select_own"
  on public.leadgen_conversions for select
  using (client_id = public.leadgen_user_client_id(auth.uid()));

create policy "leadgen_conversions_client_update_own"
  on public.leadgen_conversions for update
  using (client_id = public.leadgen_user_client_id(auth.uid()))
  with check (client_id = public.leadgen_user_client_id(auth.uid()));

alter table public.leadgen_conversion_payment_triggers enable row level security;

create policy "leadgen_conversion_payment_triggers_admin_all"
  on public.leadgen_conversion_payment_triggers for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- Internal billing audit trail only - no agent or client access at all
-- (brief: "internal billing logic" must never reach a client login;
-- agents likewise never see billing amounts/triggers, only the
-- conversion_status column on leadgen_conversions).
