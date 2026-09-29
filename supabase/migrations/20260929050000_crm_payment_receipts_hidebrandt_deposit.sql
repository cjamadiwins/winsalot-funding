-- Payment receipts for crm_payments + Hidebrandt Web Services' CA$250
-- initial campaign deposit (received Sept 29, 2026).
--
-- Purely additive: crm_payments gains nullable receipt/description/agreement
-- columns; no existing row, policy, or trigger is altered. crm_payments stays
-- admin-only under RLS - the client portal reads a client's own payments
-- server-side (scoped by the authenticated portal user's client, selecting only
-- client-safe columns), so internal notes/recorded_by are never exposed.

create table if not exists public.crm_receipt_number_counters (
  year int primary key,
  last_number int not null default 0
);
alter table public.crm_receipt_number_counters enable row level security;
create policy "crm_receipt_number_counters_admin_all" on public.crm_receipt_number_counters for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create or replace function public.next_crm_receipt_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from now())::int;
  next_num int;
begin
  insert into public.crm_receipt_number_counters (year, last_number)
  values (current_year, 1)
  on conflict (year) do update set last_number = public.crm_receipt_number_counters.last_number + 1
  returning last_number into next_num;
  return 'RCT-' || current_year || '-' || lpad(next_num::text, 4, '0');
end;
$$;
revoke execute on function public.next_crm_receipt_number() from public, anon, authenticated;

alter table public.crm_payments
  add column if not exists receipt_number text unique,
  add column if not exists payment_type text,
  add column if not exists description text,
  add column if not exists agreement_id uuid references public.crm_client_agreements(id) on delete set null,
  add column if not exists receipt_last_emailed_at timestamptz,
  add column if not exists receipt_last_emailed_to text,
  add column if not exists receipt_email_count int not null default 0;

create index if not exists crm_payments_agreement_idx on public.crm_payments(agreement_id);

-- Hidebrandt Web Services: reuse the existing crm_clients row, its signed
-- agreement (AGR-2026-0005) and its linked Lead Gen client - nothing is created
-- for the client/agreement/opportunity themselves. Idempotent.
do $$
declare
  v_client uuid := 'ead9a272-8a13-4554-a739-b934634cd677';
  v_agreement uuid := 'f4dd3e5a-67b9-4e0c-a97e-57791f766e95';
  v_leadgen uuid := '96e273dc-2570-4ac2-b383-e6eb4f508e7c';
  v_payment uuid;
  v_config uuid;
  paid_at timestamptz := '2026-09-29 12:00:00-04';
begin
  if not exists (select 1 from public.crm_clients where id = v_client and company_name = 'Hidebrandt Web Services') then
    return;
  end if;

  if not exists (select 1 from public.crm_payments where client_id = v_client and payment_type = 'initial_campaign_deposit' and reversed_at is null) then
    insert into public.crm_payments (
      client_id, invoice_id, agreement_id, payment_date, amount, currency, payment_method,
      payment_type, description, receipt_number, notes, recorded_by_name
    ) values (
      v_client, null, v_agreement, date '2026-09-29', 250.00, 'CAD', 'e_transfer',
      'initial_campaign_deposit', 'Initial Lead Generation Campaign Deposit', public.next_crm_receipt_number(),
      'Initial campaign deposit (1 of 3 staged payments, CA$750 total) per Agreement AGR-2026-0005. Status: Paid / Collected.',
      'Winsalot Admin'
    ) returning id into v_payment;

    insert into public.crm_activities (client_id, activity_type, notes)
    values (v_client, 'payment_recorded', 'Payment of CAD 250.00 (Initial Lead Generation Campaign Deposit) recorded, paid Sept 29, 2026 - Agreement AGR-2026-0005.');
  end if;

  update public.crm_client_agreements
  set staged_deposit_status = 'paid', staged_deposit_paid_at = coalesce(staged_deposit_paid_at, paid_at)
  where id = v_agreement and staged_deposit_status <> 'paid';

  -- Client-portal payment summary (staged: CA$250 deposit + 2 x CA$250 on qualifying conversions).
  select id into v_config from public.leadgen_client_payment_configs where client_id = v_leadgen;
  if v_config is null then
    insert into public.leadgen_client_payment_configs (
      client_id, payment_model, currency, total_campaign_fee, deposit_required,
      deposit_received, deposit_received_at, amount_paid, payment_status
    ) values (v_leadgen, 'staged', 'CAD', 750, 250, true, paid_at, 250, 'in_progress')
    returning id into v_config;

    insert into public.leadgen_client_payment_milestones (payment_config_id, client_id, milestone_order, label, amount, trigger_description, status, received_at) values
      (v_config, v_leadgen, 0, 'Initial Campaign Deposit', 250, 'Due at campaign start', 'received', paid_at),
      (v_config, v_leadgen, 1, 'First Qualifying Conversion', 250, 'Due on the first qualifying conversion', 'pending', null),
      (v_config, v_leadgen, 2, 'Second Qualifying Conversion', 250, 'Due on the second qualifying conversion', 'pending', null);
  end if;
end $$;
