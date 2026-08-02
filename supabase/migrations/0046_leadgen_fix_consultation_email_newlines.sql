-- Re-applies the "Consultation Information" email body with every
-- paragraph break as a real newline. Migration 0045 built this string by
-- concatenating several plain '...' literals with only the first one
-- E'...'-prefixed - in standard PostgreSQL, backslash has no special
-- meaning in a plain literal, so every \n after the first pair landed in
-- the stored body as the two literal characters "\" and "n" instead of a
-- newline (confirmed live: position(chr(92)||'n' in body) was non-zero
-- before this fix, 0 after). Every segment below is E'...'-prefixed to
-- avoid repeating that mistake. Subject/key are unchanged from 0045.
update public.leadgen_email_templates
set subject = 'Book Your Free 15-Minute Business Growth Consultation',
    body = E'Hi {{first_name}},\n\nThank you for taking the time to speak with us.\n\nWe would love the opportunity to show you how Brent''s Essentials can help improve your operations, generate more qualified leads, streamline your workflow, and grow your business.\n\nPlease click the button below to schedule your FREE 15-minute Business Growth Consultation.\n\n{{booking_paragraph}}',
    updated_at = now()
where key = 'consultation_information';
