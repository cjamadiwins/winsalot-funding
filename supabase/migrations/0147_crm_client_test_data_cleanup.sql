-- Growth CRM Clients: admin-only permanent deletion of test clients.
--
-- Mirrors is_test_data on crm_invoices/crm_payments (migration 0103): a
-- client explicitly flagged is_test_data may be permanently deleted
-- together with everything hanging off it (activities, appointments,
-- agent assignments, and any test invoices/payments) - a path
-- deleteClientAction's related-records guard otherwise forbids for any
-- client with real history. Real clients never carry this flag (it is
-- not exposed on the create/edit client forms) and keep the original
-- archive-first protection unchanged.
alter table public.crm_clients
  add column if not exists is_test_data boolean not null default false;

-- crm_test_data_audit already exists (migration 0103) for invoice/
-- payment test-data deletions; widen it to also record client
-- deletions through the same private, admin-only trail.
alter table public.crm_test_data_audit
  drop constraint if exists crm_test_data_audit_record_type_check;
alter table public.crm_test_data_audit
  add constraint crm_test_data_audit_record_type_check
  check (record_type in ('invoice', 'payment', 'client'));

-- Flags the one-off "Win" / Chijioke Amadi client as test data (created
-- while manually testing the invoice Rate fix, matched by its specific
-- name+contact rather than a hardcoded id, per this file's own "match by
-- name" precedent) so it goes through the new, audited test-client
-- delete path instead of being deleted directly by this migration.
update public.crm_clients
set is_test_data = true
where company_name = 'Win' and primary_contact_name = 'Chijioke Amadi';
