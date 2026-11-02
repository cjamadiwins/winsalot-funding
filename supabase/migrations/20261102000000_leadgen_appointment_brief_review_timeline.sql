-- Lead Generation CRM: Prepare Appointment - brief review timeline + template.
--
-- Additive only (nullable columns). No existing row, policy, grant or
-- appointment/confirmation/reminder record is changed. Writes remain
-- service_role-only through the existing Admin server actions.
--
--   generated_at / reviewed_at / reviewed_by - audit trail for "generated,
--     reviewed" (sent = sent_at, delivered = leadgen_emails.delivered_at via
--     the existing Resend webhook).
--   brief_template - optional key of a built-in brief layout (e.g.
--     'website_redesign_hso') that adds service sections to the PDF.

alter table public.leadgen_appointment_briefs
  add column if not exists generated_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.leadgen_users(id) on delete set null,
  add column if not exists brief_template text;
