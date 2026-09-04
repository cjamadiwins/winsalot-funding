-- Per-agent Payroll Currency: an admin-controlled field on each agent's own
-- profile (crm_users / leadgen_users) that drives which currency their
-- payroll displays and calculations use, independent of a holiday's
-- jurisdiction (Canada/Ontario stays a calendar choice; payroll_currency is
-- what that specific person is actually paid in). Deliberately NOT derived
-- from country/location, and there is no FX conversion anywhere in this
-- codebase - every payroll figure (base pay, deductions, holiday pay,
-- adjustments) is already a plain number computed once and simply
-- formatted/labelled in the agent's chosen currency, never recalculated
-- across currencies. See src/lib/payroll.ts's formatCurrency.
--
-- Smallest safe change: one column per user table, defaulted and backfilled
-- to 'NGN' so every existing agent (all Nigeria-based today) keeps behaving
-- exactly as before. No existing column, table, or payroll/holiday-pay
-- record is touched - crm_payroll/leadgen_payroll and holidays/
-- holiday_pay_assignments keep storing plain numbers with no currency of
-- their own; the currency shown for any of them is always looked up live
-- from the *agent's* payroll_currency at display time (see AdminPayrollClient,
-- MyPayView, HolidayPayAdminSection, HolidayPaySection), which is also what
-- makes "Payroll history" and "Final Amount Payable" correctly follow an
-- agent's currency per the brief, without rewriting any historical row.

alter table public.crm_users
  add column if not exists payroll_currency text not null default 'NGN'
    check (payroll_currency in ('NGN', 'PHP', 'CAD', 'USD'));

alter table public.leadgen_users
  add column if not exists payroll_currency text not null default 'NGN'
    check (payroll_currency in ('NGN', 'PHP', 'CAD', 'USD'));

-- Explicit backfill (belt-and-suspenders alongside the column default
-- above) - every current agent in both CRMs is Nigeria-based today, so
-- every existing row should read 'NGN' after this migration.
update public.crm_users set payroll_currency = 'NGN' where payroll_currency is null;
update public.leadgen_users set payroll_currency = 'NGN' where payroll_currency is null;
