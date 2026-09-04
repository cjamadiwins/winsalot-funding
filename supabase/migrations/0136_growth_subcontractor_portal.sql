-- Growth CRM subcontractor onboarding portal.
-- Keeps subcontractors separate from crm_users/employee payroll while
-- providing a dedicated Supabase Auth identity, agreement, call log and
-- read-only payment access.

alter table public.crm_subcontractors
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists portal_active boolean not null default false,
  add column if not exists invited_at timestamptz,
  add column if not exists last_login_at timestamptz;

create unique index if not exists crm_subcontractors_email_unique
  on public.crm_subcontractors (lower(email)) where email is not null;
create unique index if not exists crm_subcontractors_auth_user_unique
  on public.crm_subcontractors (auth_user_id) where auth_user_id is not null;

alter table public.leadgen_subcontractors
  add column if not exists email text,
  add column if not exists phone text;

create unique index if not exists leadgen_subcontractors_email_unique
  on public.leadgen_subcontractors (lower(email)) where email is not null;

create table if not exists public.crm_subcontractor_agreements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subcontractor_id uuid not null references public.crm_subcontractors(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  status text not null default 'sent' check (status in ('sent', 'signed', 'superseded')),
  agreement_text text not null,
  currency text not null check (currency in ('NGN', 'PHP', 'CAD', 'USD', 'GBP', 'EUR')),
  pay_type text not null check (pay_type in ('fixed', 'hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'per_lead_appointment')),
  pay_rate numeric(12, 2) not null check (pay_rate >= 0),
  issued_at timestamptz not null default now(),
  opened_at timestamptz,
  accepted_at timestamptz,
  signer_full_name text,
  signer_signature_text text,
  accepted_by_auth_user uuid references auth.users(id) on delete set null,
  unique (subcontractor_id, version)
);

create index if not exists crm_subcontractor_agreements_lookup_idx
  on public.crm_subcontractor_agreements(subcontractor_id, version desc);
create unique index if not exists crm_subcontractor_one_open_agreement
  on public.crm_subcontractor_agreements(subcontractor_id) where status = 'sent';

create or replace function public.protect_signed_subcontractor_agreement()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'signed' then
    raise exception 'A signed subcontractor agreement is immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_signed_subcontractor_agreement on public.crm_subcontractor_agreements;
create trigger protect_signed_subcontractor_agreement
  before update or delete on public.crm_subcontractor_agreements
  for each row execute function public.protect_signed_subcontractor_agreement();

alter table public.crm_subcontractor_agreements enable row level security;
create policy "crm_subcontractor_agreements_admin_all"
  on public.crm_subcontractor_agreements for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');
create policy "crm_subcontractor_agreements_select_own"
  on public.crm_subcontractor_agreements for select
  using (exists (
    select 1 from public.crm_subcontractors s
    where s.id = subcontractor_id and s.auth_user_id = auth.uid()
      and s.active and s.portal_active
  ));

create table if not exists public.crm_subcontractor_call_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subcontractor_id uuid not null references public.crm_subcontractors(id) on delete restrict,
  business_name text not null check (length(trim(business_name)) > 0),
  phone text not null check (length(trim(phone)) > 0),
  outcome text not null check (outcome in ('No Answer', 'Voicemail', 'Gatekeeper', 'Not Interested', 'Callback')),
  notes text not null check (length(trim(notes)) > 0),
  business_client_name text not null
);

create index if not exists crm_subcontractor_call_logs_owner_created_idx
  on public.crm_subcontractor_call_logs(subcontractor_id, created_at desc);

alter table public.crm_subcontractor_call_logs enable row level security;
create policy "crm_subcontractor_call_logs_admin_all"
  on public.crm_subcontractor_call_logs for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');
create policy "crm_subcontractor_call_logs_select_own"
  on public.crm_subcontractor_call_logs for select
  using (exists (
    select 1 from public.crm_subcontractors s
    where s.id = subcontractor_id and s.auth_user_id = auth.uid()
      and s.active and s.portal_active
  ));
create policy "crm_subcontractor_call_logs_insert_own"
  on public.crm_subcontractor_call_logs for insert
  with check (exists (
    select 1 from public.crm_subcontractors s
    where s.id = subcontractor_id and s.auth_user_id = auth.uid()
      and s.active and s.portal_active
  ));

-- A portal user may see only their own subcontractor profile and payments.
create policy "crm_subcontractors_select_own_portal"
  on public.crm_subcontractors for select
  using (auth_user_id = auth.uid() and active and portal_active);
create policy "crm_subcontractor_payments_select_own_portal"
  on public.crm_subcontractor_payments for select
  using (exists (
    select 1 from public.crm_subcontractors s
    where s.id = subcontractor_id and s.auth_user_id = auth.uid()
      and s.active and s.portal_active
  ));

comment on table public.crm_subcontractor_agreements is
  'Versioned independent-contractor agreements; signed versions are immutable application records.';
comment on table public.crm_subcontractor_call_logs is
  'Outbound calls entered by authenticated Growth CRM subcontractors.';
