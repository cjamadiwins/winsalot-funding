-- Version 5 of the performance_based_first_agreement template (versions
-- 1-4 added by 20260925170634_crm_performance_based_first_campaign.sql,
-- 20260927220000_web6_solutions_performance_agreement_template.sql,
-- 20260927223000_web6_solutions_agreement_appointment_process.sql, and
-- 20260927231500_teknokraft_staged_agreement_template.sql).
--
-- Carries the 16-section legal terms for Hidebrandt Web Services' Staged /
-- Split-Payment initial campaign - the same overall structure as
-- Teknokraft Canada Inc.'s version 4 (Initial Deposit / First Conversion
-- Payment / Second Conversion Payment / Qualifying Conversion / Future
-- Campaigns replacing a single Performance-Based Payment clause), but with
-- its own service description (website design/development/maintenance/
-- hosting/e-commerce, not SEO) and a materially different Client
-- Conversion Reporting clause (section 8): it directs the Client to the
-- Client Portal's conversion-reporting functionality where available, and
-- is explicit that a Client-submitted conversion stays "Pending Admin
-- Verification" and is never itself treated as payment received.
--
-- Deliberately avoids the "fees" and "monthly_target" content keys, same
-- reasoning as every other performance_based_first_agreement version:
-- renderAgreementTemplate() force-overrides those two keys at render time,
-- which would silently discard this template's own staged wording. Purely
-- additive: inserts a new template row only, versions 1-4 untouched.

insert into public.crm_agreement_templates (version, kind, content)
select
  5,
  'performance_based_first_agreement',
  jsonb_build_array(
    jsonb_build_object(
      'key', 'services',
      'title', '1. Scope of Services',
      'body', 'Winsalot Corp will provide B2B lead-generation and appointment-setting services for the Client. Campaign activities may include:' || E'\n\n' ||
        '- Prospect research' || E'\n' || '- Outbound B2B telephone calls' || E'\n' || '- Decision-maker outreach' || E'\n' || '- Lead qualification' || E'\n' || '- Prospect follow-up' || E'\n' || '- Appointment scheduling' || E'\n' || '- Appointment confirmations' || E'\n' || '- Email and/or SMS appointment reminders where available' || E'\n' || '- Campaign activity tracking' || E'\n' || '- Related lead-generation activities' || E'\n\n' ||
        'The campaign may promote the Client''s services including:' || E'\n\n' ||
        '- Website design' || E'\n' || '- Website development' || E'\n' || '- Website redesign' || E'\n' || '- Website maintenance' || E'\n' || '- Website hosting' || E'\n' || '- E-commerce services'
    ),
    jsonb_build_object(
      'key', 'appointment_setting_process',
      'title', '2. Appointment-Setting Process',
      'body', 'Winsalot Corp may contact prospective businesses by outbound telephone calls and approved follow-up communications.' || E'\n\n' ||
        'The normal appointment-setting process may include:' || E'\n\n' ||
        '- Contacting businesses' || E'\n' || '- Attempting to reach decision-makers' || E'\n' || '- Identifying a website-related need or interest' || E'\n' || '- Qualifying interested prospects' || E'\n' || '- Scheduling a consultation' || E'\n' || '- Sending available appointment confirmation' || E'\n' || '- Sending available email and/or SMS reminders' || E'\n' || '- Recording campaign and appointment activity inside the CRM' || E'\n\n' ||
        'An appointment is considered delivered when Winsalot Corp successfully schedules a qualified prospect for a consultation with the Client and provides the available appointment details.' || E'\n\n' ||
        'The Client is responsible for:' || E'\n\n' ||
        '- Attending appointments' || E'\n' || '- Conducting consultations' || E'\n' || '- Responding promptly to prospects' || E'\n' || '- Providing quotations' || E'\n' || '- Preparing proposals' || E'\n' || '- Following up' || E'\n' || '- Negotiating pricing' || E'\n' || '- Closing the sale' || E'\n' || '- Delivering its services' || E'\n' || '- Customer satisfaction' || E'\n\n' ||
        'Winsalot Corp does not guarantee that every scheduled prospect will attend or purchase services.' || E'\n\n' ||
        'A prospect cancelling, rescheduling, failing to attend, or deciding not to purchase does not by itself mean Winsalot failed to provide appointment-setting services.'
    ),
    jsonb_build_object(
      'key', 'initial_deposit',
      'title', '3. Initial Deposit',
      'body', 'The Client agrees to pay CA$250 as the initial campaign deposit. This CA$250 forms part of the total CA$750 campaign value. It is not an additional charge.' || E'\n\n' ||
        'After payment of the initial deposit, CA$500 remains subject to the performance-based conversion milestones.'
    ),
    jsonb_build_object(
      'key', 'first_conversion_payment',
      'title', '4. First Conversion Payment',
      'body', 'When the FIRST qualifying Winsalot-generated prospect becomes a paying customer of the Client, CA$250 becomes earned and payable to Winsalot Corp.'
    ),
    jsonb_build_object(
      'key', 'second_conversion_payment',
      'title', '5. Second Conversion Payment',
      'body', 'When the SECOND qualifying Winsalot-generated prospect becomes a paying customer of the Client, CA$250 becomes earned and payable to Winsalot Corp.' || E'\n\n' ||
        'After the deposit and both conversion payments have been received, Total Paid will be CA$750 and the Initial Campaign Balance will be CA$0.'
    ),
    jsonb_build_object(
      'key', 'qualifying_conversion',
      'title', '6. Qualifying Conversion',
      'body', 'A qualifying conversion means a prospect who:' || E'\n\n' ||
        '- Was originally sourced, generated, or introduced through Winsalot Corp''s campaign' || E'\n' || '- Purchases a service from the Client' || E'\n' || '- Makes an actual payment to the Client' || E'\n\n' ||
        'A prospect does not need to purchase during the initial consultation. If a Winsalot-generated prospect later purchases after follow-up, telephone communication, email, quotation, proposal, additional consultation, or direct communication, the customer remains attributable to Winsalot Corp.'
    ),
    jsonb_build_object(
      'key', 'attribution',
      'title', '7. Attribution',
      'body', 'Prospects originally generated or introduced by Winsalot Corp remain attributable to Winsalot Corp for purposes of the agreed performance milestones.' || E'\n\n' ||
        'The Client may not avoid an applicable performance payment by moving the sale outside the Winsalot CRM or closing the prospect directly after Winsalot Corp made the original introduction.'
    ),
    jsonb_build_object(
      'key', 'client_reporting_obligation',
      'title', '8. Client Conversion Reporting',
      'body', 'The Client agrees to report when a Winsalot-generated prospect:' || E'\n\n' ||
        '- Signs an agreement' || E'\n' || '- Accepts a proposal' || E'\n' || '- Pays a deposit' || E'\n' || '- Makes an initial payment' || E'\n' || '- Purchases a service' || E'\n' || '- Otherwise becomes a paying customer' || E'\n\n' ||
        'Where available, the Client may use the Client Portal''s conversion reporting functionality to submit this notice. A conversion submitted by the Client remains Pending Admin Verification until Winsalot Corp Admin verifies it. A submitted conversion is not automatically treated as payment received by Winsalot Corp - Admin confirmation is required before any performance payment is recorded as due or paid.'
    ),
    jsonb_build_object(
      'key', 'pre_existing_clients',
      'title', '9. Pre-Existing Clients',
      'body', 'Legitimate pre-existing customers or active prospects of the Client will not be counted as Winsalot-generated conversions solely because they appear in campaign activity. If the Client can reasonably demonstrate that a business was already an active prospect or customer before Winsalot Corp''s introduction, it will not trigger a performance milestone solely from Winsalot contact.'
    ),
    jsonb_build_object(
      'key', 'no_guarantee',
      'title', '10. No Guarantee of Results',
      'body', 'Winsalot Corp will perform lead-generation and appointment-setting services in good faith. Winsalot Corp does not guarantee:' || E'\n\n' ||
        '- A specific number of paying customers' || E'\n' || '- A specific amount of revenue' || E'\n' || '- A particular closing percentage' || E'\n' || '- That every appointment will attend' || E'\n' || '- That every prospect will buy' || E'\n' || '- That a conversion will occur within a specific period' || E'\n\n' ||
        'The performance-based pricing structure does not constitute a sales guarantee.'
    ),
    jsonb_build_object(
      'key', 'client_responsibilities',
      'title', '11. Client Responsibilities',
      'body', 'The Client is responsible for:' || E'\n\n' ||
        '- Attending appointments' || E'\n' || '- Conducting consultations' || E'\n' || '- Providing accurate pricing' || E'\n' || '- Preparing quotes' || E'\n' || '- Preparing proposals' || E'\n' || '- Following up with prospects' || E'\n' || '- Closing sales' || E'\n' || '- Delivering services' || E'\n' || '- Customer satisfaction' || E'\n\n' ||
        'Winsalot Corp is not responsible for lost opportunities caused by the Client''s failure to respond, attend, quote, follow up, communicate, or otherwise appropriately handle a prospect.'
    ),
    jsonb_build_object(
      'key', 'future_campaigns',
      'title', '12. Future Campaigns',
      'body', 'The special staged payment arrangement applies only to the initial campaign. After the initial campaign is completed, future campaigns will normally be charged CA$750 upfront, unless another arrangement is mutually agreed in writing and approved by Winsalot Corp Admin.' || E'\n\n' ||
        'This staged arrangement does not automatically extend into future campaigns.'
    ),
    jsonb_build_object(
      'key', 'termination',
      'title', '13. Termination',
      'body', 'Either party may terminate future campaign activity in accordance with this Agreement. Termination does not eliminate payment obligations already earned.' || E'\n\n' ||
        'If a qualifying prospect generated by Winsalot Corp before termination later becomes a paying customer, any applicable agreed performance milestone remains payable.'
    ),
    jsonb_build_object(
      'key', 'independent_business_relationship',
      'title', '14. Independent Business Relationship',
      'body', 'Winsalot Corp acts as an independent service provider. Nothing in this Agreement creates an employment relationship, partnership, joint venture, franchise, or agency relationship between Winsalot Corp and the Client.'
    ),
    jsonb_build_object(
      'key', 'compliance',
      'title', '15. Compliance',
      'body', 'Winsalot Corp will conduct outbound activities using its applicable B2B calling, Do Not Call, phone reputation, and internal compliance procedures. The Client remains responsible for the legality, accuracy, pricing, fulfillment, representations, and quality of its own services.'
    ),
    jsonb_build_object(
      'key', 'signatures',
      'title', '16. Acceptance',
      'body', 'By signing below, the undersigned confirms that they have read, understood, and agree to be bound by the terms of this Performance-Based Lead Generation & Appointment Services Agreement on behalf of the Client. Winsalot Corp''s agreement system records the signer''s name, business name, acceptance date and time, agreement version, and consent information as part of this Agreement''s audit trail.'
    )
  )
where not exists (
  select 1 from public.crm_agreement_templates where kind = 'performance_based_first_agreement' and version = 5
);
