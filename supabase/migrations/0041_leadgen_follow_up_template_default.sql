-- Ensure a default saved consultation follow-up template exists.
-- This is insert-only: it does not overwrite existing customized
-- template content for key = 'consultation_follow_up'.

insert into public.leadgen_email_templates (key, name, subject, body, description, active)
values (
  'consultation_follow_up',
  'Consultation Follow-Up',
  'Following Up: Your Free 15-Minute AI Business Growth Consultation',
  E'Hi {{first_name}},\n\nJust following up on your FREE 15-minute AI Business Growth Consultation invitation.\n\nPlease use the button below to choose a convenient time:\n\n{{booking_section}}\n\nIf you would like to review our services first, you can also use this link:\n\n{{services_section}}\n\nWe look forward to helping your business grow.\n\nRegards,\n\nWinsalot Corp.',
  'Default follow-up template encouraging businesses to complete consultation booking.',
  true
)
on conflict (key) do nothing;