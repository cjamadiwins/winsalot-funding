-- "Set CAD as the default selection for every new client... Do not
-- remove USD because we may add American clients later." Restricts
-- currency on clients/invoices/payments to exactly these two values
-- (matching the new CAD/USD-only dropdown in the UI) and switches the
-- default for new rows from USD to CAD. Existing USD rows (the two
-- seeded clients, Brent's Essentials' historical payment) are
-- unaffected and remain valid under the new CHECK.

alter table public.crm_clients alter column currency set default 'CAD';
alter table public.crm_clients add constraint crm_clients_currency_check check (currency in ('CAD', 'USD'));

alter table public.crm_invoices alter column currency set default 'CAD';
alter table public.crm_invoices add constraint crm_invoices_currency_check check (currency in ('CAD', 'USD'));

alter table public.crm_payments alter column currency set default 'CAD';
alter table public.crm_payments add constraint crm_payments_currency_check check (currency in ('CAD', 'USD'));
