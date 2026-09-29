-- Growth CRM: permanent client communication history.
--
-- Client-facing emails that are already logged elsewhere stay where they are
-- and are READ THROUGH on the client profile (never copied, so nothing can be
-- duplicated): leadgen_emails (portal invitations/resets, campaign reports,
-- client communications), crm_invoice_emails (invoice sends/reminders/
-- receipts), crm_retention_emails (renewals) and crm_lead_emails (the
-- client's earlier consultation/appointment emails).
--
-- This table records only the client emails that had NO log at all: payment
-- receipt emails, agreement/intake emails, manual "Send Client Update" emails
-- and the campaign setup email. resend_email_id is unique, so the same send
-- can never be logged twice.
--
-- Access: admin/system only. RLS allows an admin to SELECT; there is no
-- insert/update/delete policy at all - writes come from server code using the
-- service role (which bypasses RLS), including the Resend webhook that keeps
-- delivery status current. Grants are explicit and minimal below.

create table if not exists public.crm_client_communications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references public.crm_clients(id) on delete restrict,
  recipient_email text not null,
  subject text not null,
  email_type text not null check (email_type in (
    'payment_receipt', 'agreement_sent', 'agreement_signed_copy', 'intake_form', 'client_update', 'campaign_setup'
  )),
  sender text not null,
  sent_by_user_id uuid references public.crm_users(id) on delete set null,
  sent_by_name text,
  sent_at timestamptz not null default now(),
  body_html text,
  body_text text,
  status text not null default 'sent' check (status in (
    'sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed'
  )),
  status_at timestamptz not null default now(),
  delivered_at timestamptz,
  delayed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  failed_at timestamptz,
  error_detail text,
  resend_email_id text unique,
  related_type text check (related_type in ('payment', 'agreement', 'invoice', 'report', 'appointment', 'portal', 'renewal')),
  related_id uuid,
  resent_from_id uuid references public.crm_client_communications(id) on delete set null
);

create index if not exists crm_client_communications_client_idx on public.crm_client_communications(client_id, sent_at desc);

alter table public.crm_client_communications enable row level security;

create policy "crm_client_communications_admin_select" on public.crm_client_communications for select
  using (public.crm_user_role(auth.uid()) = 'admin');

revoke all on table public.crm_client_communications from anon, authenticated;
grant select on table public.crm_client_communications to authenticated;
grant all on table public.crm_client_communications to service_role;

comment on table public.crm_client_communications is 'Permanent log of client-facing emails that have no other log (receipts, agreement/intake, manual updates, setup email). Admin read-only under RLS; written by the service role only.';
