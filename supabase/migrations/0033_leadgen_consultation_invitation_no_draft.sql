-- Lead Generation CRM: updates the "15-Minute Consultation Invitation"
-- template body to the redesigned, no-draft copy (bullet list of what
-- the consultation covers, plus {{client_phone}}/{{client_email}} in the
-- signature block). Subject is unchanged. Purely a data update to the
-- one row already seeded by migration 0032 - no schema change, and the
-- separate 'consultation_follow_up' template/wording is untouched.
update public.leadgen_email_templates
set
  body = E'Hi {{first_name}},\n\nThank you for your interest in {{client_business_name}}.\n\nWe''d love to learn more about your needs and answer any questions you may have.\n\nPlease book a convenient time for your FREE 15-minute consultation by clicking the button below.\n\n{{booking_section}}\n\nDuring the consultation we will:\n• Discuss your needs.\n• Answer your questions.\n• Explain how we can help.\n• Recommend the best next steps.\n\nThere is absolutely no obligation and no cost.\n\nWe look forward to speaking with you.\n\nBest regards,\n\n{{agent_name}}\n{{client_business_name}}\n{{client_phone}}\n{{client_email}}',
  updated_at = now()
where key = 'consultation_invitation';
