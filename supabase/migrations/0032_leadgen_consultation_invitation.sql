-- Lead Generation CRM: adds the "Send 15-Minute Consultation Invitation"
-- workflow (a second, distinct prospect email from the original "Send
-- Consultation Email" button) plus its manual follow-up email. Purely
-- additive: widens leadgen_lead_activities.activity_type to log these two
-- new send types distinctly, and seeds two new leadgen_email_templates
-- rows. Nothing existing is altered - the original 'consultation_email_sent'
-- activity type and 'consultation_information' template are untouched, so
-- the original "Send Consultation Email" button keeps working exactly as
-- before. No cleaning-CRM table is touched.

alter table public.leadgen_lead_activities
  drop constraint leadgen_lead_activities_activity_type_check;

alter table public.leadgen_lead_activities
  add constraint leadgen_lead_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'note', 'status_change', 'lead_assigned', 'lead_reassigned',
    'follow_up_scheduled', 'follow_up_completed', 'appointment_booked',
    'appointment_updated', 'consultation_email_sent',
    'consultation_invitation_sent', 'consultation_follow_up_sent'
  ));

-- {{booking_section}} expands (via leadgenBookingInviteSection() in
-- lib/leadgen-types.ts) to the "[BOOK YOUR 15-MINUTE CONSULTATION]" line
-- plus the client's actual booking link when one is configured, or to a
-- "please reply to this email" fallback sentence when it isn't - same
-- never-show-a-broken-link rule as the original consultation template's
-- {{booking_paragraph}}.
insert into public.leadgen_email_templates (key, name, subject, body, description)
values (
  'consultation_invitation',
  '15-Minute Consultation Invitation',
  'Book Your Free 15-Minute Consultation',
  E'Hi {{first_name}},\n\nThank you for your interest in {{client_business_name}}.\n\nWe would be happy to learn more about your needs and discuss how we may be able to help.\n\nPlease use the link below to book a convenient time for a free 15-minute consultation:\n\n{{booking_section}}\n\nThere is no obligation.\n\nBest regards,\n\n{{agent_name}}\n{{client_business_name}}',
  'One-click invitation asking a prospect to book a free 15-minute consultation.'
),
(
  'consultation_follow_up',
  '15-Minute Consultation Follow-Up',
  'Following Up: Your Free 15-Minute Consultation',
  E'Hi {{first_name}},\n\nI wanted to follow up on the invitation we sent for a free 15-minute consultation with {{client_business_name}}.\n\nIf now isn''t a good time, no problem - the offer still stands whenever you''re ready. There is no obligation.\n\nPlease use the link below to book a convenient time:\n\n{{booking_section}}\n\nIf you have any questions, just reply to this email.\n\nBest regards,\n\n{{agent_name}}\n{{client_business_name}}',
  'Manual follow-up if a prospect has not yet booked after the initial consultation invitation.'
)
on conflict (key) do nothing;
