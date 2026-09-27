-- Version 3 of the performance_based_first_agreement template (version 2
-- added by migration 20260927220000_web6_solutions_performance_agreement_template.sql).
--
-- Inserts a new "Appointment-Setting Process" clause as section 2
-- (immediately after Scope of Services), describing the outbound-calling/
-- scheduling/reminder process, what counts as a "delivered" appointment,
-- the Client's own responsibilities around appointments, and an explicit
-- clarification that (for this performance-based agreement only) merely
-- booking/delivering an appointment does NOT trigger the CA$750 Campaign
-- Fee - only the first qualifying paying-customer conversion does, per
-- the existing Performance-Based Payment section. Every other clause is
-- carried over unchanged from version 2, with its numbered title bumped
-- by one to keep the sections in sequence (2-13 become 3-14).
--
-- Purely additive: inserts a new template row, never touches version 1 or
-- version 2. The Web6 Solutions draft agreement (still status = 'draft',
-- never sent/signed) has its own template_id repointed to this version in
-- a separate, non-migration data statement - exactly like the original
-- assignment of version 2 to that same still-draft row.

insert into public.crm_agreement_templates (version, kind, content)
select
  3,
  'performance_based_first_agreement',
  jsonb_build_array(
    jsonb_build_object(
      'key', 'services',
      'title', '1. Scope of Services',
      'body', 'Winsalot Corp will provide B2B lead generation and appointment-setting services for the Client. Services may include:' || E'\n\n' ||
        '- Prospect research' || E'\n' || '- Outbound calling' || E'\n' || '- Prospect follow-up' || E'\n' || '- Lead qualification' || E'\n' || '- Appointment setting' || E'\n' || '- Related campaign activities' || E'\n\n' ||
        'The campaign is focused primarily on businesses that may require website design or related website services.'
    ),
    jsonb_build_object(
      'key', 'appointment_setting_process',
      'title', '2. Appointment-Setting Process',
      'body', 'Winsalot Corp may use outbound phone calls, follow-up communications, and appointment reminders as part of the lead-generation and appointment-setting campaign.' || E'\n\n' ||
        'The typical process may include:' || E'\n\n' ||
        '- Outbound B2B phone calls to prospective businesses' || E'\n' || '- Qualification of interested prospects' || E'\n' || '- Scheduling appointments or consultations with the Client' || E'\n' || '- Sending available appointment confirmations and reminders by email and/or SMS through Winsalot Corp''s existing CRM systems' || E'\n' || '- Recording relevant appointment and campaign activity in the CRM' || E'\n\n' ||
        'An appointment is considered delivered when Winsalot Corp successfully schedules a qualified prospect for a consultation with the Client and provides the available appointment details to the Client.' || E'\n\n' ||
        'The Client is responsible for:' || E'\n\n' ||
        '- Attending scheduled appointments' || E'\n' || '- Responding to prospects promptly' || E'\n' || '- Rescheduling when necessary' || E'\n' || '- Conducting the consultation' || E'\n' || '- Providing quotations or proposals' || E'\n' || '- Following up with the prospect' || E'\n' || '- Closing the sale' || E'\n\n' ||
        'Winsalot Corp cannot guarantee that every scheduled prospect will attend, respond after booking, purchase a service, or become a paying customer.' || E'\n\n' ||
        'A prospect''s cancellation, rescheduling, no-show, or failure to purchase does not by itself mean that Winsalot Corp failed to perform the appointment-setting service.' || E'\n\n' ||
        'For this specific performance-based agreement, however, the CA$750 Campaign Fee is not triggered merely by booking or delivering an appointment. The payment trigger remains the first qualifying Winsalot-generated prospect who becomes a paying customer of the Client under this Agreement''s Performance-Based Payment terms.'
    ),
    jsonb_build_object(
      'key', 'performance_based_payment',
      'title', '3. Performance-Based Payment',
      'body', 'This is a special performance-based arrangement. The Client is not required to pay the CA$750 Campaign Fee before the campaign begins.' || E'\n\n' ||
        'The CA$750 Campaign Fee becomes earned and payable once the first qualifying Winsalot-generated prospect becomes a paying customer of the Client.' || E'\n\n' ||
        'A qualifying paying customer means a prospect who:' || E'\n\n' ||
        '- Was originally generated or introduced through Winsalot Corp''s campaign' || E'\n' || '- Purchases a service from the Client' || E'\n' || '- Makes an actual payment to the Client' || E'\n\n' ||
        'Once the Client receives the first payment from that customer, the CA$750 Campaign Fee becomes due to Winsalot Corp.'
    ),
    jsonb_build_object(
      'key', 'attribution',
      'title', '4. Attribution',
      'body', 'A prospect generated or introduced by Winsalot Corp remains attributable to Winsalot Corp if the prospect later purchases services from the Client. This applies whether the sale happens through:' || E'\n\n' ||
        '- A scheduled appointment' || E'\n' || '- A follow-up call' || E'\n' || '- Email' || E'\n' || '- A quotation' || E'\n' || '- A proposal' || E'\n' || '- Direct contact between the Client and the prospect' || E'\n' || '- Another reasonable sales channel following Winsalot Corp''s introduction' || E'\n\n' ||
        'The Client may not avoid the payment obligation by moving the transaction outside the Winsalot CRM or completing the sale directly with the prospect after Winsalot Corp made the original introduction.'
    ),
    jsonb_build_object(
      'key', 'client_reporting_requirement',
      'title', '5. Client Reporting Requirement',
      'body', 'The Client agrees to notify Winsalot Corp when a Winsalot-generated prospect:' || E'\n\n' ||
        '- Purchases a service' || E'\n' || '- Pays a deposit' || E'\n' || '- Makes an initial payment' || E'\n' || '- Becomes a paying customer' || E'\n\n' ||
        'Winsalot Corp may reasonably request confirmation that the conversion occurred. Winsalot Corp will not require unnecessary confidential customer financial information in connection with this confirmation.'
    ),
    jsonb_build_object(
      'key', 'pre_existing_clients',
      'title', '6. Pre-Existing Clients',
      'body', 'A genuine pre-existing prospect or customer of the Client will not automatically be considered a Winsalot-generated customer. If the Client can reasonably show that a prospect was already an active prospect or customer before Winsalot Corp''s introduction, that prospect will not trigger the Campaign Fee solely because the prospect appears in the campaign.'
    ),
    jsonb_build_object(
      'key', 'no_guarantee',
      'title', '7. No Guarantee of Sales',
      'body', 'Winsalot Corp will perform lead generation and appointment-setting services in good faith. Winsalot Corp does not guarantee:' || E'\n\n' ||
        '- A specific number of sales' || E'\n' || '- A specific amount of revenue' || E'\n' || '- A particular closing percentage' || E'\n' || '- A specific number of paying customers' || E'\n' || '- That a paying customer will be generated within a specific period'
    ),
    jsonb_build_object(
      'key', 'client_responsibilities',
      'title', '8. Client Responsibilities',
      'body', 'The Client remains responsible for:' || E'\n\n' ||
        '- Conducting consultations' || E'\n' || '- Providing quotations' || E'\n' || '- Setting its own prices' || E'\n' || '- Preparing proposals' || E'\n' || '- Closing prospects' || E'\n' || '- Delivering its services' || E'\n' || '- Following up with prospects' || E'\n' || '- Customer satisfaction' || E'\n' || '- Responding to opportunities in a timely manner' || E'\n\n' ||
        'Winsalot Corp is not responsible for a lost opportunity caused by the Client failing to respond, attend an appointment, provide a quote, follow up, or properly handle the sales opportunity.'
    ),
    jsonb_build_object(
      'key', 'lead_generation_role',
      'title', '9. Lead Generation Role',
      'body', 'Winsalot Corp''s role is lead generation and appointment setting. Winsalot Corp does not control whether the Client successfully closes a prospect after the introduction.'
    ),
    jsonb_build_object(
      'key', 'term',
      'title', '10. Term',
      'body', 'Campaign Start: October 1, 2026' || E'\n' || 'Renewal / End Date: November 6, 2026' || E'\n\n' ||
        'Any future renewal, extension, pricing change, or payment structure change must be mutually agreed upon. The Client''s payment arrangement will not automatically change after November 6, 2026.'
    ),
    jsonb_build_object(
      'key', 'termination',
      'title', '11. Termination',
      'body', 'Either party may stop future campaign activity in accordance with this Agreement. However, termination does not eliminate a valid payment obligation for a qualifying Winsalot-generated prospect introduced before termination. If a prospect generated before termination later becomes a paying customer of the Client, the applicable Performance-Based Payment remains due.'
    ),
    jsonb_build_object(
      'key', 'independent_business_relationship',
      'title', '12. Independent Business Relationship',
      'body', 'Winsalot Corp is an independent service provider. Winsalot Corp is not an employee, partner, joint venture, franchisee, or legal representative of the Client.'
    ),
    jsonb_build_object(
      'key', 'compliance',
      'title', '13. Compliance',
      'body', 'Winsalot Corp will operate the outbound campaign using its applicable B2B calling, Do Not Call, and internal compliance procedures. The Client remains responsible for the legality, accuracy, pricing, fulfillment, and quality of its own products and services.'
    ),
    jsonb_build_object(
      'key', 'signatures',
      'title', '14. Acceptance',
      'body', 'By signing below, the undersigned confirms that they have read, understood, and agree to be bound by the terms of this Performance-Based Lead Generation & Appointment Services Agreement on behalf of the Client. Winsalot Corp''s agreement system records the signer''s name, business name, acceptance date and time, agreement version, and consent information as part of this Agreement''s audit trail.'
    )
  )
where not exists (
  select 1 from public.crm_agreement_templates where kind = 'performance_based_first_agreement' and version = 3
);
