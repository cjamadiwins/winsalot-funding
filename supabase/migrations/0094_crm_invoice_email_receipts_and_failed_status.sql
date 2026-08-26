-- Adds the "Optionally email a payment receipt" capability
-- (crm_invoice_emails.email_type / crm_invoice_audit.action gain
-- 'invoice_receipt'/'receipt_sent'), and lets the Resend webhook track a
-- hard-failed send on an invoice email exactly like it already does for
-- crm_lead_emails ('failed' + failed_at) - previously crm_invoice_emails
-- had no way to represent this at all, so the webhook silently skipped
-- writing anything for an email.failed event on a tracked invoice email.

alter table public.crm_invoice_emails add column if not exists failed_at timestamptz;

alter table public.crm_invoice_emails drop constraint crm_invoice_emails_email_type_check;
alter table public.crm_invoice_emails add constraint crm_invoice_emails_email_type_check
  check (email_type in ('invoice_sent', 'invoice_reminder', 'invoice_receipt'));

alter table public.crm_invoice_emails drop constraint crm_invoice_emails_status_check;
alter table public.crm_invoice_emails add constraint crm_invoice_emails_status_check
  check (status in ('sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed'));

alter table public.crm_invoice_audit drop constraint crm_invoice_audit_action_check;
alter table public.crm_invoice_audit add constraint crm_invoice_audit_action_check
  check (action in (
    'created', 'draft_saved', 'edited', 'duplicated', 'sent', 'resent', 'reminder_sent',
    'payment_recorded', 'payment_reversed', 'marked_paid', 'marked_partially_paid',
    'cancelled', 'archived', 'unarchived', 'pdf_downloaded', 'deleted', 'receipt_sent'
  ));
