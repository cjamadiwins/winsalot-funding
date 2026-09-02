-- Admin-only "Resubscribe" for the Growth CRM (crm_email_suppressions,
-- migration 0087): lets an admin clear a prospect's unsubscribe status
-- after they explicitly ask to receive emails again, without ever
-- destroying the original unsubscribe record.
--
-- crm_email_suppressions gets an `active` flag instead of the row being
-- deleted on resubscribe - isEmailSuppressed() only blocks on an active
-- row, but the original reason/suppressed_at/opportunity_id stay on the
-- same row for good, alongside who/when/how it was later resubscribed.
-- crm_email_resubscribe_audit is a separate, append-only log - every
-- resubscribe writes its own row here, so multiple
-- unsubscribe/resubscribe cycles for the same address are never
-- overwritten, distinct from crm_activities' free-text per-opportunity
-- timeline entry for the same event.

alter table public.crm_email_suppressions
  add column if not exists active boolean not null default true,
  add column if not exists resubscribed_at timestamptz,
  add column if not exists resubscribed_by uuid references public.crm_users(id) on delete set null,
  add column if not exists resubscribe_consent_method text;

create index if not exists crm_email_suppressions_active_idx
  on public.crm_email_suppressions(email) where active;

create table if not exists public.crm_email_resubscribe_audit (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  admin_id uuid references public.crm_users(id) on delete set null,
  admin_name text not null,
  consent_date timestamptz not null,
  consent_method text not null check (length(trim(consent_method)) > 0),
  re_enrolled_marketing boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.crm_email_resubscribe_audit enable row level security;

-- Same "admin session client, RLS-gated" convention as crm_invoice_audit
-- (migration 0091) - unlike crm_email_suppressions itself (service-role
-- only bookkeeping), this audit log is meant to be readable from the
-- opportunity detail page an admin is already looking at.
create policy "crm_email_resubscribe_audit_admin_all"
  on public.crm_email_resubscribe_audit for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create index if not exists crm_email_resubscribe_audit_email_idx
  on public.crm_email_resubscribe_audit(email, created_at desc);
create index if not exists crm_email_resubscribe_audit_opportunity_idx
  on public.crm_email_resubscribe_audit(opportunity_id, created_at desc);

-- New crm_activities entry type for the opportunity-level timeline, same
-- additive technique every prior grow of this constraint has used (see
-- 0082/0091/0097/0098/0099).
alter table public.crm_activities drop constraint if exists crm_activities_activity_type_check;
alter table public.crm_activities add constraint crm_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'text', 'voicemail', 'note', 'outcome',
    'consultation_booked', 'consultation_rescheduled', 'consultation_cancelled',
    'client_created', 'client_updated', 'client_archived', 'client_reactivated',
    'client_deleted', 'client_agent_assigned', 'client_agent_unassigned',
    'invoice_created', 'invoice_sent', 'invoice_reminder_sent', 'invoice_cancelled',
    'invoice_archived', 'payment_recorded', 'payment_reversed',
    'agreement_sent', 'agreement_signed', 'agreement_superseded',
    'intake_sent', 'intake_received', 'onboarding_invoice_recorded',
    'onboarding_payment_received', 'campaign_activated',
    'pilot_activated', 'pilot_results_review_started', 'pilot_converted',
    'pilot_extended', 'pilot_closed', 'pilot_results_recorded',
    'onboarding_record_updated', 'onboarding_record_deleted',
    'email_resubscribed'
  ));
