-- Growth CRM: adds a new Commercial Arrangement / Special Terms type,
-- "Custom – Split Payment / Performance Milestones" (arrangement_type =
-- 'custom_split_payment'), for a client-specific first-engagement deal
-- structured as an upfront deposit plus two performance milestones (e.g.
-- Teknokraft Canada Inc.: $250 upfront, $250 on the first successful
-- conversion, $250 on the second, then continuing at Winsalot Corp.'s
-- standard $750/month rate) - distinct from the existing generic "Custom
-- Arrangement" bucket and from "Performance-Based Trial" (no upfront,
-- single trigger amount).
--
-- Reuses the existing structure wherever the concept already matches
-- (per the brief's own instruction to do so):
--   * arrangement_upfront_payment -> "Upfront deposit"
--   * arrangement_payment_trigger -> "Conversion definition"
--   * arrangement_standard_fee    -> "Renewal/ongoing monthly rate" once
--     the initial engagement is complete (never replaces this same
--     column's meaning for other arrangement types - see
--     src/lib/commercial-arrangement.ts)
--   * arrangement_service / arrangement_client_services /
--     arrangement_special_terms -> unchanged, already generic
-- Only genuinely new concepts get new columns: the initial engagement's
-- total value, and each of the two milestones' own amount + condition.
--
-- Entirely additive: every new column is nullable, so every existing
-- consultation/opportunity (including every other arrangement_type) is
-- completely unaffected. No existing column, row, policy, or trigger is
-- altered or removed. The two check constraints below are widened (drop +
-- recreate with the new value added) rather than any row rewritten -
-- every value they previously allowed is still allowed.

alter table public.crm_consultation_guides
  add column if not exists arrangement_total_value numeric(12, 2),
  add column if not exists arrangement_milestone_1_amount numeric(12, 2),
  add column if not exists arrangement_milestone_1_condition text,
  add column if not exists arrangement_milestone_2_amount numeric(12, 2),
  add column if not exists arrangement_milestone_2_condition text,
  add column if not exists arrangement_campaign_start_date date;

alter table public.crm_consultation_guides
  drop constraint if exists crm_consultation_guides_arrangement_type_check;
alter table public.crm_consultation_guides
  add constraint crm_consultation_guides_arrangement_type_check
    check (arrangement_type in ('standard_monthly', 'performance_based_trial', 'custom_arrangement', 'custom_split_payment'));

alter table public.crm_consultation_guides
  drop constraint if exists crm_consultation_guides_arrangement_campaign_status_check;
alter table public.crm_consultation_guides
  add constraint crm_consultation_guides_arrangement_campaign_status_check
    check (arrangement_campaign_status in ('pending_agreement', 'pre_launch_onboarding', 'ready_to_start', 'active', 'converted', 'completed', 'cancelled'));

alter table public.crm_opportunities
  add column if not exists arrangement_total_value numeric(12, 2),
  add column if not exists arrangement_milestone_1_amount numeric(12, 2),
  add column if not exists arrangement_milestone_1_condition text,
  add column if not exists arrangement_milestone_2_amount numeric(12, 2),
  add column if not exists arrangement_milestone_2_condition text,
  add column if not exists arrangement_campaign_start_date date;

alter table public.crm_opportunities
  drop constraint if exists crm_opportunities_arrangement_type_check;
alter table public.crm_opportunities
  add constraint crm_opportunities_arrangement_type_check
    check (arrangement_type in ('standard_monthly', 'performance_based_trial', 'custom_arrangement', 'custom_split_payment'));

alter table public.crm_opportunities
  drop constraint if exists crm_opportunities_arrangement_campaign_status_check;
alter table public.crm_opportunities
  add constraint crm_opportunities_arrangement_campaign_status_check
    check (arrangement_campaign_status in ('pending_agreement', 'pre_launch_onboarding', 'ready_to_start', 'active', 'converted', 'completed', 'cancelled'));

comment on column public.crm_opportunities.arrangement_total_value is
  'Custom – Split Payment / Performance Milestones only: the total agreed value of the initial engagement (e.g. $750 = $250 deposit + $250 + $250 milestones).';
comment on column public.crm_opportunities.arrangement_milestone_1_amount is
  'Custom – Split Payment / Performance Milestones only: the first milestone payment amount.';
comment on column public.crm_opportunities.arrangement_milestone_1_condition is
  'Custom – Split Payment / Performance Milestones only: what triggers the first milestone payment (e.g. "Upon the first successful client conversion").';
comment on column public.crm_opportunities.arrangement_milestone_2_amount is
  'Custom – Split Payment / Performance Milestones only: the second milestone payment amount.';
comment on column public.crm_opportunities.arrangement_milestone_2_condition is
  'Custom – Split Payment / Performance Milestones only: what triggers the second milestone payment.';
comment on column public.crm_opportunities.arrangement_campaign_start_date is
  'The agreed date the campaign is set to launch (e.g. Teknokraft Canada Inc.: 2026-10-01, arrangement_campaign_status ''pre_launch_onboarding''). Optional for any non-Standard-Monthly arrangement, not only Custom – Split Payment.';
comment on constraint crm_opportunities_arrangement_campaign_status_check on public.crm_opportunities is
  'Widened to add ''pre_launch_onboarding'' (terms agreed, onboarding/campaign prep underway ahead of a set launch date) between ''pending_agreement'' and ''ready_to_start''.';
