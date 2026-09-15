-- Refreshes the written copy for the Growth CRM engagement campaigns
-- (Client Success/"Loyalty", Follow-Up, Re-Engagement) with new wording
-- and closing CTA lines. Content-only: does not touch the Email
-- Marketing module (crm_marketing_templates), campaign automation,
-- scheduling, or the email shell/design in crm-retention-email.ts.
--
-- Client Success ships two full 4-week cycles (sequence 1-8); only
-- sequence 1-4 have refreshed copy from this brief, so sequence 5-8
-- (cycle 2) keep their existing wording to preserve the "never repeats
-- the exact same wording back to back" rotation behavior.
--
-- Follow-Up only has a single automated template slot (sequence 1) -
-- there is no rotation/sequencing logic for Follow-Up sends - so only
-- Follow-Up Email 1's copy is applied here.

update public.crm_retention_templates
set subject = 'We''re here to keep supporting {{business_name}}',
    body = E'Hi {{first_name}},\n\nThank you for continuing to work with Winsalot Corp.\n\nWe want to make sure the support we provide continues to match the goals of {{business_name}}.\n\nIf there is anything you would like us to focus on, adjust, or improve, simply reply and let us know.\n\nOur goal is to continue helping your business create new opportunities and move forward.\n\nTell Us What You Need — just hit reply.',
    updated_at = now()
where campaign_type = 'client_success' and sequence_number = 1;

update public.crm_retention_templates
set subject = 'What should we focus on next for {{business_name}}?',
    body = E'Hi {{first_name}},\n\nBusiness priorities can change, and we want to make sure our work continues to support what matters most to {{business_name}}.\n\nIs your current priority:\nGenerating more qualified opportunities?\nBooking more conversations with potential customers?\nReaching a new market or industry?\nImproving outreach?\nExploring business funding options?\n\nReply and tell us where you would like the most support.\n\nShare Your Priorities — we''re listening.',
    updated_at = now()
where campaign_type = 'client_success' and sequence_number = 2;

update public.crm_retention_templates
set subject = 'Growing with {{business_name}}',
    body = E'Hi {{first_name}},\n\nWe want our relationship with {{business_name}} to continue evolving as your business grows.\n\nIf your goals, target customers, services, or priorities have changed, please send us a quick update.\n\nIt helps us make sure our support remains aligned with where your business is going.\n\nSend Us an Update — a quick reply is all it takes.',
    updated_at = now()
where campaign_type = 'client_success' and sequence_number = 3;

update public.crm_retention_templates
set subject = 'Let''s plan the next step for {{business_name}}',
    body = E'Hi {{first_name}},\n\nWe appreciate the opportunity to continue working with {{business_name}}.\n\nIf you would like to review your current goals, discuss results, change direction, or explore another way Winsalot Corp. can support your business, we''d be happy to connect.\n\nReview Our Next Steps — reply and we''ll set up a time to connect.',
    updated_at = now()
where campaign_type = 'client_success' and sequence_number = 4;

update public.crm_retention_templates
set subject = 'Following up with {{business_name}}',
    body = E'Hi {{first_name}},\n\nI wanted to follow up regarding our recent conversation with {{business_name}}.\n\nIf this is still something you are considering, we''d be happy to answer any questions or discuss the next step.\n\nSimply reply and let us know where things currently stand.\n\nContinue the Conversation — just hit reply.',
    updated_at = now()
where campaign_type = 'follow_up' and sequence_number = 1;

update public.crm_retention_templates
set subject = 'It''s been a while, {{business_name}}',
    body = E'Hi {{first_name}},\n\nIt''s been a little while since we last connected, so we wanted to see how things are going at {{business_name}}.\n\nYour priorities may be different today than when we last spoke.\n\nIf generating new opportunities, booking appointments, reaching potential customers, or exploring business funding has become a priority, we''d be happy to reconnect.\n\nReconnect With Us — just reply to this email.',
    updated_at = now()
where campaign_type = 're_engagement' and sequence_number = 1;

update public.crm_retention_templates
set subject = 'Has anything changed at {{business_name}}?',
    body = E'Hi {{first_name}},\n\nWhen we last connected, the timing may not have been right.\n\nBusiness needs change, so we wanted to check whether {{business_name}} now has new growth goals, new services, new markets, or a renewed need for customer acquisition.\n\nReply anytime and tell us what you''re currently working toward.\n\nTell Us What''s Changed — reply anytime.',
    updated_at = now()
where campaign_type = 're_engagement' and sequence_number = 2;

update public.crm_retention_templates
set subject = 'Should we stay in touch?',
    body = E'Hi {{first_name}},\n\nWe don''t want to send you messages that aren''t useful.\n\nBefore we close the loop, we''d like to know whether you''d still like Winsalot Corp. to stay in touch with {{business_name}}.\n\nIf you''d like to reconnect now, simply reply. If the timing isn''t right, tell us when would be better.\n\nLet Us Know — simply reply.',
    updated_at = now()
where campaign_type = 're_engagement' and sequence_number = 3;
