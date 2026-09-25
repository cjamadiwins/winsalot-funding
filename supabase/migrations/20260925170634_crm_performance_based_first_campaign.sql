-- Winsalot Growth CRM: Performance-Based First Campaign Agreement - a
-- third campaign_type option alongside Standard Monthly Campaign
-- (migration 0097) and Free Pilot Program (migration 0098), explicitly
-- neither of those two: it is a real, signed, ongoing client agreement
-- (not a trial/pilot), but its $750 CAD Campaign Fee is not paid upfront -
-- it only becomes payable once the Client notifies Winsalot Corp that a
-- Winsalot-generated prospect has become a paying customer.
--
-- Purely additive on top of 0097/0098/0099/0144 - every column/value
-- added here is nullable/defaulted, so every existing Standard Monthly
-- or Free Pilot agreement keeps working completely unchanged.
--
-- Design mirrors the Free Pilot Program's own lineage: its own template
-- `kind` (own required disclosure language, no generic Fees/Payment Due
-- Terms/Cancellation Terms section), and it reuses the Paid Pilot's own
-- `payment_status`/`payment_due_date`/`invoice_id` columns (migration
-- 0144) for tracking the Campaign Fee once it becomes due, rather than
-- duplicating a second payment-tracking mechanism. The only genuinely new
-- columns are `conversion_status`/`converted_at` - whether (and when) the
-- Client has notified Winsalot Corp that a Winsalot-generated prospect
-- converted into a paying customer, which is what makes the Campaign Fee
-- due. Deliberately NOT added to the signed-immutability guard trigger
-- (crm_client_agreements_guard_signed) - like pilot_status/payment_status/
-- payment_due_date/invoice_id, this is expected to keep changing after the
-- agreement is signed, since the conversion itself only happens after
-- signing.

alter table public.crm_client_agreements
  drop constraint if exists crm_client_agreements_campaign_type_check;
alter table public.crm_client_agreements
  add constraint crm_client_agreements_campaign_type_check
    check (campaign_type in ('standard_monthly', 'free_pilot', 'performance_based_first'));

alter table public.crm_agreement_templates
  drop constraint if exists crm_agreement_templates_kind_check;
alter table public.crm_agreement_templates
  add constraint crm_agreement_templates_kind_check
    check (kind in ('client_service_agreement', 'pilot_program_agreement', 'performance_based_first_agreement'));

alter table public.crm_client_agreements
  add column if not exists conversion_status text not null default 'not_converted'
    check (conversion_status in ('not_converted', 'converted')),
  add column if not exists converted_at timestamptz;

-- Seed the Performance-Based First Campaign template, version 1. The
-- "fees" section body is always fully replaced at render time by
-- buildPerformanceBasedFirstFeesStatement() (src/lib/crm-agreement-types.ts,
-- same technique as the pilot template's own "fees"/"services" sections),
-- so its stored body here is just a human-readable placeholder for the
-- admin preview/legal-review screen - it never reaches a client verbatim.
insert into public.crm_agreement_templates (version, kind, content)
values (
  1,
  'performance_based_first_agreement',
  '[
    {"key": "definition", "title": "Definition of a Qualified {{service_noun_singular}}", "body": "A \"qualified {{service_noun_singular}}\" means a prospective customer or business contact that meets the targeting criteria agreed between Winsalot Corp and the Client, and that Winsalot Corp has delivered to the Client under this Agreement."},
    {"key": "services", "title": "Services", "body": "Winsalot Corp will provide B2B Lead Generation and Appointment Setting services to the Client, consisting of prospecting, outreach, and qualification activities directed at the Client''s target market, for the purpose of generating {{service_noun_plural}} on the Client''s behalf."},
    {"key": "fees", "title": "Campaign Fee", "body": "Campaign Fee: $750. Upfront Payment: $0. Replaced dynamically at render time - see buildPerformanceBasedFirstFeesStatement()."},
    {"key": "conversion_notice", "title": "Notice of Conversion", "body": "The Client agrees to notify Winsalot Corp when a Winsalot-generated prospect becomes a paying customer of the Client. The Campaign Fee described above becomes due immediately upon that notice."},
    {"key": "future_campaigns", "title": "Future Campaigns", "body": "This performance-based, no-upfront-payment arrangement applies to this first campaign only. After the first successful conversion and payment of the Campaign Fee, any future campaigns between Winsalot Corp and the Client will operate under Winsalot Corp''s standard payment structure, with the applicable monthly campaign fee paid upfront before the campaign begins."},
    {"key": "no_guarantee", "title": "No Guarantee of Sales", "body": "Winsalot Corp provides B2B lead generation and appointment-setting services. Individual appointments are not guaranteed to result in a sale. Results may vary based on market conditions, prospect availability, targeting criteria and the Client''s responsiveness."},
    {"key": "client_responsibilities", "title": "Client Responsibilities", "body": "The Client agrees to respond to delivered leads/appointments in a timely manner, provide accurate information about its products, services, and target market, and promptly notify Winsalot Corp of any change in availability, pricing, or offerings that would affect campaign accuracy."},
    {"key": "confidentiality", "title": "Confidentiality", "body": "Each party agrees to keep confidential any non-public business, technical, or customer information disclosed by the other party in connection with this Agreement, and to use it only to perform its obligations under this Agreement."},
    {"key": "data_ownership", "title": "Data Ownership", "body": "All lead and appointment data generated for the Client under this Agreement belongs to the Client. Winsalot Corp may retain records of the campaign it has run solely for its own internal record-keeping and performance-reporting purposes."},
    {"key": "signatures", "title": "Signatures", "body": "By signing below, each party agrees to be bound by the terms of this Performance-Based First Campaign Agreement."}
  ]'::jsonb
);

-- Grow crm_activities with the conversion-recorded activity type, same
-- additive technique every prior migration in this lineage already used -
-- the full existing list is repeated verbatim, only the new value appended.
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
    'onboarding_record_updated', 'onboarding_record_deleted',
    'email_resubscribed',
    'consultation_completed', 'consultation_no_show',
    'continue_request_submitted',
    'performance_conversion_recorded'
  ));
