-- Rewrites the three Lead Generation CRM "initial outreach" email
-- templates (Brent's Essentials' consultation_invitation and
-- consultation_follow_up, and Mantra Collab's mantra_collab_intro) to
-- read as a short, personal, one-to-one message rather than a marketing
-- email - part of a broader deliverability pass (see the accompanying
-- code changes to lib/leadgen-email.ts, which now renders every booking
-- link as plain text instead of a colored button graphic).
--
-- Subject/key are otherwise unchanged for consultation_invitation and
-- mantra_collab_intro; the subject IS changed here to a natural,
-- personalized "Quick question about {{business_name}}" per the brief,
-- where {{business_name}} is the *lead's own* business name (a new
-- template variable - see LeadDetailClient.tsx's invitationVars/
-- mantraVars, which now supply it alongside the existing
-- {{client_business_name}}).
--
-- {{services_section}}/{{visit_section}} are dropped from these three
-- bodies entirely: the brief requires initial outreach to carry exactly
-- one link (the booking link), and the code that used to render a
-- second "learn more about our services" / "visit our website" link
-- next to it no longer does. consultation_follow_up's signature is also
-- fixed from the unused {{agent_name}} placeholder (LeadDetailClient.tsx
-- never actually supplied that variable, so it silently rendered as a
-- blank line) to the same fixed "Winsalot Corp / on behalf of
-- {{client_business_name}}" signature consultation_invitation already
-- uses - a real bug fix, not a new template.
update public.leadgen_email_templates
set subject = 'Quick question about {{business_name}}',
    body = E'Hi {{first_name}},\n\n' ||
           'Quick question about {{business_name}} - are you currently looking for ways to bring in more customers?\n\n' ||
           '{{client_business_name}} helps businesses like yours generate more leads using AI and automated workflows.\n\n' ||
           '{{booking_section}}\n\n' ||
           'Best regards,\n\n' ||
           'Winsalot Corp\n' ||
           'on behalf of {{client_business_name}}',
    updated_at = now()
where key = 'consultation_invitation';

update public.leadgen_email_templates
set subject = 'Following up: {{business_name}}',
    body = E'Hi {{first_name}},\n\n' ||
           'I wanted to follow up on the note we sent about a free 15-minute consultation with {{client_business_name}}.\n\n' ||
           'If now isn''t a good time, no problem - the offer still stands whenever you''re ready. There is no obligation.\n\n' ||
           '{{booking_section}}\n\n' ||
           'If you have any questions, just reply to this email.\n\n' ||
           'Best regards,\n\n' ||
           'Winsalot Corp\n' ||
           'on behalf of {{client_business_name}}',
    updated_at = now()
where key = 'consultation_follow_up';

update public.leadgen_email_templates
set subject = 'Quick question about {{business_name}}',
    body = E'Hi {{first_name}},\n\n' ||
           'Quick question about {{business_name}} - are you currently looking for more ways to promote your services and receive quote requests?\n\n' ||
           'Mantra Collab helps businesses do exactly that through an affordable platform.\n\n' ||
           '{{booking_section}}\n\n' ||
           'Best regards,\n\n' ||
           'Winsalot Corp\n' ||
           'on behalf of Mantra Collab',
    updated_at = now()
where key = 'mantra_collab_intro';

-- consultation_information (the "Send Consultation Email" / "Send
-- {ClientName} Email" primary button - the flagship first-touch email
-- for every non-Mantra client) gets the same treatment: a personalized,
-- natural subject, {{client_business_name}} instead of a name hardcoded
-- to "Brent's Essentials" (this template is used for every non-Mantra
-- client, not only that one), and no ALL-CAPS "FREE". {{booking_paragraph}}
-- is unchanged - still renders the admin-configured booking link (or the
-- "please reply" fallback) via leadgenBookingParagraph(), and
-- buildLeadgenConsultationCtaEmail() still finds that URL and swaps it
-- for the one plain-text booking link, exactly as before.
update public.leadgen_email_templates
set subject = 'Quick question about {{business_name}}',
    body = E'Hi {{first_name}},\n\n' ||
           'Thank you for taking the time to speak with us.\n\n' ||
           '{{client_business_name}} can help improve your operations, generate more qualified leads, and streamline your workflow.\n\n' ||
           '{{booking_paragraph}}',
    updated_at = now()
where key = 'consultation_information';
