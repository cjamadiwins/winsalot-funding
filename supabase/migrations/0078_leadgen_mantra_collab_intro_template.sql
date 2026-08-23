-- Updates the mantra_collab_intro template body to the exact wording
-- requested: a single value + CTA sentence, replacing the original
-- two-sentence draft. Subject/key are unchanged. Data-only, same
-- update-in-place pattern as prior template wording fixes (e.g.
-- migrations 0039, 0046).
update public.leadgen_email_templates
set body = E'Hi {{first_name}},\n\nMantra Collab helps businesses promote their services and receive quote requests. Please click below to book your free 15-minute consultation.\n\n{{booking_section}}\n\n{{visit_section}}',
    updated_at = now()
where key = 'mantra_collab_intro';
