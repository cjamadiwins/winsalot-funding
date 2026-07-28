-- Lead Generation CRM: adds the second "Learn more about services" link
-- to the consultation invitation/follow-up templates via a new
-- {{services_section}} placeholder (empty when a client has no
-- services_info_link set - see leadgenServicesInviteSection in
-- lib/leadgen-types.ts). {{booking_section}} is unchanged structurally -
-- it now renders the client's configured (Calendly) booking_link again
-- instead of the removed internal booking page, restoring the original
-- "please reply to this email" fallback for a client with no link set.
update public.leadgen_email_templates
set
  body = E'Hi {{first_name}},\n\nThank you for your interest in {{client_business_name}}.\n\nWe''d love to learn more about your needs and answer any questions you may have.\n\nPlease book a convenient time for your FREE 15-minute consultation by clicking the button below.\n\n{{booking_section}}\n\nDuring the consultation we will:\n• Discuss your needs.\n• Answer your questions.\n• Explain how we can help.\n• Recommend the best next steps.\n\nThere is absolutely no obligation and no cost.\n\n{{services_section}}\n\nWe look forward to speaking with you.\n\nBest regards,\n\nWinsalot Corp\non behalf of {{client_business_name}}',
  updated_at = now()
where key = 'consultation_invitation';

update public.leadgen_email_templates
set
  body = E'Hi {{first_name}},\n\nI wanted to follow up on the invitation we sent for a free 15-minute consultation with {{client_business_name}}.\n\nIf now isn''t a good time, no problem - the offer still stands whenever you''re ready. There is no obligation.\n\nPlease book a convenient time by clicking the button below.\n\n{{booking_section}}\n\n{{services_section}}\n\nIf you have any questions, just reply to this email.\n\nBest regards,\n\nWinsalot Corp\non behalf of {{client_business_name}}',
  updated_at = now()
where key = 'consultation_follow_up';
