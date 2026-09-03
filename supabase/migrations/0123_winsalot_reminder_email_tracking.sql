-- Wires the Growth CRM's automatic Winsalot consultation reminder job
-- (src/lib/winsalot-consultation-reminders.ts, migration 0088) into the
-- same crm_lead_emails delivery-tracking table every other Growth CRM
-- email already uses, so a 24h/1h reminder shows up on Email Tracking
-- (/admin/crm/emails) and receives the same Resend webhook status
-- updates (delivered/opened/clicked/bounced/failed) as any other tracked
-- send. Previously the job called Resend directly and only recorded the
-- send on winsalot_appointment_reminders, a table the Resend webhook
-- handler (src/app/api/webhooks/resend/route.ts) never queries.

alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_email_type_check;
alter table public.crm_lead_emails add constraint crm_lead_emails_email_type_check
  check (email_type in ('quote_request', 'follow_up', 'provider_intake', 'consultation_invite', 'appointment_reminder'));

-- Mirrors leadgen_appointment_reminders.email_id / leadgen_appointment_business_reminders.email_id
-- (migrations 0067/0068), which FK into leadgen_emails - same idea here,
-- into crm_lead_emails. Nullable: a reminder for an appointment with no
-- opportunity_id (not yet converted from a raw prospect booking) still
-- sends and is still recorded on winsalot_appointment_reminders, it just
-- has nothing to link into crm_lead_emails (which requires exactly one of
-- lead_id/opportunity_id/provider_lead_id - see
-- crm_lead_emails_exactly_one_target, migration 0085).
alter table public.winsalot_appointment_reminders
  add column if not exists crm_lead_email_id uuid references public.crm_lead_emails(id) on delete set null;
