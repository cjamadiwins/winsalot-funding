-- Winsalot Growth CRM: Clients & Invoices.
--
-- A brand-new, fully independent admin-only subsystem for tracking
-- Winsalot Corp's own paying client accounts (distinct from
-- crm_opportunities, which is the sales pipeline of *prospective*
-- consultations/financing - a client here is an account that has
-- actually been signed, billed, and serviced). Entirely additive:
-- no existing table is altered except crm_activities, which only gains
-- two new nullable foreign keys and an extended check constraint (same
-- technique every prior migration has used to grow that table - see
-- 0082, 0088). Nothing here touches winsalot_appointments,
-- leadgen_appointments, crm_opportunities, payroll, attendance,
-- performance, incentives, or auth in any way, and none of it is wired
-- into the Lead Gen CRM or the Cleaning CRM.
--
-- Naming deliberately avoids the retired `provider_invoices` /
-- `provider_invoice_line_items` / `provider_payments` table names
-- (migration 0029, dead at the application layer per that migration's
-- own precedent of freezing rather than dropping retired tables) - new
-- tables here use this CRM's own `crm_` prefix throughout
-- (crm_clients, crm_invoices, ...), matching crm_opportunities/
-- crm_activities/crm_users, not the retired naming.
--
-- Every table is RLS-enabled, admin-only (single `_admin_all` policy,
-- no agent policy at all) - the same design already used for the
-- retired provider_invoices ("financial data is administrator-only")
-- and required by this feature's own brief ("Agents must never see
-- client pricing, invoices, payments, revenue, balances, billing
-- details, or other financial information"). Agents get a narrow,
-- read-only, non-financial view of their own assigned *active* clients
-- through a SECURITY DEFINER function (crm_agent_visible_clients)
-- instead of direct table access - RLS alone can filter *rows*, not
-- *columns*, and an agent's own valid session JWT can query Supabase's
-- REST API directly regardless of what the Next.js UI shows, so column-
-- level secrecy has to be enforced in Postgres itself, not just by what
-- query the app chooses to run. The function's own SQL only ever
-- selects non-financial columns, so no financial column can leak
-- through it structurally, no matter how it's called.

-- ---------------------------------------------------------------------
-- crm_clients
-- ---------------------------------------------------------------------
create table if not exists public.crm_clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,

  company_name text not null,
  primary_contact_name text,
  email text,
  phone text,
  website text,
  billing_address text,

  service text,
  monthly_price numeric(12, 2),
  currency text not null default 'USD',

  start_date date,
  renewal_date date,

  status text not null default 'Prospect' check (status in (
    'Prospect', 'Pilot', 'Active', 'Paused', 'Completed', 'Archived'
  )),
  -- Captured at the moment of archiving so "Reactivate" can restore the
  -- exact prior status rather than always landing back on 'Active'.
  pre_archive_status text check (pre_archive_status in (
    'Prospect', 'Pilot', 'Active', 'Paused', 'Completed'
  )),

  internal_notes text,

  archived_at timestamptz,
  archived_by uuid references public.crm_users(id) on delete set null
);

create index if not exists crm_clients_status_idx on public.crm_clients(status);
create index if not exists crm_clients_company_name_idx on public.crm_clients(company_name);

alter table public.crm_clients enable row level security;

create policy "crm_clients_admin_all" on public.crm_clients for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- crm_client_agents: many-to-many assigned-agents, since a client
-- profile lists "Assigned agents" (plural) rather than one owner.
-- ---------------------------------------------------------------------
create table if not exists public.crm_client_agents (
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  agent_id uuid not null references public.crm_users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.crm_users(id) on delete set null,
  primary key (client_id, agent_id)
);

create index if not exists crm_client_agents_agent_idx on public.crm_client_agents(agent_id);

alter table public.crm_client_agents enable row level security;

create policy "crm_client_agents_admin_all" on public.crm_client_agents for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- crm_client_appointments: a lightweight log of service-delivery
-- appointments/sessions the CRM has actually delivered for a signed
-- client - deliberately separate from winsalot_appointments (which is
-- the public consultation-*booking* system for prospects, an entirely
-- different concept and lifecycle). This is what "Appointments
-- delivered" on a client profile and "connect appointments... to the
-- appropriate client" refer to for this feature.
-- ---------------------------------------------------------------------
create table if not exists public.crm_client_appointments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  agent_id uuid references public.crm_users(id) on delete set null,
  appointment_date date not null default current_date,
  notes text,
  created_by uuid references public.crm_users(id) on delete set null
);

create index if not exists crm_client_appointments_client_idx on public.crm_client_appointments(client_id, appointment_date desc);

alter table public.crm_client_appointments enable row level security;

create policy "crm_client_appointments_admin_all" on public.crm_client_appointments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Invoice numbering: same atomic-counter technique as the retired
-- provider_invoices' next_provider_invoice_number() (migration 0029) -
-- a per-year counter row, incremented via INSERT ... ON CONFLICT ...
-- DO UPDATE ... RETURNING so concurrent inserts can never collide.
-- ---------------------------------------------------------------------
create table if not exists public.crm_invoice_number_counters (
  year int primary key,
  last_number int not null default 0
);

alter table public.crm_invoice_number_counters enable row level security;

create policy "crm_invoice_number_counters_admin_all" on public.crm_invoice_number_counters for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create or replace function public.next_crm_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from now())::int;
  next_num int;
begin
  insert into public.crm_invoice_number_counters (year, last_number)
  values (current_year, 1)
  on conflict (year) do update set last_number = public.crm_invoice_number_counters.last_number + 1
  returning last_number into next_num;

  return 'INV-' || current_year || '-' || lpad(next_num::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- crm_invoices
--
-- subtotal is maintained by a trigger off crm_invoice_line_items (never
-- written directly by application code); tax_amount/total/balance are
-- generated columns computed from base columns only (never from each
-- other - Postgres generated columns cannot reference another generated
-- column) so they can never drift out of sync with subtotal/discount/
-- tax_rate/amount_paid. tax_rate is an admin-selected percentage
-- (e.g. 13.00 for 13%) - never assumed or defaulted to anything but 0,
-- per the brief's "Do not calculate or assume taxes automatically
-- without an admin-selected tax rate."
-- ---------------------------------------------------------------------
create table if not exists public.crm_invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,
  updated_by uuid references public.crm_users(id) on delete set null,

  client_id uuid not null references public.crm_clients(id) on delete restrict,
  invoice_number text not null unique default public.next_crm_invoice_number(),

  billing_contact_name text,
  billing_address text,

  issue_date date not null default current_date,
  due_date date,
  service_period_start date,
  service_period_end date,

  currency text not null default 'USD',
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),

  subtotal numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) generated always as (round((subtotal - discount_amount) * tax_rate / 100, 2)) stored,
  total numeric(12, 2) generated always as (
    (subtotal - discount_amount) + round((subtotal - discount_amount) * tax_rate / 100, 2)
  ) stored,
  amount_paid numeric(12, 2) not null default 0,
  balance numeric(12, 2) generated always as (
    (subtotal - discount_amount) + round((subtotal - discount_amount) * tax_rate / 100, 2) - amount_paid
  ) stored,

  status text not null default 'Draft' check (status in (
    'Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled', 'Archived'
  )),

  payment_instructions text,
  admin_notes text,
  client_facing_notes text,

  -- first_sent_at/last_sent_at/last_reminder_at distinguish "the very
  -- first send" (brief: "every first send must require deliberate admin
  -- confirmation") from a resend/reminder (brief: "must not create a
  -- duplicate invoice" - resend and reminder always operate on this
  -- exact same row, never insert a new one).
  first_sent_at timestamptz,
  last_sent_at timestamptz,
  last_reminder_at timestamptz,

  cancelled_at timestamptz,
  cancelled_by uuid references public.crm_users(id) on delete set null,
  cancel_reason text,

  archived_at timestamptz
);

create index if not exists crm_invoices_client_idx on public.crm_invoices(client_id);
create index if not exists crm_invoices_status_idx on public.crm_invoices(status);
create index if not exists crm_invoices_due_date_idx on public.crm_invoices(due_date);
create index if not exists crm_invoices_issue_date_idx on public.crm_invoices(issue_date);

alter table public.crm_invoices enable row level security;

create policy "crm_invoices_admin_all" on public.crm_invoices for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- crm_invoice_line_items
-- ---------------------------------------------------------------------
create table if not exists public.crm_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  invoice_id uuid not null references public.crm_invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12, 2) not null default 1 check (quantity >= 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  line_total numeric(12, 2) generated always as (quantity * unit_price) stored,
  sort_order int not null default 0
);

create index if not exists crm_invoice_line_items_invoice_idx on public.crm_invoice_line_items(invoice_id, sort_order);

alter table public.crm_invoice_line_items enable row level security;

create policy "crm_invoice_line_items_admin_all" on public.crm_invoice_line_items for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Keeps crm_invoices.subtotal always equal to the sum of its own line
-- items' line_total - application code never writes subtotal directly.
create or replace function public.crm_invoices_recalc_line_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  new_subtotal numeric(12, 2);
begin
  select coalesce(sum(line_total), 0) into new_subtotal
  from public.crm_invoice_line_items
  where invoice_id = target_invoice_id;

  update public.crm_invoices
  set subtotal = new_subtotal, updated_at = now()
  where id = target_invoice_id;

  return coalesce(new, old);
end;
$$;

create trigger crm_invoice_line_items_recalc
  after insert or update or delete on public.crm_invoice_line_items
  for each row execute function public.crm_invoices_recalc_line_items();

-- ---------------------------------------------------------------------
-- crm_payments
--
-- invoice_id is nullable on purpose: the brief requires recording
-- Brent's Essentials' existing $750 as a historical payment "but do not
-- automatically create or send an invoice" - a payment must be able to
-- exist against a client with no invoice at all.
-- ---------------------------------------------------------------------
create table if not exists public.crm_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invoice_id uuid references public.crm_invoices(id) on delete restrict,
  client_id uuid not null references public.crm_clients(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'USD',
  payment_method text check (payment_method in (
    'e_transfer', 'credit_card', 'bank_transfer', 'cash', 'cheque', 'other'
  )),
  reference_number text,
  notes text,
  recorded_by uuid references public.crm_users(id) on delete set null,
  recorded_by_name text not null,
  reversed_at timestamptz,
  reversed_by uuid references public.crm_users(id) on delete set null,
  reversal_reason text
);

create index if not exists crm_payments_client_idx on public.crm_payments(client_id, payment_date desc);
create index if not exists crm_payments_invoice_idx on public.crm_payments(invoice_id);

alter table public.crm_payments enable row level security;

create policy "crm_payments_admin_all" on public.crm_payments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Keeps crm_invoices.amount_paid (and status, for the Sent/Partially
-- Paid/Paid transitions only - never touches Draft/Cancelled/Archived)
-- in sync with its own non-reversed payments. A standalone payment
-- (invoice_id null) never touches any invoice.
create or replace function public.crm_invoices_recalc_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  new_amount_paid numeric(12, 2);
  inv record;
  invoice_total numeric(12, 2);
begin
  if target_invoice_id is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(amount), 0) into new_amount_paid
  from public.crm_payments
  where invoice_id = target_invoice_id and reversed_at is null;

  select * into inv from public.crm_invoices where id = target_invoice_id;
  if not found then
    return coalesce(new, old);
  end if;

  invoice_total := (inv.subtotal - inv.discount_amount) + round((inv.subtotal - inv.discount_amount) * inv.tax_rate / 100, 2);

  update public.crm_invoices
  set amount_paid = new_amount_paid,
      status = case
        when inv.status in ('Draft', 'Cancelled', 'Archived') then inv.status
        when new_amount_paid <= 0 then 'Sent'
        when new_amount_paid >= invoice_total then 'Paid'
        else 'Partially Paid'
      end,
      updated_at = now()
  where id = target_invoice_id;

  return coalesce(new, old);
end;
$$;

create trigger crm_payments_recalc_invoice
  after insert or update or delete on public.crm_payments
  for each row execute function public.crm_invoices_recalc_payments();

-- ---------------------------------------------------------------------
-- crm_invoice_audit: a permanent, append-only, denormalized audit
-- ledger - same design as winsalot_agent_incentive_audit (migration
-- 0059): identity/invoice_number duplicated onto the row so it stays
-- meaningful even if the invoice itself is later deleted (a Draft with
-- no activity can still be permanently deleted per the brief; its audit
-- rows persist as the historical record that it existed and was
-- removed).
-- ---------------------------------------------------------------------
create table if not exists public.crm_invoice_audit (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.crm_invoices(id) on delete set null,
  client_id uuid,
  invoice_number text not null,
  action text not null check (action in (
    'created', 'draft_saved', 'edited', 'duplicated', 'sent', 'resent', 'reminder_sent',
    'payment_recorded', 'payment_reversed', 'marked_paid', 'marked_partially_paid',
    'cancelled', 'archived', 'unarchived', 'pdf_downloaded', 'deleted'
  )),
  details text,
  performed_by_name text not null,
  occurred_at timestamptz not null default now()
);

create index if not exists crm_invoice_audit_invoice_idx on public.crm_invoice_audit(invoice_id, occurred_at desc);
create index if not exists crm_invoice_audit_client_idx on public.crm_invoice_audit(client_id, occurred_at desc);

alter table public.crm_invoice_audit enable row level security;

create policy "crm_invoice_audit_admin_all" on public.crm_invoice_audit for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- crm_invoice_emails: delivery tracking for invoice-send/reminder
-- emails, same shape and RLS convention as crm_lead_emails (migration
-- 0022) - "legacy" service-role-only pattern (RLS enabled, no policies
-- at all), since it's internal delivery bookkeeping the admin session
-- client never needs to query directly (the invoice/audit rows above
-- already carry what the UI shows). The existing Resend webhook route
-- is extended (application code, not this migration) to also match
-- resend_email_id against this table.
-- ---------------------------------------------------------------------
create table if not exists public.crm_invoice_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  invoice_id uuid not null references public.crm_invoices(id) on delete cascade,
  resend_email_id text not null unique,
  email_type text not null check (email_type in ('invoice_sent', 'invoice_reminder')),
  to_email text not null,
  status text not null default 'sent' check (status in (
    'sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked'
  )),
  status_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  delayed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz
);

create index if not exists crm_invoice_emails_invoice_idx on public.crm_invoice_emails(invoice_id, created_at desc);
create index if not exists crm_invoice_emails_resend_id_idx on public.crm_invoice_emails(resend_email_id);

alter table public.crm_invoice_emails enable row level security;

-- ---------------------------------------------------------------------
-- crm_activities: extend to also anchor to a client or invoice, exactly
-- the same additive technique 0082 used to add opportunity_id here
-- alongside the original lead_id. A client profile's "Activity history"
-- and an invoice's own timeline both read from this same table, filtered
-- by client_id/invoice_id, rather than duplicating a second narrative
-- log - crm_invoice_audit above is the structured, immutable compliance
-- ledger; crm_activities is the human-readable feed shown in the UI.
-- ---------------------------------------------------------------------
alter table public.crm_activities
  add column if not exists client_id uuid references public.crm_clients(id) on delete cascade,
  add column if not exists invoice_id uuid references public.crm_invoices(id) on delete cascade;

create index if not exists crm_activities_client_idx on public.crm_activities(client_id);
create index if not exists crm_activities_invoice_idx on public.crm_activities(invoice_id);

alter table public.crm_activities drop constraint if exists crm_activities_activity_type_check;
alter table public.crm_activities add constraint crm_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'text', 'voicemail', 'note', 'outcome',
    'consultation_booked', 'consultation_rescheduled', 'consultation_cancelled',
    'client_created', 'client_updated', 'client_archived', 'client_reactivated',
    'client_deleted', 'client_agent_assigned', 'client_agent_unassigned',
    'invoice_created', 'invoice_sent', 'invoice_reminder_sent', 'invoice_cancelled',
    'invoice_archived', 'payment_recorded', 'payment_reversed'
  ));

-- ---------------------------------------------------------------------
-- crm_agent_visible_clients: the agent-facing, non-financial,
-- assigned-and-active-only view described above. SECURITY DEFINER so it
-- can read crm_clients/crm_client_agents (both admin-only by RLS)
-- without granting agents any RLS access to the underlying tables at
-- all - the only rows/columns an agent can ever see are exactly what
-- this function's own SELECT list names.
-- ---------------------------------------------------------------------
create or replace function public.crm_agent_visible_clients()
returns table (
  id uuid,
  company_name text,
  primary_contact_name text,
  service text,
  status text,
  start_date date
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.company_name, c.primary_contact_name, c.service, c.status, c.start_date
  from public.crm_clients c
  join public.crm_client_agents ca on ca.client_id = c.id
  where ca.agent_id = auth.uid() and c.status = 'Active';
$$;

revoke all on function public.crm_agent_visible_clients() from public;
grant execute on function public.crm_agent_visible_clients() to authenticated;

-- ---------------------------------------------------------------------
-- Seed the two real current clients named in the brief. Every detail
-- not explicitly given is left null/editable ("Leave any unknown
-- details editable for admin verification") rather than guessed.
-- Neither seed creates or sends an invoice, per the brief.
-- ---------------------------------------------------------------------
insert into public.crm_clients (id, company_name, service, status, currency)
values ('00000000-0000-0000-0000-0000000ba001'::uuid, 'Brent''s Essentials', 'Lead generation and appointment setting', 'Active', 'USD')
on conflict (id) do nothing;

insert into public.crm_clients (id, company_name, service, status, monthly_price, currency)
values ('00000000-0000-0000-0000-0000000ba002'::uuid, 'Mantra Collab', 'Lead generation and appointment setting', 'Pilot', 600, 'USD')
on conflict (id) do nothing;

-- Brent's Essentials' existing $750 - recorded as a historical payment
-- only (no invoice_id), never marked as tied to an invoice, per the
-- brief. recorded_by is left null (no specific admin performed this
-- historically) with a clear note explaining why.
insert into public.crm_payments (client_id, invoice_id, payment_date, amount, currency, notes, recorded_by, recorded_by_name)
select '00000000-0000-0000-0000-0000000ba001'::uuid, null, current_date, 750, 'USD',
  'Historical payment recorded during Clients/Invoices system setup - no invoice was issued for this payment.',
  null, 'System (migration seed)'
where not exists (
  select 1 from public.crm_payments where client_id = '00000000-0000-0000-0000-0000000ba001'::uuid and amount = 750 and invoice_id is null
);
