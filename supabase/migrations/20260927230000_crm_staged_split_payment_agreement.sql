-- Winsalot Growth CRM: Staged / Split-Payment tracking on top of the
-- existing Performance-Based First Campaign agreement (migration
-- 20260925170634_crm_performance_based_first_campaign.sql).
--
-- Teknokraft Canada Inc.'s initial engagement is a real, signed campaign
-- (campaign_type stays 'performance_based_first' - it is neither a
-- Standard Monthly nor a Free Pilot) whose CA$750 total campaign value is
-- collected in three separate, individually-confirmable stages rather than
-- the single lump sum the original Performance-Based First design assumed:
--   1. A CA$250 upfront deposit, due by a fixed date.
--   2. A CA$250 payment on the FIRST qualifying conversion - reuses the
--      existing conversion_status/converted_at columns unchanged (that
--      pair was already generic enough to mean exactly this).
--   3. A CA$250 payment on the SECOND qualifying conversion - genuinely
--      new, since no existing column can distinguish a first conversion
--      from a second one.
--
-- Deliberately does NOT add a new campaign_type or template kind: this
-- stays a 'performance_based_first_agreement' agreement, just with a
-- staged fee schedule described in its own template version rather than
-- the single-payment wording renderAgreementTemplate() generates for that
-- kind. Every column below is nullable/defaulted, so every existing
-- Standard Monthly, Free Pilot, or single-payment Performance-Based First
-- agreement (including Web6 Solutions') is completely unaffected.

alter table public.crm_client_agreements
  add column if not exists staged_deposit_amount numeric(10, 2),
  add column if not exists staged_deposit_due_date date,
  add column if not exists staged_deposit_status text not null default 'not_paid'
    check (staged_deposit_status in ('not_paid', 'paid')),
  add column if not exists staged_deposit_paid_at timestamptz,
  add column if not exists staged_second_conversion_status text not null default 'not_converted'
    check (staged_second_conversion_status in ('not_converted', 'converted')),
  add column if not exists staged_second_converted_at timestamptz;

comment on column public.crm_client_agreements.staged_deposit_amount is
  'Staged Performance-Based First Campaign only (e.g. Teknokraft Canada Inc.): the upfront deposit amount, due before the first conversion payment. Null/unused for every other agreement.';
comment on column public.crm_client_agreements.staged_second_conversion_status is
  'Staged Performance-Based First Campaign only: whether the SECOND qualifying Winsalot-generated prospect has converted. The existing conversion_status/converted_at columns track the FIRST conversion for these agreements - unchanged, still the single source of truth for that.';
