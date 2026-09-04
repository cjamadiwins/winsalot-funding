-- Expands the set of currencies an agent's Payroll Currency
-- (crm_users.payroll_currency / leadgen_users.payroll_currency, migration
-- 0134) can be set to, from 4 (NGN/PHP/CAD/USD) to 10, adding GBP, EUR,
-- GHS, KES, ZAR, INR. Purely a currency configuration/display change -
-- this touches only the check constraint's allowed value list. It does
-- not add, remove, or rename a column, does not touch a default (still
-- 'NGN'), and does not write to a single existing row: every current
-- agent keeps whatever payroll_currency it already has (Nigerian agents
-- remain on 'NGN'), and crm_payroll/leadgen_payroll/holidays/
-- holiday_pay_assignments/crm_subcontractor_payments are untouched, since
-- none of them store a currency of their own (see src/lib/payroll.ts's
-- header comment on formatCurrency - there is no FX conversion anywhere
-- in this codebase, so widening the allowed set changes nothing about how
-- any existing payroll figure was already computed or stored).

alter table public.crm_users drop constraint if exists crm_users_payroll_currency_check;
alter table public.crm_users
  add constraint crm_users_payroll_currency_check
  check (payroll_currency in ('NGN', 'PHP', 'CAD', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR', 'INR'));

alter table public.leadgen_users drop constraint if exists leadgen_users_payroll_currency_check;
alter table public.leadgen_users
  add constraint leadgen_users_payroll_currency_check
  check (payroll_currency in ('NGN', 'PHP', 'CAD', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR', 'INR'));
