-- Email delivery tracking for the CRM, driven by Resend webhooks.
--
-- crm_lead_emails records every quote-request/follow-up email an agent
-- sends from a lead's page: the Resend email id (so incoming webhook
-- events can be matched back to it), which lead/agent/activity it belongs
-- to, and a timestamp for each Resend delivery event
-- (sent/delivered/delayed/bounced/complained/opened/clicked) plus a
-- "latest status" pair for quick display.
--
-- Unlike crm_leads/crm_activities/crm_followups, this table follows the
-- *legacy* RLS pattern already used for quote_requests etc. (RLS enabled,
-- no policies, service-role key only, see migration 0003/docs/crm.md) -
-- it's internal delivery-tracking bookkeeping, not something agents query
-- directly. Every event is also mirrored onto crm_activities (through the
-- normal session-scoped client, so the existing agent/admin RLS there
-- keeps governing what shows up in a lead's timeline), and the "latest
-- status" is mirrored onto crm_leads (new columns below), which already
-- has real per-row RLS - so agents still only ever see this for leads
-- they can already see.
create table if not exists public.crm_lead_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  agent_id uuid references public.crm_users(id) on delete set null,
  activity_id uuid references public.crm_activities(id) on delete set null,
  resend_email_id text not null unique,
  email_type text not null check (email_type in ('quote_request', 'follow_up')),
  to_email text not null,
  subject text not null,
  status text not null default 'sent' check (status in (
    'sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked'
  )),
  status_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  delayed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz
);

create index if not exists crm_lead_emails_lead_idx on public.crm_lead_emails(lead_id, created_at desc);
create index if not exists crm_lead_emails_resend_id_idx on public.crm_lead_emails(resend_email_id);

alter table public.crm_lead_emails enable row level security;

-- Idempotency guard for the Resend webhook handler: Standard Webhooks
-- (what Resend's webhook delivery is built on) retries a delivery that
-- didn't get a 2xx response, resending the *same* webhook id. Recording
-- each id once and skipping processing on a unique-violation means a
-- retried delivery never double-logs an activity entry. Same RLS pattern
-- as crm_lead_emails above - service-role only, nothing for the app's
-- session-scoped clients to read or write here.
create table if not exists public.crm_email_webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);

alter table public.crm_email_webhook_events enable row level security;

-- Denormalized "latest email status" on the lead itself, so every place
-- that already reads crm_leads (lead detail pages, the admin/agent lead
-- lists) can show it without a second query, and so a bounced address can
-- be highlighted right on the lead record per the feature's requirements.
-- Kept in sync by the Resend webhook handler (service-role client), only
-- ever advanced when the incoming event and it's the lead's most recently
-- sent tracked email - never by application code sending the email
-- itself (that only ever writes the initial 'sent' row in
-- crm_lead_emails, see src/lib/send-crm-email.ts).
alter table public.crm_leads
  add column if not exists last_email_status text check (last_email_status in (
    'sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked'
  )),
  add column if not exists last_email_status_at timestamptz,
  add column if not exists last_email_type text check (last_email_type in ('quote_request', 'follow_up')),
  add column if not exists last_email_to text;
