-- Growth CRM Client Onboarding & Pilot: "Manage" (Edit + Delete) action.
--
-- Purely additive on top of 0097/0098 - every column added here is
-- nullable or has a safe default. Two changes to existing behavior, both
-- deliberate:
--
--   * legal_business_name/contact_person/business_email move OFF the
--     signed-immutability guard's blocked-column list - these are
--     contact-book details, not commercial/legal terms, and the admin
--     needs to fix a typo'd name/email/contact on a signed record
--     without creating a whole new agreement version for it.
--   * The new `currency` column goes ON that same guard list (it's a
--     commercial term exactly like monthly_fee, so it stays locked once
--     signed - changing it still requires Convert/Extend, same as price).
--
-- `manual_status` is a new, separate, purely-admin-facing tracking label
-- (Draft/Pilot/Active/Completed/Paused/Cancelled) - it is never read by
-- deriveCrmOnboardingStage()/deriveCrmPilotStage() (src/lib/crm-agreement-types.ts)
-- and never drives which admin actions appear; the existing derived
-- Stage column keeps doing that exactly as before. Not guarded by the
-- signed-immutability trigger, so it stays editable at any stage.

alter table public.crm_client_agreements
  add column if not exists phone text,
  add column if not exists currency text not null default 'CAD' check (currency in ('CAD', 'USD')),
  add column if not exists manual_status text
    check (manual_status in ('Draft', 'Pilot', 'Active', 'Completed', 'Paused', 'Cancelled'))
    default 'Draft';

create or replace function public.crm_client_agreements_guard_signed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'signed' and new.status = 'signed' then
    if new.service_type is distinct from old.service_type
      or new.target_type is distinct from old.target_type
      or new.monthly_target is distinct from old.monthly_target
      or new.monthly_fee is distinct from old.monthly_fee
      or new.setup_fee is distinct from old.setup_fee
      or new.currency is distinct from old.currency
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

-- Pre-existing gap, surfaced while adding the two new activity types
-- below: crm_activities_exactly_one_target (migration 0026) only ever
-- counted lead_id/opportunity_id/provider_lead_id/cleaning_provider_id -
-- client_id was added to this table by migration 0091 but never added to
-- this constraint. Every client-only activity log call this feature (and
-- the pre-existing Clients feature's logClientActivity) makes - any
-- onboarding record NOT created from an opportunity, and every plain
-- client_created/client_archived/etc. activity - has therefore always
-- violated this check and failed to insert. Widened (not narrowed) to
-- also accept client_id, changing "exactly one" to "at least one" so
-- every previously-passing single-target row still passes unchanged,
-- while a client_id-only row (or client_id alongside opportunity_id,
-- which src/app/admin/(dashboard)/crm/agreements/actions.ts's
-- logOnboardingActivity sets together) now succeeds too.
alter table public.crm_activities drop constraint if exists crm_activities_exactly_one_target;
alter table public.crm_activities add constraint crm_activities_exactly_one_target
  check (
    (case when lead_id is not null then 1 else 0 end)
    + (case when opportunity_id is not null then 1 else 0 end)
    + (case when provider_lead_id is not null then 1 else 0 end)
    + (case when cleaning_provider_id is not null then 1 else 0 end)
    + (case when client_id is not null then 1 else 0 end)
    >= 1
  );

-- Grow crm_activities with the two new Manage-action activity types, same
-- additive technique 0082/0091/0097/0098 already used.
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
    'pilot_extended', 'pilot_closed', 'pilot_results_recorded',
    'onboarding_record_updated', 'onboarding_record_deleted'
  ));
