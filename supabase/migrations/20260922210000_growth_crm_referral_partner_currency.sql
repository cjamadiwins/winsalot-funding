-- Winsalot Growth CRM: Referral Partner currency snapshots.
--
-- migration 20260922120000 (crm_subcontractor_referral_revenue /
-- crm_subcontractor_lending_referrals) recorded every dollar amount as a
-- bare numeric with no currency of its own - fine while every referral
-- partner's reporting currency was implicitly USD, but Tony's own
-- reporting currency is CAD ("make CAD the default currency for Tony's
-- financial records, commissions, revenue, payouts, and reporting").
-- crm_subcontractors.currency (migration 0135) already lets a partner
-- have their own currency; this migration threads it through onto each
-- ledger row, the same currency_snapshot pattern
-- crm_subcontractor_payments already uses for Contractors (migration
-- 0136) - "historical records should not change when the subcontractor's
-- future rate/currency changes."
--
-- Purely additive: both new columns are NOT NULL with a default so every
-- row created by the prior migration (none exist yet in production) and
-- every future row remains valid; no existing column, row, policy, or
-- constraint is altered.

alter table public.crm_subcontractor_referral_revenue
  add column if not exists currency_snapshot text not null default 'USD'
    check (currency_snapshot in ('NGN', 'PHP', 'CAD', 'USD', 'GBP', 'EUR'));

alter table public.crm_subcontractor_lending_referrals
  add column if not exists currency_snapshot text not null default 'USD'
    check (currency_snapshot in ('NGN', 'PHP', 'CAD', 'USD', 'GBP', 'EUR'));
