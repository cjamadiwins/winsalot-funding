-- Provider Invoices & Payments: lets an administrator invoice a provider
-- (money Winsalot bills a provider - e.g. lead/referral fees, platform
-- charges) and record payments received from that provider, inside the
-- existing operational Provider Profile (public.cleaning_providers,
-- migration 0004/0028). Every table here references cleaning_providers.id
-- directly - no new provider identity table, nothing that touches the
-- customer quote-assignment/copy-on-quote workflow (quote_requests,
-- provider_quote_tokens, provider_quote_submissions) at all.
--
-- Admin-only throughout: unlike provider_notes/provider_documents/etc.
-- (migration 0028), none of these tables get an agent RLS policy - the
-- brief is explicit that financial data is administrator-only for now, so
-- an agent (and certainly the public quote-submission flow, which never
-- authenticates as a crm_users row at all) gets zero rows here by RLS
-- default-deny.

-- ---------------------------------------------------------------------
-- Invoice numbering: INV-<year>-<0001>, atomically assigned, never
-- reused (a per-year counter that only ever increments - cancelling or
-- even deleting an invoice never frees its number back up).
-- ---------------------------------------------------------------------
create table if not exists public.provider_invoice_number_counters (
  year int primary key,
  last_number int not null default 0
);

alter table public.provider_invoice_number_counters enable row level security;

create policy "provider_invoice_number_counters_admin_all"
  on public.provider_invoice_number_counters for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- security definer so it can maintain the counter row regardless of the
-- calling admin's own RLS grants on this table - same pattern as
-- crm_followups_sync_lead_next_follow_up (migration 0011/0028).
create or replace function public.next_provider_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yr int := extract(year from now())::int;
  n int;
begin
  insert into public.provider_invoice_number_counters (year, last_number)
  values (yr, 1)
  on conflict (year) do update set last_number = provider_invoice_number_counters.last_number + 1
  returning last_number into n;

  return 'INV-' || yr || '-' || lpad(n::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- provider_invoices
-- ---------------------------------------------------------------------
create table if not exists public.provider_invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,
  updated_by uuid references public.crm_users(id) on delete set null,
  -- restrict, not cascade: a provider with billing history can be set
  -- Inactive/Suspended but should never be deletable out from under its
  -- invoices (deleteOperationalProviderAction is extended to check this
  -- explicitly too - this is the database-level backstop).
  cleaning_provider_id uuid not null references public.cleaning_providers(id) on delete restrict,
  invoice_number text not null unique default public.next_provider_invoice_number(),
  invoice_date date not null default current_date,
  due_date date not null,
  description text,
  status text not null default 'draft' check (status in (
    'draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'
  )),
  -- Sum of line items - maintained by provider_invoice_line_items'
  -- recalc trigger below, never written directly by application code.
  subtotal numeric(12,2) not null default 0,
  -- Flat CAD amounts entered directly by the administrator (this CRM has
  -- no tax-rate/jurisdiction table anywhere else, so a percentage engine
  -- would be new surface area outside the brief) - both optional, default
  -- to 0.
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  -- Generated, not application-written: always subtotal - discount + tax,
  -- so it can never drift from its inputs regardless of which column
  -- changed (a line item, or the admin editing discount/tax directly).
  total numeric(12,2) generated always as (subtotal - discount_amount + tax_amount) stored,
  -- Sum of non-reversed payments - maintained by provider_payments'
  -- recalc trigger below, never written directly by application code.
  amount_paid numeric(12,2) not null default 0,
  balance numeric(12,2) generated always as (subtotal - discount_amount + tax_amount - amount_paid) stored,
  internal_notes text,
  payment_instructions text,
  sent_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.crm_users(id) on delete set null,
  cancel_reason text
);

create index if not exists provider_invoices_cleaning_provider_idx on public.provider_invoices(cleaning_provider_id, invoice_date desc);
create index if not exists provider_invoices_status_idx on public.provider_invoices(status);
create index if not exists provider_invoices_due_date_idx on public.provider_invoices(due_date);

alter table public.provider_invoices enable row level security;

create policy "provider_invoices_admin_all"
  on public.provider_invoices for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- provider_invoice_line_items
-- ---------------------------------------------------------------------
create table if not exists public.provider_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  invoice_id uuid not null references public.provider_invoices(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored,
  sort_order int not null default 0
);

create index if not exists provider_invoice_line_items_invoice_idx on public.provider_invoice_line_items(invoice_id, sort_order);

alter table public.provider_invoice_line_items enable row level security;

create policy "provider_invoice_line_items_admin_all"
  on public.provider_invoice_line_items for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Keeps provider_invoices.subtotal (and therefore the generated total/
-- balance columns) in sync with its line items automatically, the same
-- "trigger maintains a denormalized total" pattern already used for
-- next_follow_up_at (migration 0011/0028).
create or replace function public.provider_invoices_recalc_line_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  new_subtotal numeric(12,2);
begin
  select coalesce(sum(quantity * unit_price), 0) into new_subtotal
  from public.provider_invoice_line_items
  where invoice_id = target_invoice_id;

  update public.provider_invoices
  set subtotal = new_subtotal, updated_at = now()
  where id = target_invoice_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists provider_invoice_line_items_recalc on public.provider_invoice_line_items;
create trigger provider_invoice_line_items_recalc
  after insert or update or delete on public.provider_invoice_line_items
  for each row execute function public.provider_invoices_recalc_line_items();

-- ---------------------------------------------------------------------
-- provider_payments
-- ---------------------------------------------------------------------
create table if not exists public.provider_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invoice_id uuid not null references public.provider_invoices(id) on delete restrict,
  -- Denormalized from the invoice at write time so the admin dashboard
  -- and the provider's financial summary can query payments directly by
  -- provider without a join, and so RLS could be scoped per-provider in
  -- the future without restructuring this table.
  cleaning_provider_id uuid not null references public.cleaning_providers(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in (
    'e_transfer', 'credit_card', 'bank_transfer', 'cash', 'cheque', 'other'
  )),
  reference_number text,
  notes text,
  recorded_by uuid references public.crm_users(id) on delete set null,
  -- Denormalized display name, same rationale as provider_notes.author_name
  -- (migration 0028) - crm_users_select_self means an admin can't resolve
  -- another admin's name via a join from their own session.
  recorded_by_name text not null,
  -- Optional receipt, stored in the existing private provider-files
  -- bucket (no new bucket, no storage.objects policies - same
  -- service-role-only convention as every other document in this app).
  attachment_path text,
  -- A reversed payment is never deleted (full audit trail) - it's simply
  -- excluded from amount_paid going forward. See
  -- provider_invoices_recalc_payments() below and
  -- provider_payment_adjustments for the corresponding audit row.
  reversed_at timestamptz,
  reversed_by uuid references public.crm_users(id) on delete set null,
  reversal_reason text
);

create index if not exists provider_payments_invoice_idx on public.provider_payments(invoice_id, payment_date desc);
create index if not exists provider_payments_cleaning_provider_idx on public.provider_payments(cleaning_provider_id, payment_date desc);

alter table public.provider_payments enable row level security;

create policy "provider_payments_admin_all"
  on public.provider_payments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Keeps provider_invoices.amount_paid (and its status) in sync with
-- non-reversed payments automatically. Only ever promotes status forward
-- on a new/growing payment total, or drops back to 'sent' when the paid
-- total returns to zero (e.g. every payment on the invoice gets
-- reversed) - it never touches a 'draft' or 'cancelled' invoice's status
-- beyond that, and a fully-cancelled invoice's status is left alone
-- entirely so cancelOperationalInvoiceAction stays the only way to set
-- or clear that state.
create or replace function public.provider_invoices_recalc_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  new_amount_paid numeric(12,2);
  invoice_total numeric(12,2);
  current_status text;
  computed_status text;
begin
  select coalesce(sum(amount), 0) into new_amount_paid
  from public.provider_payments
  where invoice_id = target_invoice_id and reversed_at is null;

  select total, status into invoice_total, current_status
  from public.provider_invoices where id = target_invoice_id;

  if current_status = 'cancelled' then
    computed_status := current_status;
  elsif new_amount_paid <= 0 then
    computed_status := case when current_status in ('paid', 'partially_paid', 'overdue') then 'sent' else current_status end;
  elsif invoice_total > 0 and new_amount_paid >= invoice_total then
    computed_status := 'paid';
  else
    computed_status := 'partially_paid';
  end if;

  update public.provider_invoices
  set amount_paid = new_amount_paid, status = computed_status, updated_at = now()
  where id = target_invoice_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists provider_payments_recalc on public.provider_payments;
create trigger provider_payments_recalc
  after insert or update or delete on public.provider_payments
  for each row execute function public.provider_invoices_recalc_payments();

-- ---------------------------------------------------------------------
-- provider_payment_adjustments: audit trail for a correction or
-- reversal of a previously recorded payment (brief section 5 - "require
-- a reason... an activity-log entry showing the original and updated
-- values"). The crm_activities entry logged alongside this is the
-- human-readable summary; this table is the structured before/after
-- record.
-- ---------------------------------------------------------------------
create table if not exists public.provider_payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  payment_id uuid not null references public.provider_payments(id) on delete cascade,
  invoice_id uuid not null references public.provider_invoices(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in ('correction', 'reversal')),
  reason text not null,
  previous_values jsonb not null,
  new_values jsonb not null,
  performed_by uuid references public.crm_users(id) on delete set null,
  performed_by_name text not null
);

create index if not exists provider_payment_adjustments_payment_idx on public.provider_payment_adjustments(payment_id, created_at desc);
create index if not exists provider_payment_adjustments_invoice_idx on public.provider_payment_adjustments(invoice_id, created_at desc);

alter table public.provider_payment_adjustments enable row level security;

create policy "provider_payment_adjustments_admin_all"
  on public.provider_payment_adjustments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- crm_activities: new system-logged activity types for invoice/payment
-- events, purely additive to the check constraint exactly like migration
-- 0028 did for status_change/assignment_change/etc. - every activity
-- type already in use is untouched. These are only ever written by the
-- invoice/payment server actions below, never offered in the manual "Log
-- Activity" dropdown.
-- ---------------------------------------------------------------------
alter table public.crm_activities drop constraint if exists crm_activities_activity_type_check;
alter table public.crm_activities add constraint crm_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'text', 'voicemail', 'note', 'outcome',
    'status_change', 'assignment_change',
    'quote_invited', 'quote_submitted', 'quote_accepted', 'quote_declined',
    'score_change',
    'invoice_created', 'invoice_sent', 'invoice_cancelled',
    'payment_recorded', 'payment_corrected', 'payment_reversed'
  ));

-- ---------------------------------------------------------------------
-- Lock down the new SECURITY DEFINER functions to exactly the callers
-- that need them, rather than leaving them open to every authenticated
-- (or anonymous) role by default.
-- ---------------------------------------------------------------------
-- Trigger functions are only ever invoked by the trigger mechanism
-- itself, never directly by a client - no role needs EXECUTE on them.
revoke execute on function public.provider_invoices_recalc_line_items() from public, anon, authenticated;
revoke execute on function public.provider_invoices_recalc_payments() from public, anon, authenticated;

-- next_provider_invoice_number() is only ever invoked implicitly as
-- provider_invoices.invoice_number's column default during an
-- admin-gated insert (RLS on provider_invoices still blocks anyone else
-- from actually inserting a row) - `authenticated` needs EXECUTE for
-- that default to evaluate, but anonymous callers have no legitimate
-- reason to hit this RPC directly.
revoke execute on function public.next_provider_invoice_number() from anon;
