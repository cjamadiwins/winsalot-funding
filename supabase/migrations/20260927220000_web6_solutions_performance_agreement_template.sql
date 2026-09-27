-- Version 2 of the performance_based_first_agreement template (kind added
-- by migration 20260925170634_crm_performance_based_first_campaign.sql).
--
-- Version 1's content is generic placeholder wording. This version carries
-- the detailed 13-clause legal terms required for the Web6 Solutions
-- Performance-Based Lead Generation & Appointment Services Agreement
-- (Scope of Services, Performance-Based Payment, Attribution, Client
-- Reporting Requirement, Pre-Existing Clients, No Guarantee of Sales,
-- Client Responsibilities, Lead Generation Role, Term, Termination,
-- Independent Business Relationship, Compliance, Acceptance).
--
-- Purely additive: inserts a new template row, never touches version 1.
-- Any future crm_client_agreements row can keep using version 1 (or a
-- later version) - templates are versioned and each agreement snapshots
-- the template_id it was created against, so this never changes the
-- wording of any existing agreement.
--
-- Deliberately does NOT reuse the "fees" or "monthly_target" content keys
-- - renderAgreementTemplate() (src/lib/crm-agreement-types.ts) force-
-- overrides those two keys' bodies at render time for a Performance-Based
-- First Campaign, which would silently discard this template's own more
-- detailed Performance-Based Payment clause. Using the distinct key
-- "performance_based_payment" instead means the exact required wording is
-- what actually reaches the client, the admin preview, and the PDF.

insert into public.crm_agreement_templates (version, kind, content)
select
  2,
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
      'key', 'performance_based_payment',
      'title', '2. Performance-Based Payment',
      'body', 'This is a special performance-based arrangement. The Client is not required to pay the CA$750 Campaign Fee before the campaign begins.' || E'\n\n' ||
        'The CA$750 Campaign Fee becomes earned and payable once the first qualifying Winsalot-generated prospect becomes a paying customer of the Client.' || E'\n\n' ||
        'A qualifying paying customer means a prospect who:' || E'\n\n' ||
        '- Was originally generated or introduced through Winsalot Corp''s campaign' || E'\n' || '- Purchases a service from the Client' || E'\n' || '- Makes an actual payment to the Client' || E'\n\n' ||
        'Once the Client receives the first payment from that customer, the CA$750 Campaign Fee becomes due to Winsalot Corp.'
    ),
    jsonb_build_object(
      'key', 'attribution',
      'title', '3. Attribution',
      'body', 'A prospect generated or introduced by Winsalot Corp remains attributable to Winsalot Corp if the prospect later purchases services from the Client. This applies whether the sale happens through:' || E'\n\n' ||
        '- A scheduled appointment' || E'\n' || '- A follow-up call' || E'\n' || '- Email' || E'\n' || '- A quotation' || E'\n' || '- A proposal' || E'\n' || '- Direct contact between the Client and the prospect' || E'\n' || '- Another reasonable sales channel following Winsalot Corp''s introduction' || E'\n\n' ||
        'The Client may not avoid the payment obligation by moving the transaction outside the Winsalot CRM or completing the sale directly with the prospect after Winsalot Corp made the original introduction.'
    ),
    jsonb_build_object(
      'key', 'client_reporting_requirement',
      'title', '4. Client Reporting Requirement',
      'body', 'The Client agrees to notify Winsalot Corp when a Winsalot-generated prospect:' || E'\n\n' ||
        '- Purchases a service' || E'\n' || '- Pays a deposit' || E'\n' || '- Makes an initial payment' || E'\n' || '- Becomes a paying customer' || E'\n\n' ||
        'Winsalot Corp may reasonably request confirmation that the conversion occurred. Winsalot Corp will not require unnecessary confidential customer financial information in connection with this confirmation.'
    ),
    jsonb_build_object(
      'key', 'pre_existing_clients',
      'title', '5. Pre-Existing Clients',
      'body', 'A genuine pre-existing prospect or customer of the Client will not automatically be considered a Winsalot-generated customer. If the Client can reasonably show that a prospect was already an active prospect or customer before Winsalot Corp''s introduction, that prospect will not trigger the Campaign Fee solely because the prospect appears in the campaign.'
    ),
    jsonb_build_object(
      'key', 'no_guarantee',
      'title', '6. No Guarantee of Sales',
      'body', 'Winsalot Corp will perform lead generation and appointment-setting services in good faith. Winsalot Corp does not guarantee:' || E'\n\n' ||
        '- A specific number of sales' || E'\n' || '- A specific amount of revenue' || E'\n' || '- A particular closing percentage' || E'\n' || '- A specific number of paying customers' || E'\n' || '- That a paying customer will be generated within a specific period'
    ),
    jsonb_build_object(
      'key', 'client_responsibilities',
      'title', '7. Client Responsibilities',
      'body', 'The Client remains responsible for:' || E'\n\n' ||
        '- Conducting consultations' || E'\n' || '- Providing quotations' || E'\n' || '- Setting its own prices' || E'\n' || '- Preparing proposals' || E'\n' || '- Closing prospects' || E'\n' || '- Delivering its services' || E'\n' || '- Following up with prospects' || E'\n' || '- Customer satisfaction' || E'\n' || '- Responding to opportunities in a timely manner' || E'\n\n' ||
        'Winsalot Corp is not responsible for a lost opportunity caused by the Client failing to respond, attend an appointment, provide a quote, follow up, or properly handle the sales opportunity.'
    ),
    jsonb_build_object(
      'key', 'lead_generation_role',
      'title', '8. Lead Generation Role',
      'body', 'Winsalot Corp''s role is lead generation and appointment setting. Winsalot Corp does not control whether the Client successfully closes a prospect after the introduction.'
    ),
    jsonb_build_object(
      'key', 'term',
      'title', '9. Term',
      'body', 'Campaign Start: October 1, 2026' || E'\n' || 'Renewal / End Date: November 6, 2026' || E'\n\n' ||
        'Any future renewal, extension, pricing change, or payment structure change must be mutually agreed upon. The Client''s payment arrangement will not automatically change after November 6, 2026.'
    ),
    jsonb_build_object(
      'key', 'termination',
      'title', '10. Termination',
      'body', 'Either party may stop future campaign activity in accordance with this Agreement. However, termination does not eliminate a valid payment obligation for a qualifying Winsalot-generated prospect introduced before termination. If a prospect generated before termination later becomes a paying customer of the Client, the applicable Performance-Based Payment remains due.'
    ),
    jsonb_build_object(
      'key', 'independent_business_relationship',
      'title', '11. Independent Business Relationship',
      'body', 'Winsalot Corp is an independent service provider. Winsalot Corp is not an employee, partner, joint venture, franchisee, or legal representative of the Client.'
    ),
    jsonb_build_object(
      'key', 'compliance',
      'title', '12. Compliance',
      'body', 'Winsalot Corp will operate the outbound campaign using its applicable B2B calling, Do Not Call, and internal compliance procedures. The Client remains responsible for the legality, accuracy, pricing, fulfillment, and quality of its own products and services.'
    ),
    jsonb_build_object(
      'key', 'signatures',
      'title', '13. Acceptance',
      'body', 'By signing below, the undersigned confirms that they have read, understood, and agree to be bound by the terms of this Performance-Based Lead Generation & Appointment Services Agreement on behalf of the Client. Winsalot Corp''s agreement system records the signer''s name, business name, acceptance date and time, agreement version, and consent information as part of this Agreement''s audit trail.'
    )
  )
where not exists (
  select 1 from public.crm_agreement_templates where kind = 'performance_based_first_agreement' and version = 2
);
