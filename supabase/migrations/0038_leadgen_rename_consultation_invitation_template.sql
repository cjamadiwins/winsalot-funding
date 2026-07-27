-- Renames the consultation_invitation template so it's identifiable in
-- the Client Communications composer dropdown as the Brent's Essentials
-- template it actually is (Brent's Essentials is the only real client
-- today). Data-only - subject/body/key are unchanged.
update leadgen_email_templates
set name = 'Brent''s Essentials – 15-Minute Consultation', updated_at = now()
where key = 'consultation_invitation';
