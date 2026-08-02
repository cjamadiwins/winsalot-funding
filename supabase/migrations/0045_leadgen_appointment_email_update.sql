-- Replaces the "Consultation Information" prospect email (the appointment
-- booking invitation sent from a lead's "Send Consultation Email" button)
-- with the updated Business Growth Consultation copy. Data-only - key is
-- unchanged, so every existing send-path, activity log, and status-update
-- behavior wired to template_key = 'consultation_information' keeps
-- working exactly as before. {{first_name}} and {{booking_paragraph}} are
-- unchanged placeholders - {{booking_paragraph}} still renders the
-- admin-configured booking link (leadgen_clients.booking_link) via
-- leadgenBookingParagraph()/buildLeadgenConsultationCtaEmail(), never a
-- hardcoded Calendly link.
update public.leadgen_email_templates
set subject = 'Book Your Free 15-Minute Business Growth Consultation',
    body = E'Hi {{first_name}},\n\n' ||
           'Thank you for taking the time to speak with us.\n\n' ||
           'We would love the opportunity to show you how Brent''s Essentials can help improve your operations, generate more qualified leads, streamline your workflow, and grow your business.\n\n' ||
           'Please click the button below to schedule your FREE 15-minute Business Growth Consultation.\n\n' ||
           '{{booking_paragraph}}',
    updated_at = now()
where key = 'consultation_information';
