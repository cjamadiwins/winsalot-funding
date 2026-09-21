-- Growth CRM Client Consultation Guide: review-before-send follow-up
-- email. Completing a consultation now only GENERATES a draft
-- subject/body (saved here) - it never sends anything automatically.
-- Admin reviews/edits the saved draft, then a separate, explicit "Send
-- Email" click is the only thing that ever calls Resend; "Resend Email"
-- reuses whatever is currently saved here (which may have been edited
-- again since the original send).
--
-- Purely additive: both columns are nullable, so every existing guide
-- (including one already marked Completed before this feature existed,
-- e.g. via a direct data migration) keeps working unchanged - the guide
-- detail page generates a draft into these columns the first time it's
-- opened if they're still empty, per the app's own ensureFollowUpEmailDraft
-- (src/lib/consultation-guide-email.ts).
alter table public.crm_consultation_guides
  add column if not exists follow_up_email_subject text,
  add column if not exists follow_up_email_body text;

comment on column public.crm_consultation_guides.follow_up_email_subject is
  'Admin-editable draft subject - generated once on completion, never re-generated automatically. This exact value is what Send/Resend actually sends.';
comment on column public.crm_consultation_guides.follow_up_email_body is
  'Admin-editable draft body (plain text) - generated once on completion, never re-generated automatically. This exact value is what Send/Resend actually sends (rendered to HTML at send time).';
