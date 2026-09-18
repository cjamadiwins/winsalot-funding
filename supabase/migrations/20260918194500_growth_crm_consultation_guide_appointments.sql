-- Growth CRM: connect the Client Consultation Guide to the existing
-- appointment-booking system and add service-specific follow-up email
-- tracking (CJ's "connect it to the existing appointment system and add
-- service-specific follow-up emails" brief).
--
-- Entirely additive: no existing table, column, row, policy, or trigger
-- is altered except the crm_lead_emails.email_type check constraint,
-- which is only ever widened (every value it already accepts stays
-- accepted) to admit the new Business Finance guide-completion email.
--
-- NOT APPLIED TO PRODUCTION YET - CJ asked to review this SQL first.

alter table public.crm_consultation_guides
  -- Set when this guide was opened from an existing booked appointment
  -- (?appointmentId=... on /admin/consultation-guide/new) so the guide can
  -- show/link back to it later. Null for a manual consultation with no
  -- appointment (unchanged existing behavior).
  add column if not exists appointment_id uuid references public.winsalot_appointments(id) on delete set null,

  -- Required before a guide can be marked complete (enforced in the
  -- Server Action, not here, so a draft can still be saved without one
  -- yet chosen). Deliberately only 2 values, unlike crm_opportunities'
  -- 3-way opportunity_type - a "both_services" appointment has no single
  -- correct answer here and must never be guessed, so it's left null and
  -- Admin must choose explicitly (see CONSULTATION_GUIDE_SERVICES in
  -- src/lib/consultation-guide.ts).
  add column if not exists service text check (service in ('lead_generation', 'business_financing')),

  -- One-time consultation-completion follow-up email tracking - same
  -- shape as winsalot_appointments' own follow_up_email_* columns
  -- (migration 0160), kept as its own independent set here since a guide
  -- can exist, and be completed, without any linked appointment at all.
  add column if not exists follow_up_email_status text not null default 'not_sent' check (follow_up_email_status in ('not_sent', 'sending', 'sent', 'failed')),
  add column if not exists follow_up_email_sent_at timestamptz,
  -- The service the sent template actually matched, captured at send time
  -- - kept separate from the `service` column above since `service` can
  -- still be edited on the guide after completion, and this must keep
  -- reflecting what was actually emailed.
  add column if not exists follow_up_email_service text check (follow_up_email_service in ('lead_generation', 'business_financing')),
  add column if not exists follow_up_email_error text,
  -- crm_lead_emails enforces "exactly one of lead_id/opportunity_id/
  -- provider_lead_id" (migration 0085) - a guide with no linked
  -- opportunity has nothing to satisfy that with, so no crm_lead_emails
  -- row exists for it at all and this column stays null; the guide's own
  -- follow_up_email_* columns above are the source of truth either way.
  add column if not exists follow_up_crm_lead_email_id uuid references public.crm_lead_emails(id) on delete set null,
  -- Set to 'No recipient email' when Admin completes a consultation that
  -- has no email address on file (per the brief - never blocks
  -- completion, just records why no email went out). Null whenever a send
  -- was attempted (sent or failed).
  add column if not exists no_follow_up_email_reason text;

create index if not exists crm_consultation_guides_appointment_idx on public.crm_consultation_guides(appointment_id);

-- Widen the shared Resend delivery ledger to admit the new Business
-- Finance guide-completion email. The Lead Generation guide-completion
-- email reuses the existing 'consultation_follow_up' type unchanged (it's
-- the same email winsalot_appointments' own "Complete Consultation"
-- action already sends).
alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_email_type_check;
alter table public.crm_lead_emails add constraint crm_lead_emails_email_type_check
  check (email_type in (
    'quote_request', 'follow_up', 'provider_intake', 'consultation_invite',
    'appointment_reminder', 'appointment_confirmation', 'consultation_follow_up',
    'detailed_service_pricing', 'business_finance_follow_up'
  ));
