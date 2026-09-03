-- Adds human-readable bounce/failure reason columns to crm_lead_emails,
-- mirroring the columns leadgen_emails already has (migration 0034).
-- Without these, the Growth CRM's Email Tracking "View Details" panel has
-- a bounced_at/failed_at timestamp but nothing explaining *why* - the
-- Resend webhook (email.bounced -> event.data.bounce.message,
-- email.failed -> event.data.failed.reason) already receives this text,
-- it's just never been persisted. Purely additive, no existing data
-- touched.

alter table public.crm_lead_emails add column if not exists bounce_reason text;
alter table public.crm_lead_emails add column if not exists failure_reason text;
