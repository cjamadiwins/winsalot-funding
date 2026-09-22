-- Winsalot Growth CRM: a second Referral Partner email template ("Services
-- & Selling Points") plus a shared, append-only send history across BOTH
-- partner email templates.
--
-- Entirely additive and leaves the existing "Partnership Overview &
-- Referral Structure" template (crm_subcontractors.partner_overview_email_*,
-- migration 20260922120000) completely untouched - Tony's already-sent
-- copy of that email keeps exactly the subject/body/status/sent_at it has
-- today. The new template gets its own, disjoint set of columns mirroring
-- that same shape, and a new crm_subcontractor_partner_email_log table
-- records one row per actual send (recipient, subject, final body,
-- sent_at) for whichever template was sent - "email history" that the
-- single-status-column model (fine for "is the current draft sent yet",
-- not for "what did we send, when") can't represent.

-- ---------------------------------------------------------------------
-- 1. crm_subcontractors: Services & Selling Points draft/send state -
--    same generate-once-then-review-then-send-manually shape as
--    partner_overview_email_* (migration 20260922120000).
-- ---------------------------------------------------------------------

alter table public.crm_subcontractors
  add column if not exists services_email_subject text,
  add column if not exists services_email_body text,
  add column if not exists services_email_status text not null default 'not_sent'
    check (services_email_status in ('not_sent', 'sending', 'sent', 'failed')),
  add column if not exists services_email_sent_at timestamptz,
  add column if not exists services_email_error text;

-- ---------------------------------------------------------------------
-- 2. crm_subcontractor_partner_email_log: append-only send history,
--    shared across every partner email template (not just the new one) -
--    one row inserted alongside each future successful send, in addition
--    to (never instead of) that template's own status/sent_at columns
--    being updated as before.
-- ---------------------------------------------------------------------

create table if not exists public.crm_subcontractor_partner_email_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subcontractor_id uuid not null references public.crm_subcontractors(id) on delete cascade,
  template_key text not null check (template_key in ('partnership_overview', 'services_selling_points')),
  recipient_email text not null,
  subject text not null,
  body text not null,
  sent_by uuid references public.crm_users(id) on delete set null,
  resend_email_id text
);

create index if not exists crm_subcontractor_partner_email_log_subcontractor_idx
  on public.crm_subcontractor_partner_email_log(subcontractor_id, created_at desc);

alter table public.crm_subcontractor_partner_email_log enable row level security;

create policy "crm_subcontractor_partner_email_log_admin_all"
  on public.crm_subcontractor_partner_email_log for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- 3. crm_subcontractor_audit_log: one new action value. Same drop+recreate
--    technique as before - every previously-accepted value stays accepted.
-- ---------------------------------------------------------------------

alter table public.crm_subcontractor_audit_log drop constraint if exists crm_subcontractor_audit_log_action_check;
alter table public.crm_subcontractor_audit_log add constraint crm_subcontractor_audit_log_action_check
  check (action in (
    'created', 'profile_updated', 'agreement_accepted', 'client_assignment_changed',
    'compensation_changed', 'crm_access_granted', 'crm_access_revoked',
    'permissions_changed', 'training_completed', 'payroll_approved', 'payroll_paid',
    'status_changed', 'deactivated', 'reactivated',
    'referral_prospect_linked', 'referral_prospect_unlinked',
    'referral_client_linked', 'referral_client_unlinked',
    'referral_revenue_recorded', 'referral_revenue_commission_paid',
    'lending_referral_recorded', 'lending_referral_commission_paid',
    'partner_overview_email_sent', 'services_email_sent'
  ));
