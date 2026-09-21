-- Growth CRM: Commercial Arrangement / Special Terms support - new
-- Client Consultation Guide section 9 ("Commercial Arrangement / Special
-- Terms", between Consultation Summary and Close the Consultation), plus
-- a matching "Commercial Arrangement" section on the linked business/
-- prospect record (crm_opportunities), for arrangements other than the
-- default Standard Monthly (e.g. a Performance-Based Trial: $0 upfront,
-- the service fee due only once a Winsalot-generated prospect converts).
--
-- Entirely additive: no existing table, column, row, policy, or trigger
-- is altered. Every new column is nullable or defaults to the value that
-- already describes every existing consultation/opportunity today
-- (Standard Monthly, $750 fee, $0 upfront), so nothing existing changes
-- behavior. See src/lib/commercial-arrangement.ts for the shared
-- types/labels both tables use.
--
-- Both tables get the same field set under the same names, since
-- completing a consultation copies these straight across to its linked
-- opportunity rather than making Admin re-type them (see
-- completeConsultationGuideAction). Conversion tracking
-- (arrangement_conversion_date/arrangement_converted_business/
-- arrangement_marked_converted_by/_at) only makes sense on the business
-- record itself, set later by the admin-only "Mark as Converted" action -
-- a consultation guide describes the arrangement agreed *during* the
-- call, never a conversion that hasn't happened yet - so those four are
-- crm_opportunities-only.

alter table public.crm_consultation_guides
  add column if not exists arrangement_type text not null default 'standard_monthly'
    check (arrangement_type in ('standard_monthly', 'performance_based_trial', 'custom_arrangement')),
  add column if not exists arrangement_standard_fee numeric(12, 2) not null default 750,
  add column if not exists arrangement_upfront_payment numeric(12, 2) not null default 0,
  add column if not exists arrangement_payment_trigger text,
  add column if not exists arrangement_attribution_period text,
  add column if not exists arrangement_service text,
  add column if not exists arrangement_client_services text,
  add column if not exists arrangement_campaign_status text
    check (arrangement_campaign_status in ('pending_agreement', 'ready_to_start', 'active', 'converted', 'completed', 'cancelled')),
  add column if not exists arrangement_conversion_status text
    check (arrangement_conversion_status in ('not_converted', 'converted')),
  add column if not exists arrangement_fee_status text
    check (arrangement_fee_status in ('not_due', 'due', 'paid')),
  add column if not exists arrangement_special_terms text;

alter table public.crm_opportunities
  add column if not exists arrangement_type text not null default 'standard_monthly'
    check (arrangement_type in ('standard_monthly', 'performance_based_trial', 'custom_arrangement')),
  add column if not exists arrangement_standard_fee numeric(12, 2) not null default 750,
  add column if not exists arrangement_upfront_payment numeric(12, 2) not null default 0,
  add column if not exists arrangement_payment_trigger text,
  add column if not exists arrangement_attribution_period text,
  add column if not exists arrangement_service text,
  add column if not exists arrangement_client_services text,
  add column if not exists arrangement_campaign_status text
    check (arrangement_campaign_status in ('pending_agreement', 'ready_to_start', 'active', 'converted', 'completed', 'cancelled')),
  add column if not exists arrangement_conversion_status text
    check (arrangement_conversion_status in ('not_converted', 'converted')),
  add column if not exists arrangement_fee_status text
    check (arrangement_fee_status in ('not_due', 'due', 'paid')),
  add column if not exists arrangement_special_terms text,
  add column if not exists arrangement_conversion_date date,
  add column if not exists arrangement_converted_business text,
  add column if not exists arrangement_marked_converted_by uuid references public.crm_users(id) on delete set null,
  add column if not exists arrangement_marked_converted_at timestamptz;

create index if not exists crm_opportunities_arrangement_type_idx on public.crm_opportunities(arrangement_type);

comment on column public.crm_opportunities.arrangement_type is
  'Commercial arrangement for this client/campaign - Standard Monthly, Performance-Based Trial, or Custom Arrangement. The arrangement_* financial/agreement fields are Admin-only to edit (see updateCommercialArrangementAction/markOpportunityConvertedAction); agents may view them via the normal opportunity RLS select policies, unchanged by this migration.';
comment on column public.crm_opportunities.arrangement_fee_status is
  'Set to ''due'' only by the explicit admin-only "Mark as Converted" action, and only ever moves to ''paid'' by a separate manual Admin action - never automatic.';
