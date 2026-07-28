-- Replaces the consultation_invitation template body with the simplified
-- copy requested for Brent's Essentials (no bullet list, no services
-- section - just the opening, one line of context, the booking CTA, and
-- the signature). Subject/key are unchanged. Data-only.
update leadgen_email_templates
set body = 'Hi {{first_name}},' || E'\n\n' ||
           'Thank you for your interest in {{client_business_name}}.' || E'\n\n' ||
           'We can help you generate more leads using AI and automated workflows.' || E'\n\n' ||
           'Please click below to book your free 15-minute consultation.' || E'\n\n' ||
           '{{booking_section}}' || E'\n\n' ||
           'Best regards,' || E'\n\n' ||
           'Winsalot Corp' || E'\n' ||
           'on behalf of {{client_business_name}}',
    updated_at = now()
where key = 'consultation_invitation';
