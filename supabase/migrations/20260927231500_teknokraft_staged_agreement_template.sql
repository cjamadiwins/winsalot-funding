-- Version 4 of the performance_based_first_agreement template (versions
-- 1-3 added by 20260925170634_crm_performance_based_first_campaign.sql,
-- 20260927220000_web6_solutions_performance_agreement_template.sql, and
-- 20260927223000_web6_solutions_agreement_appointment_process.sql).
--
-- Carries the 16-section legal terms for Teknokraft Canada Inc.'s Staged /
-- Split-Payment initial campaign: the same overall Performance-Based First
-- Campaign structure as Web6 Solutions' agreement (Scope of Services,
-- Appointment-Setting Process, Attribution, Client Reporting Obligation,
-- Pre-Existing Clients, No Guarantee of Results, Client Responsibilities,
-- Termination, Independent Business Relationship, Compliance, Acceptance),
-- but with the CA$750 fee split into three individually-confirmable
-- clauses (Initial Deposit, First Conversion Payment, Second Conversion
-- Payment) plus a Qualifying Conversion definition and a Future Campaigns
-- clause, replacing Web6's single Performance-Based Payment clause.
--
-- Deliberately avoids the "fees" and "monthly_target" content keys, same
-- reasoning as the Web6 template versions: renderAgreementTemplate()
-- force-overrides those two keys for every performance_based_first_agreement
-- render, which would silently discard this staged wording. Purely
-- additive: inserts a new template row only, versions 1-3 untouched.

insert into public.crm_agreement_templates (version, kind, content)
select
  4,
  'performance_based_first_agreement',
  jsonb_build_array(
    jsonb_build_object(
      'key', 'services',
      'title', '1. Scope of Services',
      'body', 'Winsalot Corp will provide B2B lead generation and appointment-setting services for the Client. Services may include:' || E'\n\n' ||
        '- Prospect research' || E'\n' || '- Outbound B2B telephone calls' || E'\n' || '- Lead qualification' || E'\n' || '- Prospect follow-up' || E'\n' || '- Appointment scheduling' || E'\n' || '- Appointment confirmations' || E'\n' || '- Email and/or SMS reminders where available' || E'\n' || '- Campaign activity tracking' || E'\n' || '- Related lead-generation activities' || E'\n\n' ||
        'The campaign will primarily target businesses that may require:' || E'\n\n' ||
        '- Website design' || E'\n' || '- Website redesign' || E'\n' || '- Website development' || E'\n' || '- SEO' || E'\n' || '- E-commerce solutions' || E'\n' || '- Related digital services'
    ),
    jsonb_build_object(
      'key', 'appointment_setting_process',
      'title', '2. Appointment-Setting Process',
      'body', 'Winsalot Corp may use outbound phone calls, follow-up communications, and appointment reminders as part of the campaign.' || E'\n\n' ||
        'The typical process may include:' || E'\n\n' ||
        '- Calling prospective businesses' || E'\n' || '- Identifying and speaking with decision-makers where possible' || E'\n' || '- Determining whether the prospect has relevant interest or need' || E'\n' || '- Qualifying interested prospects' || E'\n' || '- Scheduling consultations with the Client' || E'\n' || '- Sending available appointment confirmations and reminders through the Winsalot CRM' || E'\n' || '- Recording appointment and campaign activity' || E'\n\n' ||
        'An appointment is considered delivered when Winsalot Corp successfully schedules a qualified prospect for a consultation with the Client and provides the available appointment information to the Client.' || E'\n\n' ||
        'The Client is responsible for:' || E'\n\n' ||
        '- Attending appointments' || E'\n' || '- Conducting consultations' || E'\n' || '- Responding to prospects' || E'\n' || '- Providing quotations' || E'\n' || '- Preparing proposals' || E'\n' || '- Following up' || E'\n' || '- Negotiating pricing' || E'\n' || '- Closing sales' || E'\n' || '- Delivering its services' || E'\n\n' ||
        'Winsalot Corp does not guarantee that every booked prospect will attend, purchase services, or become a paying customer.' || E'\n\n' ||
        'A cancellation, rescheduling, no-show, or a prospect choosing not to purchase does not by itself mean Winsalot Corp failed to perform the appointment-setting service.'
    ),
    jsonb_build_object(
      'key', 'initial_deposit',
      'title', '3. Initial Deposit',
      'body', 'The Client agrees to pay an initial deposit of CA$250, due no later than October 9, 2026.' || E'\n\n' ||
        'This payment forms part of the total CA$750 initial campaign price. It is not an additional charge.' || E'\n\n' ||
        'After receipt of the deposit, CA$500 remains under the performance-based payment structure.'
    ),
    jsonb_build_object(
      'key', 'first_conversion_payment',
      'title', '4. First Conversion Payment',
      'body', 'When the FIRST qualifying Winsalot-generated prospect becomes a paying customer of the Client, an additional CA$250 becomes earned and payable to Winsalot Corp.'
    ),
    jsonb_build_object(
      'key', 'second_conversion_payment',
      'title', '5. Second Conversion Payment',
      'body', 'When the SECOND qualifying Winsalot-generated prospect becomes a paying customer of the Client, the final CA$250 becomes earned and payable to Winsalot Corp.' || E'\n\n' ||
        'After all three payments have been received, the total paid will be CA$750 and the initial campaign fee is considered fully paid.'
    ),
    jsonb_build_object(
      'key', 'qualifying_conversion',
      'title', '6. Qualifying Conversion',
      'body', 'A qualifying converted customer means a prospect who:' || E'\n\n' ||
        '- Was originally generated or introduced through Winsalot Corp''s campaign' || E'\n' || '- Purchases a service from the Client' || E'\n' || '- Makes an actual payment to the Client' || E'\n\n' ||
        'A prospect does not need to purchase during the initial appointment for the conversion to count. If a Winsalot-generated prospect later purchases after follow-up, quotation, proposal, email, telephone communication, or another sales interaction, the conversion remains attributable to Winsalot Corp.'
    ),
    jsonb_build_object(
      'key', 'attribution',
      'title', '7. Attribution',
      'body', 'A prospect originally generated or introduced by Winsalot Corp remains attributable to Winsalot Corp if that prospect subsequently purchases services from the Client. This applies whether the transaction is completed through:' || E'\n\n' ||
        '- The original appointment' || E'\n' || '- A later appointment' || E'\n' || '- Telephone' || E'\n' || '- Email' || E'\n' || '- Proposal' || E'\n' || '- Quotation' || E'\n' || '- Direct contact' || E'\n' || '- Another reasonable sales channel following Winsalot Corp''s introduction' || E'\n\n' ||
        'The Client may not avoid an applicable performance payment by moving the transaction outside the Winsalot CRM or closing the customer directly after Winsalot Corp made the original introduction.'
    ),
    jsonb_build_object(
      'key', 'client_reporting_obligation',
      'title', '8. Client Reporting Obligation',
      'body', 'The Client agrees to promptly notify Winsalot Corp whenever a Winsalot-generated prospect:' || E'\n\n' ||
        '- Signs an agreement' || E'\n' || '- Purchases a service' || E'\n' || '- Pays a deposit' || E'\n' || '- Makes an initial payment' || E'\n' || '- Otherwise becomes a paying customer' || E'\n\n' ||
        'Winsalot Corp may reasonably request confirmation that a conversion occurred for purposes of determining whether the applicable performance payment has become due. Winsalot Corp will not require unnecessary confidential customer banking or financial information.'
    ),
    jsonb_build_object(
      'key', 'pre_existing_clients',
      'title', '9. Pre-Existing Clients and Prospects',
      'body', 'A legitimate pre-existing customer or active prospect of the Client will not automatically be considered a Winsalot-generated customer. If the Client can reasonably demonstrate that a prospect was already an active customer or prospect before Winsalot Corp''s introduction, that prospect will not trigger a conversion payment solely because the prospect later appears in the campaign.'
    ),
    jsonb_build_object(
      'key', 'no_guarantee',
      'title', '10. No Guarantee of Results',
      'body', 'Winsalot Corp will provide the agreed lead-generation and appointment-setting services in good faith. Winsalot Corp does not guarantee:' || E'\n\n' ||
        '- A specific number of sales' || E'\n' || '- A particular closing rate' || E'\n' || '- A specific amount of revenue' || E'\n' || '- A specific number of paying customers' || E'\n' || '- That every appointment will attend' || E'\n' || '- That every prospect will purchase' || E'\n' || '- That a conversion will occur within a particular timeframe' || E'\n\n' ||
        'The staged payment structure does not constitute a guarantee of sales.'
    ),
    jsonb_build_object(
      'key', 'client_responsibilities',
      'title', '11. Client Responsibilities',
      'body', 'The Client remains responsible for:' || E'\n\n' ||
        '- Attending appointments' || E'\n' || '- Responding promptly to prospects' || E'\n' || '- Conducting sales consultations' || E'\n' || '- Providing accurate pricing' || E'\n' || '- Preparing quotations' || E'\n' || '- Sending proposals' || E'\n' || '- Following up' || E'\n' || '- Closing opportunities' || E'\n' || '- Providing its services' || E'\n' || '- Customer satisfaction' || E'\n\n' ||
        'Winsalot Corp is not responsible for a lost sales opportunity resulting from the Client''s failure to respond, attend, quote, follow up, or otherwise properly manage the opportunity.'
    ),
    jsonb_build_object(
      'key', 'future_campaigns',
      'title', '12. Future Campaigns',
      'body', 'The special CA$250 + CA$250 + CA$250 payment arrangement applies only to this initial campaign.' || E'\n\n' ||
        'After completion of this initial campaign, future campaigns are to operate on Winsalot Corp''s normal upfront payment structure. Unless otherwise mutually agreed in writing, the standard campaign fee will be payable before the start or renewal of the next campaign.' || E'\n\n' ||
        'Any new payment arrangement requires Admin approval.'
    ),
    jsonb_build_object(
      'key', 'termination',
      'title', '13. Termination',
      'body', 'Either party may terminate future campaign activity in accordance with this Agreement. Termination does not eliminate payment obligations that have already become due.' || E'\n\n' ||
        'Termination also does not eliminate an applicable performance payment for a qualifying prospect originally generated by Winsalot Corp before termination if that prospect later becomes a paying customer.'
    ),
    jsonb_build_object(
      'key', 'independent_business_relationship',
      'title', '14. Independent Business Relationship',
      'body', 'Winsalot Corp is an independent service provider. Nothing in this Agreement creates an employment relationship, partnership, joint venture, franchise relationship, or agency relationship between Winsalot Corp and the Client.'
    ),
    jsonb_build_object(
      'key', 'compliance',
      'title', '15. Compliance',
      'body', 'Winsalot Corp will operate outbound campaigns using its applicable B2B calling, Do Not Call, and internal compliance procedures. The Client remains responsible for the legality, accuracy, pricing, fulfillment, and quality of its own services and representations to prospective customers.'
    ),
    jsonb_build_object(
      'key', 'signatures',
      'title', '16. Acceptance',
      'body', 'By signing below, the undersigned confirms that they have read, understood, and agree to be bound by the terms of this Performance-Based Lead Generation & Appointment Services Agreement on behalf of the Client. Winsalot Corp''s agreement system records the signer''s name, business name, acceptance date and time, agreement version, and consent information as part of this Agreement''s audit trail.'
    )
  )
where not exists (
  select 1 from public.crm_agreement_templates where kind = 'performance_based_first_agreement' and version = 4
);
