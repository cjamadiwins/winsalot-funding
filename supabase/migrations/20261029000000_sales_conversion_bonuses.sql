-- Sales Conversion Bonus (Lead Generation CRM + Growth CRM centralized payroll).
--
-- CA$50 per appointment that Admin confirms resulted in a sale, credited to
-- the agent who booked it (leadgen_appointments.booking_agent_id - the same
-- "credited agent" the Agent Performance Report and Weekly Incentive use).
--
-- Two funding models, configured per client in winsalot_sales_bonus_programs:
--   client_funded   (Teknokraft Canada Inc.)  - the client owes Winsalot the
--                   CA$50 (tracked as a receivable until received); Winsalot
--                   still pays the agent through centralized payroll.
--   winsalot_funded (Hidebrandt Web Services) - Winsalot funds and pays the
--                   bonus; recorded as a Winsalot bonus expense.
-- Client payment status and agent payment status are two independent
-- columns: the agent is paid on Winsalot's own approval, never because (or
-- only when) the client paid, and nothing is ever marked paid automatically.
--
-- Purely additive. No existing appointment, payroll, campaign, client or
-- agent-assignment row is altered; crm_payroll/leadgen_payroll are untouched,
-- so existing salary arrangements and finalized payroll records are
-- unchanged. Bonuses live in the shared `winsalot_` namespace (like the
-- weekly incentive ledger and the shared payroll view) so both CRMs'
-- admins see one record, and are paid in their own currency (CAD) rather
-- than being folded into a salary record that may be in another currency.
--
-- Depends on 20261002204301_shared_payroll_register_access.sql for
-- winsalot_payroll_admin()/winsalot_payroll_agent().

-- ---------------------------------------------------------------------
-- Programs: which clients pay a bonus, how much, and who funds it.
-- ---------------------------------------------------------------------
create table public.winsalot_sales_bonus_programs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null unique references public.leadgen_clients(id) on delete cascade,
  funding_model text not null check (funding_model in ('client_funded', 'winsalot_funded')),
  bonus_amount numeric(12, 2) not null default 50 check (bonus_amount > 0),
  currency text not null default 'CAD' check (currency = 'CAD'),
  active boolean not null default true
);

insert into public.winsalot_sales_bonus_programs (client_id, funding_model)
select c.id, case c.slug when 'teknokraft-canada' then 'client_funded' else 'winsalot_funded' end
from public.leadgen_clients c
where c.slug in ('teknokraft-canada', 'hidebrandt-web-services')
on conflict (client_id) do nothing;

-- ---------------------------------------------------------------------
-- Ledger: one row per confirmed sale.
-- ---------------------------------------------------------------------
create table public.winsalot_sales_conversion_bonuses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Source sale. FKs are set-null (never cascade) so deleting an appointment
  -- or lead can never erase a payroll record; the snapshot columns keep the
  -- row self-describing.
  appointment_id uuid references public.leadgen_appointments(id) on delete set null,
  lead_id uuid references public.leadgen_leads(id) on delete set null,
  client_id uuid not null references public.leadgen_clients(id) on delete restrict,
  campaign_id uuid references public.leadgen_campaigns(id) on delete set null,
  agent_id uuid references public.leadgen_users(id) on delete set null,
  agent_name text not null,
  agent_email text not null,
  client_name text not null,
  business_name text not null,
  appointment_date date,

  -- Terms snapshotted at confirmation so later program changes never
  -- rewrite history.
  funding_model text not null check (funding_model in ('client_funded', 'winsalot_funded')),
  accounting_treatment text not null check (accounting_treatment in ('client_receivable', 'winsalot_bonus_expense')),
  bonus_amount numeric(12, 2) not null check (bonus_amount > 0),
  currency text not null default 'CAD' check (currency = 'CAD'),

  -- Admin sale confirmation.
  sale_confirmed_by uuid references public.leadgen_users(id) on delete set null,
  sale_confirmed_by_name text not null,
  sale_confirmed_at timestamptz not null default now(),
  sale_notes text,

  -- Client side (Teknokraft owes Winsalot; Hidebrandt has no client leg).
  client_payment_status text not null check (client_payment_status in ('not_applicable', 'receivable', 'received')),
  client_payment_date date,
  client_payment_reference text,
  client_payment_recorded_by_name text,
  client_payment_recorded_at timestamptz,

  -- Agent side (Winsalot pays the agent through centralized payroll).
  agent_payment_status text not null default 'pending' check (agent_payment_status in ('pending', 'approved', 'paid', 'voided')),
  approved_by_name text,
  approved_at timestamptz,
  payroll_payday date,
  paid_by_name text,
  paid_at timestamptz,
  payment_date date,
  payment_reference text,
  voided_by_name text,
  voided_at timestamptz,
  void_reason text,

  constraint winsalot_sales_bonus_treatment_matches_funding check (
    (funding_model = 'client_funded' and accounting_treatment = 'client_receivable' and client_payment_status in ('receivable', 'received'))
    or (funding_model = 'winsalot_funded' and accounting_treatment = 'winsalot_bonus_expense' and client_payment_status = 'not_applicable')
  ),
  constraint winsalot_sales_bonus_client_payment_pairing check (
    (client_payment_status = 'received' and client_payment_date is not null and client_payment_recorded_by_name is not null and client_payment_recorded_at is not null)
    or (client_payment_status <> 'received' and client_payment_date is null and client_payment_reference is null and client_payment_recorded_by_name is null and client_payment_recorded_at is null)
  ),
  constraint winsalot_sales_bonus_approval_pairing check (
    (agent_payment_status = 'pending' and approved_by_name is null and approved_at is null and payroll_payday is null)
    or (agent_payment_status in ('approved', 'paid') and approved_by_name is not null and approved_at is not null and payroll_payday is not null)
    or agent_payment_status = 'voided'
  ),
  -- "Paid" always carries who/when plus a mandatory payment date and
  -- reference, i.e. Admin's confirmation that the money actually went out.
  constraint winsalot_sales_bonus_paid_pairing check (
    (agent_payment_status = 'paid' and paid_by_name is not null and paid_at is not null and payment_date is not null and payment_reference is not null and length(trim(payment_reference)) > 0)
    or (agent_payment_status <> 'paid' and paid_by_name is null and paid_at is null and payment_date is null and payment_reference is null)
  ),
  constraint winsalot_sales_bonus_void_pairing check (
    (agent_payment_status = 'voided' and voided_by_name is not null and voided_at is not null and void_reason is not null and length(trim(void_reason)) > 0)
    or (agent_payment_status <> 'voided' and voided_by_name is null and voided_at is null and void_reason is null)
  )
);

-- Duplicate protection, enforced by the database itself: one live bonus per
-- appointment AND one per lead (a re-booked appointment for the same
-- prospect is the same sale). A voided row frees both so a mistaken
-- confirmation can be corrected.
create unique index winsalot_sales_bonus_one_per_appointment
  on public.winsalot_sales_conversion_bonuses(appointment_id)
  where appointment_id is not null and agent_payment_status <> 'voided';
create unique index winsalot_sales_bonus_one_per_lead
  on public.winsalot_sales_conversion_bonuses(lead_id)
  where lead_id is not null and agent_payment_status <> 'voided';
create index winsalot_sales_bonus_agent_idx on public.winsalot_sales_conversion_bonuses(agent_id);
create index winsalot_sales_bonus_status_idx on public.winsalot_sales_conversion_bonuses(agent_payment_status, client_payment_status);

-- Append-only audit trail of every state change.
create table public.winsalot_sales_conversion_bonus_audit (
  id uuid primary key default gen_random_uuid(),
  bonus_id uuid references public.winsalot_sales_conversion_bonuses(id) on delete set null,
  agent_id uuid,
  action text not null check (action in ('sale_confirmed', 'approved', 'paid', 'voided', 'client_payment_received')),
  detail jsonb not null default '{}'::jsonb,
  performed_by uuid,
  performed_by_name text not null,
  occurred_at timestamptz not null default now()
);
create index winsalot_sales_bonus_audit_bonus_idx on public.winsalot_sales_conversion_bonus_audit(bonus_id, occurred_at);

-- ---------------------------------------------------------------------
-- Row Level Security: admins of either CRM read everything; nobody (not
-- even an admin) writes the tables directly - every change goes through
-- the checked functions below. Agents read only through
-- winsalot_my_sales_bonuses(), which omits client billing fields.
-- ---------------------------------------------------------------------
alter table public.winsalot_sales_bonus_programs enable row level security;
alter table public.winsalot_sales_conversion_bonuses enable row level security;
alter table public.winsalot_sales_conversion_bonus_audit enable row level security;

create policy winsalot_sales_bonus_programs_admin_read on public.winsalot_sales_bonus_programs
  for select to authenticated using ((select public.winsalot_payroll_admin()));
create policy winsalot_sales_bonuses_admin_read on public.winsalot_sales_conversion_bonuses
  for select to authenticated using ((select public.winsalot_payroll_admin()));
create policy winsalot_sales_bonus_audit_admin_read on public.winsalot_sales_conversion_bonus_audit
  for select to authenticated using ((select public.winsalot_payroll_admin()));

revoke all on public.winsalot_sales_bonus_programs, public.winsalot_sales_conversion_bonuses, public.winsalot_sales_conversion_bonus_audit from public, anon, authenticated;
grant select on public.winsalot_sales_bonus_programs, public.winsalot_sales_conversion_bonuses, public.winsalot_sales_conversion_bonus_audit to authenticated;
grant all on public.winsalot_sales_bonus_programs, public.winsalot_sales_conversion_bonuses, public.winsalot_sales_conversion_bonus_audit to service_role;

-- Money and the sale itself are immutable once recorded; paid/voided rows
-- cannot change at all. The one exception is a source row (appointment,
-- lead, campaign, agent) being deleted: those foreign keys are `on delete
-- set null` so the payroll record is preserved, and the guard lets exactly
-- that null-out through.
create function public.winsalot_sales_bonus_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_fk_columns text[] := array['appointment_id', 'lead_id', 'campaign_id', 'agent_id'];
begin
  if (to_jsonb(new) - v_fk_columns) = (to_jsonb(old) - v_fk_columns)
     and not exists (select 1 from unnest(v_fk_columns) k
                     where to_jsonb(new) -> k is distinct from to_jsonb(old) -> k and to_jsonb(new) -> k <> 'null'::jsonb) then
    return new;
  end if;
  if old.agent_payment_status in ('paid', 'voided') then
    raise exception 'A % sales conversion bonus can no longer be changed.', old.agent_payment_status using errcode = '23514';
  end if;
  if new.bonus_amount <> old.bonus_amount or new.currency <> old.currency or new.agent_id is distinct from old.agent_id
     or new.funding_model <> old.funding_model or new.client_id <> old.client_id then
    raise exception 'Bonus amount, currency, agent and funding model cannot be changed after the sale is confirmed.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger winsalot_sales_bonus_guard before update on public.winsalot_sales_conversion_bonuses
  for each row execute function public.winsalot_sales_bonus_guard();

create function public.winsalot_sales_bonus_audit_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'The sales bonus audit log is append-only.' using errcode = '23514';
end $$;
create trigger winsalot_sales_bonus_audit_immutable before update or delete on public.winsalot_sales_conversion_bonus_audit
  for each row execute function public.winsalot_sales_bonus_audit_immutable();

-- ---------------------------------------------------------------------
-- Checked write functions (security definer, explicit role checks, no
-- caller-supplied identity).
-- ---------------------------------------------------------------------
create function public.winsalot_sales_bonus_actor_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select coalesce(nullif(trim(u.full_name), ''), u.email) from public.leadgen_users u where u.id = (select auth.uid())),
    (select coalesce(nullif(trim(u.full_name), ''), u.email) from public.crm_users u where u.id = (select auth.uid())),
    'Admin');
$$;

-- Sale confirmation: Lead Generation CRM Admin only.
create function public.winsalot_confirm_sales_conversion(p_appointment_id uuid, p_notes text default null)
returns public.winsalot_sales_conversion_bonuses
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_appt public.leadgen_appointments%rowtype;
  v_program public.winsalot_sales_bonus_programs%rowtype;
  v_client public.leadgen_clients%rowtype;
  v_agent public.leadgen_users%rowtype;
  v_row public.winsalot_sales_conversion_bonuses;
  v_name text := public.winsalot_sales_bonus_actor_name();
begin
  if v_actor is null or coalesce(public.leadgen_user_role(v_actor), '') <> 'admin' then
    raise exception 'Only an Admin can confirm a sale.' using errcode = '42501';
  end if;

  select * into v_appt from public.leadgen_appointments where id = p_appointment_id for update;
  if not found then raise exception 'Appointment not found.' using errcode = 'P0002'; end if;
  if v_appt.status in ('Cancelled', 'Replaced', 'No-show') then
    raise exception 'A % appointment cannot be confirmed as a sale.', v_appt.status using errcode = '23514';
  end if;

  select * into v_program from public.winsalot_sales_bonus_programs where client_id = v_appt.client_id and active;
  if not found then raise exception 'This client has no active sales conversion bonus program.' using errcode = '23514'; end if;

  if v_appt.booking_agent_id is null then
    raise exception 'This appointment has no credited agent, so no bonus can be earned.' using errcode = '23514';
  end if;
  select * into v_agent from public.leadgen_users where id = v_appt.booking_agent_id;
  select * into v_client from public.leadgen_clients where id = v_appt.client_id;

  -- Serialize per sale (lead, else appointment) so concurrent confirmations
  -- cannot both pass the existence check; the unique indexes are the backstop.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('winsalot-sales-bonus:' || coalesce(v_appt.lead_id, v_appt.id)::text, 0));
  if exists (select 1 from public.winsalot_sales_conversion_bonuses b
             where b.agent_payment_status <> 'voided' and (b.appointment_id = v_appt.id or (v_appt.lead_id is not null and b.lead_id = v_appt.lead_id))) then
    raise exception 'A sales conversion bonus already exists for this sale.' using errcode = '23505';
  end if;

  insert into public.winsalot_sales_conversion_bonuses (
    appointment_id, lead_id, client_id, campaign_id, agent_id, agent_name, agent_email, client_name, business_name, appointment_date,
    funding_model, accounting_treatment, bonus_amount, currency,
    sale_confirmed_by, sale_confirmed_by_name, sale_notes, client_payment_status
  ) values (
    v_appt.id, v_appt.lead_id, v_appt.client_id, v_appt.campaign_id, v_agent.id,
    coalesce(nullif(trim(v_agent.full_name), ''), v_agent.email), v_agent.email, v_client.name, v_appt.business_name, v_appt.appointment_date,
    v_program.funding_model,
    case v_program.funding_model when 'client_funded' then 'client_receivable' else 'winsalot_bonus_expense' end,
    v_program.bonus_amount, v_program.currency,
    v_actor, v_name, nullif(trim(coalesce(p_notes, '')), ''),
    case v_program.funding_model when 'client_funded' then 'receivable' else 'not_applicable' end
  ) returning * into v_row;

  insert into public.winsalot_sales_conversion_bonus_audit(bonus_id, agent_id, action, detail, performed_by, performed_by_name)
  values (v_row.id, v_row.agent_id, 'sale_confirmed',
          jsonb_build_object('appointment_id', v_row.appointment_id, 'amount', v_row.bonus_amount, 'funding_model', v_row.funding_model), v_actor, v_name);
  return v_row;
end $$;

-- Approval: Admin of either CRM; schedules the bonus into a payroll payday.
create function public.winsalot_approve_sales_bonus(p_id uuid, p_payroll_payday date)
returns public.winsalot_sales_conversion_bonuses
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.winsalot_sales_conversion_bonuses;
  v_name text := public.winsalot_sales_bonus_actor_name();
begin
  if (select auth.uid()) is null or not public.winsalot_payroll_admin() then
    raise exception 'Only an Admin can approve a sales conversion bonus.' using errcode = '42501';
  end if;
  if p_payroll_payday is null then raise exception 'Choose the payroll payday this bonus will be paid with.' using errcode = '22023'; end if;
  update public.winsalot_sales_conversion_bonuses
     set agent_payment_status = 'approved', approved_by_name = v_name, approved_at = now(), payroll_payday = p_payroll_payday
   where id = p_id and agent_payment_status = 'pending'
   returning * into v_row;
  if not found then raise exception 'Only a pending bonus can be approved.' using errcode = '23514'; end if;
  insert into public.winsalot_sales_conversion_bonus_audit(bonus_id, agent_id, action, detail, performed_by, performed_by_name)
  values (v_row.id, v_row.agent_id, 'approved', jsonb_build_object('payroll_payday', p_payroll_payday), (select auth.uid()), v_name);
  return v_row;
end $$;

-- Payment: only an approved bonus, and only with the real payment date and
-- reference. Never called automatically.
create function public.winsalot_mark_sales_bonus_paid(p_id uuid, p_payment_date date, p_payment_reference text)
returns public.winsalot_sales_conversion_bonuses
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.winsalot_sales_conversion_bonuses;
  v_name text := public.winsalot_sales_bonus_actor_name();
begin
  if (select auth.uid()) is null or not public.winsalot_payroll_admin() then
    raise exception 'Only an Admin can mark a sales conversion bonus paid.' using errcode = '42501';
  end if;
  if p_payment_date is null or p_payment_date > (now() at time zone 'America/Toronto')::date then
    raise exception 'Enter the date the payment was actually sent (not a future date).' using errcode = '22023';
  end if;
  if p_payment_reference is null or length(trim(p_payment_reference)) = 0 then
    raise exception 'A payment reference is required to confirm the agent was paid.' using errcode = '22023';
  end if;
  update public.winsalot_sales_conversion_bonuses
     set agent_payment_status = 'paid', paid_by_name = v_name, paid_at = now(), payment_date = p_payment_date, payment_reference = trim(p_payment_reference)
   where id = p_id and agent_payment_status = 'approved'
   returning * into v_row;
  if not found then raise exception 'Only an approved bonus can be marked paid.' using errcode = '23514'; end if;
  insert into public.winsalot_sales_conversion_bonus_audit(bonus_id, agent_id, action, detail, performed_by, performed_by_name)
  values (v_row.id, v_row.agent_id, 'paid', jsonb_build_object('payment_date', p_payment_date, 'payment_reference', v_row.payment_reference), (select auth.uid()), v_name);
  return v_row;
end $$;

create function public.winsalot_void_sales_bonus(p_id uuid, p_reason text)
returns public.winsalot_sales_conversion_bonuses
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.winsalot_sales_conversion_bonuses;
  v_name text := public.winsalot_sales_bonus_actor_name();
begin
  if (select auth.uid()) is null or not public.winsalot_payroll_admin() then
    raise exception 'Only an Admin can void a sales conversion bonus.' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'A reason is required to void a bonus.' using errcode = '22023'; end if;
  -- Pending/approved only; a paid bonus is final.
  update public.winsalot_sales_conversion_bonuses
     set agent_payment_status = 'voided', voided_by_name = v_name, voided_at = now(), void_reason = trim(p_reason)
   where id = p_id and agent_payment_status in ('pending', 'approved')
   returning * into v_row;
  if not found then raise exception 'Only a pending or approved bonus can be voided.' using errcode = '23514'; end if;
  insert into public.winsalot_sales_conversion_bonus_audit(bonus_id, agent_id, action, detail, performed_by, performed_by_name)
  values (v_row.id, v_row.agent_id, 'voided', jsonb_build_object('reason', v_row.void_reason), (select auth.uid()), v_name);
  return v_row;
end $$;

-- Client receipt (Teknokraft receivable): independent of the agent leg.
create function public.winsalot_record_sales_bonus_client_payment(p_id uuid, p_received_date date, p_reference text default null)
returns public.winsalot_sales_conversion_bonuses
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.winsalot_sales_conversion_bonuses;
  v_name text := public.winsalot_sales_bonus_actor_name();
begin
  if (select auth.uid()) is null or not public.winsalot_payroll_admin() then
    raise exception 'Only an Admin can record a client payment.' using errcode = '42501';
  end if;
  if p_received_date is null or p_received_date > (now() at time zone 'America/Toronto')::date then
    raise exception 'Enter the date the client payment was actually received (not a future date).' using errcode = '22023';
  end if;
  update public.winsalot_sales_conversion_bonuses
     set client_payment_status = 'received', client_payment_date = p_received_date, client_payment_reference = nullif(trim(coalesce(p_reference, '')), ''),
         client_payment_recorded_by_name = v_name, client_payment_recorded_at = now()
   where id = p_id and client_payment_status = 'receivable' and agent_payment_status <> 'voided'
   returning * into v_row;
  if not found then raise exception 'No outstanding client receivable exists for this bonus.' using errcode = '23514'; end if;
  insert into public.winsalot_sales_conversion_bonus_audit(bonus_id, agent_id, action, detail, performed_by, performed_by_name)
  values (v_row.id, v_row.agent_id, 'client_payment_received', jsonb_build_object('received_date', p_received_date, 'reference', v_row.client_payment_reference), (select auth.uid()), v_name);
  return v_row;
end $$;

-- Agent read: own, non-voided bonuses only, with no client billing fields.
create function public.winsalot_my_sales_bonuses()
returns table (id uuid, sale_confirmed_at timestamptz, business_name text, client_name text, appointment_date date,
               bonus_amount numeric, currency text, agent_payment_status text, payroll_payday date, payment_date date, payment_reference text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.sale_confirmed_at, b.business_name, b.client_name, b.appointment_date,
         b.bonus_amount, b.currency, b.agent_payment_status, b.payroll_payday, b.payment_date, b.payment_reference
  from public.winsalot_sales_conversion_bonuses b
  where b.agent_id = (select auth.uid()) and b.agent_payment_status <> 'voided' and (select public.winsalot_payroll_agent())
  order by b.sale_confirmed_at desc;
$$;

revoke all on function
  public.winsalot_sales_bonus_actor_name(),
  public.winsalot_confirm_sales_conversion(uuid, text),
  public.winsalot_approve_sales_bonus(uuid, date),
  public.winsalot_mark_sales_bonus_paid(uuid, date, text),
  public.winsalot_void_sales_bonus(uuid, text),
  public.winsalot_record_sales_bonus_client_payment(uuid, date, text),
  public.winsalot_my_sales_bonuses()
from public, anon;
grant execute on function
  public.winsalot_confirm_sales_conversion(uuid, text),
  public.winsalot_approve_sales_bonus(uuid, date),
  public.winsalot_mark_sales_bonus_paid(uuid, date, text),
  public.winsalot_void_sales_bonus(uuid, text),
  public.winsalot_record_sales_bonus_client_payment(uuid, date, text),
  public.winsalot_my_sales_bonuses()
to authenticated, service_role;
