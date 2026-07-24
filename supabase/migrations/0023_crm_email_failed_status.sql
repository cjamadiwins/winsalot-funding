-- Adds "failed" (Resend's email.failed event - a permanent send failure,
-- distinct from a bounce) as a trackable email status, alongside the
-- existing sent/delivered/delayed/bounced/complained/opened/clicked set
-- from migration 0022. Purely additive: a new nullable timestamp column
-- and widened check constraints, no existing data touched.

alter table public.crm_lead_emails add column if not exists failed_at timestamptz;

alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_status_check;
alter table public.crm_lead_emails add constraint crm_lead_emails_status_check
  check (status in ('sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed'));

alter table public.crm_leads drop constraint if exists crm_leads_last_email_status_check;
alter table public.crm_leads add constraint crm_leads_last_email_status_check
  check (last_email_status in ('sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed'));
