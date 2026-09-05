-- Winsalot Growth CRM: pilots can now be either Free or Paid.
--
-- Reuses crm_client_agreements' existing fee columns (migration 0097/0098)
-- rather than duplicating them: `monthly_fee` continues to be the pilot's
-- own fee field (labelled "Pilot Fee" in the UI for a pilot, exactly like
-- `monthly_target` is already relabelled "Pilot Target" for a pilot -
-- see agreedTargetLabel() in crm-agreement-types.ts), `setup_fee` and
-- `currency` (migration 0099) are unchanged. campaign_type keeps its
-- existing 'free_pilot' value for "this is a pilot, not a standard
-- monthly campaign" - only additive here is `pilot_type`, which
-- distinguishes a Free Pilot from a Paid Pilot *within* that same
-- campaign_type, so no existing row, constraint, or code path that reads
-- campaign_type needs to change meaning.
--
-- New columns, every one nullable or defaulted, so every existing free
-- pilot (created before this feature existed) keeps working completely
-- unchanged and is safely read as pilot_type = 'free' - Postgres backfills
-- the default into every pre-existing row the moment the column is added,
-- so no separate UPDATE is needed to protect old records:
--   * pilot_type ('free'/'paid') - defaults 'free', matching every pilot's
--     only possible behavior before this migration existed.
--   * payment_status - a pilot-specific payment summary field, independent
--     of pilot_status (the existing Not Started/Active/Results Review/
--     Converted/Extended/Closed lifecycle) and independent of the real
--     invoice's own status once one is linked - the admin sets this
--     directly (e.g. "Waived" or "Not Required" have no invoice-status
--     equivalent). Defaults 'not_required', correct for every existing
--     free pilot and for every standard (non-pilot) agreement, which
--     never reads this column at all.
--   * payment_due_date - optional, pilot-specific; standard agreements
--     keep using their own free-text payment_due_terms column untouched.
--   * invoice_id - links a Paid Pilot to a real crm_invoices row (the
--     CRM's actual invoicing system, migration 0091) generated or linked
--     via the admin UI, so a pilot's payment is never tracked through a
--     second, duplicate invoicing mechanism. Deliberately NOT the
--     lightweight crm_agreement_invoices tracker (migration 0097), which
--     already explicitly refuses pilots (see recordAgreementInvoiceAction
--     in src/app/admin/(dashboard)/crm/agreements/actions.ts) since that
--     tracker was only ever meant for the standard-campaign onboarding
--     flow. on delete set null - deleting an invoice (rare, admin-only)
--     un-links it rather than blocking the delete or cascading.
alter table public.crm_client_agreements
  add column if not exists pilot_type text not null default 'free' check (pilot_type in ('free', 'paid')),
  add column if not exists payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'pending', 'paid', 'partially_paid', 'overdue', 'waived')),
  add column if not exists payment_due_date date,
  add column if not exists invoice_id uuid references public.crm_invoices(id) on delete set null;

create index if not exists crm_client_agreements_invoice_idx on public.crm_client_agreements (invoice_id);

-- Widen the signed-immutability guard (migration 0097/0098/0099) to also
-- lock pilot_type once signed - it's a commercial decision made at draft
-- time, exactly like campaign_type/monthly_fee/setup_fee/currency already
-- on this same list, so a signed Free Pilot can't silently become a Paid
-- Pilot (or vice versa) without a new agreement version. payment_status,
-- payment_due_date and invoice_id are deliberately NOT added here - like
-- pilot_status, they are expected to keep changing after signing (payment
-- happens after the agreement is signed).
--
-- This must reproduce migration 0099's field list exactly (legal_business_
-- name/contact_person/business_email are deliberately NOT guarded - 0099
-- intentionally unlocked those for the Manage action - see that
-- migration's own header comment), adding only pilot_type on top, so this
-- replace never silently reintroduces a lock 0099 removed.
create or replace function public.crm_client_agreements_guard_signed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'signed' and new.status = 'signed' then
    if new.service_type is distinct from old.service_type
      or new.target_type is distinct from old.target_type
      or new.monthly_target is distinct from old.monthly_target
      or new.monthly_fee is distinct from old.monthly_fee
      or new.setup_fee is distinct from old.setup_fee
      or new.currency is distinct from old.currency
      or new.target_industries is distinct from old.target_industries
      or new.target_locations is distinct from old.target_locations
      or new.campaign_start_date is distinct from old.campaign_start_date
      or new.billing_frequency is distinct from old.billing_frequency
      or new.payment_due_terms is distinct from old.payment_due_terms
      or new.initial_term is distinct from old.initial_term
      or new.renewal_terms is distinct from old.renewal_terms
      or new.cancellation_terms is distinct from old.cancellation_terms
      or new.signer_full_name is distinct from old.signer_full_name
      or new.signer_job_title is distinct from old.signer_job_title
      or new.signer_business_name is distinct from old.signer_business_name
      or new.signer_signature_text is distinct from old.signer_signature_text
      or new.campaign_type is distinct from old.campaign_type
      or new.pilot_type is distinct from old.pilot_type
      or new.pilot_duration is distinct from old.pilot_duration
      or new.pilot_end_date is distinct from old.pilot_end_date
      or new.expected_call_volume is distinct from old.expected_call_volume
      or new.qualification_criteria is distinct from old.qualification_criteria
      or new.results_review_date is distinct from old.results_review_date
    then
      raise exception 'A signed agreement cannot be edited. Create a new version instead.';
    end if;
  end if;
  return new;
end;
$$;
