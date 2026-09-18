-- Growth CRM Client Consultation Guide: audit who last edited a
-- consultation, and let a completed guide's follow-up email be resent on
-- purpose without losing the record of the original send (CJ's "Completed
-- consultations must remain viewable and editable... Show who last
-- updated the consultation and when... Any email resend must use a
-- separate confirmed Resend Email action" while preserving "the original
-- recipient, template, send time and delivery status").
--
-- Entirely additive: no existing table, column, row, policy, or trigger
-- is altered.
--
-- NOT APPLIED TO PRODUCTION YET - for CJ to review before it's applied.

alter table public.crm_consultation_guides
  -- Set on every Save Consultation / Save as Draft / Mark Consultation
  -- Complete (including editing an already-completed guide) - separate
  -- from created_by, which never changes after the guide is first saved.
  add column if not exists updated_by uuid references public.crm_users(id) on delete set null,

  -- A deliberate "Resend Follow-Up Email" (only offered once the guide is
  -- completed and its original send already succeeded - see
  -- resendConsultationFollowUpEmailAction) never touches
  -- follow_up_email_status/sent_at/service/error/follow_up_crm_lead_email_id
  -- above, so those columns keep describing the *original* send exactly as
  -- they did before this migration. A resend only ever adds to these three
  -- columns instead.
  add column if not exists follow_up_email_resend_count integer not null default 0,
  add column if not exists follow_up_email_last_resent_at timestamptz,
  add column if not exists follow_up_email_last_resent_by uuid references public.crm_users(id) on delete set null,
  add column if not exists follow_up_email_last_resend_error text;
