-- Growth CRM Invoices: admin-only "Manage" (test-data cleanup) feature.
--
-- Winsalot Corp's own client record was created for internal testing
-- (see migration 0100's is_internal_test flag on crm_opportunities for
-- the same precedent) and its test invoice/payment must be fully,
-- permanently removable regardless of status - something the existing
-- canPermanentlyDeleteInvoice() rule deliberately forbids for real
-- financial records (Sent/Partially Paid/Paid invoices, or any invoice
-- with payment history). Rather than weakening that rule for every
-- invoice, this adds a narrow, explicitly-flagged escape hatch: only a
-- row with is_test_data = true may ever go through the "delete
-- regardless of status" path (enforced in application code, not just
-- the UI). Real invoices/payments keep the original, unchanged
-- protection and Activity History behavior.
alter table public.crm_invoices
  add column if not exists is_test_data boolean not null default false;

alter table public.crm_payments
  add column if not exists is_test_data boolean not null default false;

-- Flags the existing Winsalot Corp. test invoice/payment described in
-- the bug report (INV-2026-0003, CA$300 payment) without hardcoding
-- their IDs, matching 0100's own "match by name, not ID" precedent -
-- any future internal/test client is flagged the same way.
update public.crm_invoices i
set is_test_data = true
from public.crm_clients c
where c.id = i.client_id and c.company_name ilike 'winsalot corp%';

update public.crm_payments p
set is_test_data = true
from public.crm_clients c
where c.id = p.client_id and c.company_name ilike 'winsalot corp%';

-- ---------------------------------------------------------------------
-- crm_test_data_audit: a private, admin-only system audit log for
-- permanent test-data deletions. Deliberately separate from
-- crm_invoice_audit (which powers the invoice's own visible "Activity
-- History" panel) - a test-invoice/test-payment deletion must leave
-- exactly one private record of who deleted it, when, and that it was
-- identified as test data, WITHOUT that record ever surfacing in the
-- normal Activity History, dashboard, client record, or recent-activity
-- feed, and without affecting any financial report (this table is never
-- read by fetchInvoiceDashboardSummary or any other totals query).
-- ---------------------------------------------------------------------
create table if not exists public.crm_test_data_audit (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('invoice', 'payment')),
  record_number text not null,
  client_id uuid,
  client_name text not null,
  amount numeric(12, 2) not null,
  currency text not null,
  deleted_by uuid references public.crm_users(id) on delete set null,
  deleted_by_name text not null,
  deleted_at timestamptz not null default now(),
  note text not null default 'Identified as test data.'
);

create index if not exists crm_test_data_audit_deleted_at_idx on public.crm_test_data_audit(deleted_at desc);

alter table public.crm_test_data_audit enable row level security;

create policy "crm_test_data_audit_admin_all" on public.crm_test_data_audit for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');
