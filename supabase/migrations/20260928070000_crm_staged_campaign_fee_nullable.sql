-- Allow a blank/null Campaign Fee for a staged/split-payment
-- Performance-Based First Campaign (e.g. Hidebrandt Web Services,
-- Teknokraft Canada Inc. - see migration 20260927230307_crm_staged_split_
-- payment_agreement's header comment). Their real terms are fully
-- described by staged_deposit_amount (a CA$250 deposit + two equal CA$250
-- conversion payments), so requiring a redundant numeric Campaign Fee here
-- was both unnecessary and the direct cause of a form bug where clearing
-- the field silently saved a fake $0 (or a corrupted value) instead of
-- leaving it genuinely blank. The existing check constraint (>= 0) still
-- applies to any non-null value; every other campaign_type continues to
-- require a real monthly_fee, enforced in the server actions
-- (updateAgreementDraftAction/sendAgreementAction), not by this column's
-- own nullability.
alter table public.crm_client_agreements
  alter column monthly_fee drop not null;

-- Clear the redundant/incorrect Campaign Fee on every staged agreement
-- that has one today. This never touches a non-staged agreement (e.g.
-- Web6 Solutions, whose single CA$750 Campaign Fee is its real, correct
-- term) and never touches staged_deposit_amount or any other stored
-- term - only the one field that should never have been required here.
update public.crm_client_agreements
set monthly_fee = null, updated_at = now()
where campaign_type = 'performance_based_first'
  and staged_deposit_amount is not null
  and monthly_fee is not null;
