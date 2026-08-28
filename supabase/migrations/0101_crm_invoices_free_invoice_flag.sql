-- Growth CRM Invoices: a $0.00 invoice was silently created (and even
-- sent to a client) because createInvoiceAction had no server-side check
-- that at least one line item with a real quantity/rate had actually
-- been saved before the invoice left Draft - the create form's own
-- "line_items" field simply came through empty on that attempt, and
-- nothing on the server noticed.
--
-- Adds an explicit is_free_invoice flag so a genuinely complimentary
-- invoice can still be created and sent with a $0 total on purpose.
-- Application code (src/app/admin/(dashboard)/crm/invoices/actions.ts)
-- now rejects any other $0 invoice at creation, edit, and send time via
-- invoiceNeedsFreeConfirmation() (src/lib/crm-invoices-types.ts). Purely
-- additive - no existing invoice's meaning changes (all default to
-- false, i.e. "not marked free", which is what every existing invoice
-- already is).
alter table public.crm_invoices
  add column if not exists is_free_invoice boolean not null default false;
