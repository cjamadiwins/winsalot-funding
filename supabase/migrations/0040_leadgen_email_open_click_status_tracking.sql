-- LeadGen email tracking parity with required Resend lifecycle events:
-- persist opened/clicked and allow these status values.

alter table public.leadgen_emails
  drop constraint if exists leadgen_emails_status_check;

alter table public.leadgen_emails
  add constraint leadgen_emails_status_check
  check (status in ('draft', 'sending', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed'));

alter table public.leadgen_emails
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz;
