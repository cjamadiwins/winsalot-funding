-- Lead Generation CRM: the consultation invitation and follow-up emails
-- now link to the CRM's own public booking page (added alongside this
-- migration) instead of a client-configured external booking link, and
-- close with the brief's exact wording. Subjects are unchanged. Purely a
-- data update to the two rows already seeded by earlier migrations.
update public.leadgen_email_templates
set
  body = E'Hi {{first_name}},\n\nThank you for your interest in {{client_business_name}}.\n\nWe''d love to learn more about your needs and answer any questions you may have.\n\nPlease book a convenient time for your FREE 15-minute consultation by clicking the button below.\n\n{{booking_section}}\n\nDuring the consultation we will:\n• Discuss your needs.\n• Answer your questions.\n• Explain how we can help.\n• Recommend the best next steps.\n\nThere is absolutely no obligation and no cost.\n\nWe look forward to speaking with you.\n\nBest regards,\n\nWinsalot Corp\non behalf of {{client_business_name}}',
  updated_at = now()
where key = 'consultation_invitation';

update public.leadgen_email_templates
set
  body = E'Hi {{first_name}},\n\nI wanted to follow up on the invitation we sent for a free 15-minute consultation with {{client_business_name}}.\n\nIf now isn''t a good time, no problem - the offer still stands whenever you''re ready. There is no obligation.\n\nPlease book a convenient time by clicking the button below.\n\n{{booking_section}}\n\nIf you have any questions, just reply to this email.\n\nBest regards,\n\nWinsalot Corp\non behalf of {{client_business_name}}',
  updated_at = now()
where key = 'consultation_follow_up';
