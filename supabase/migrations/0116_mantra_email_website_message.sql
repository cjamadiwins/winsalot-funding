-- Align the saved Mantra Collab outreach template with the reason agents
-- give on the call: website improvement/redesign, stronger credibility,
-- and converting visitors into customer inquiries. Application code uses
-- the same canonical copy so preview, resend, and send remain consistent
-- even before or during a migration rollout.
update public.leadgen_email_templates
set subject = 'Website consultation for {{business_name}}',
    body = E'Hi {{first_name}},\n\n' ||
           'Thank you for taking the time to speak with us.\n\n' ||
           'Mantra Collab helps businesses improve or redesign their website so it better showcases their work, builds credibility, and helps turn visitors into customer inquiries.\n\n' ||
           'You can book a free 15-minute consultation to learn how Mantra Collab can help {{business_name}}.\n\n' ||
           '{{booking_section}}\n\n' ||
           'Best regards,\n\n' ||
           'Winsalot Corp\n' ||
           'on behalf of Mantra Collab',
    updated_at = now()
where key = 'mantra_collab_intro';
