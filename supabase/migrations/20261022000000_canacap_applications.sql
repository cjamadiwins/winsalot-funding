-- Winsalot Growth CRM: CanaCap financing application tracking.
--
-- Tracks each client's CanaCap Merchant Cash Advance submission
-- (status, business, owner, date submitted, supporting-document checklist).
-- It stores NO files: completed applications and bank statements are
-- never kept in GitHub, and this table only records whether each item has
-- been collected. Entirely additive and admin-only (same RLS pattern as
-- crm_lending_partners, migration 0158).

create table if not exists public.crm_canacap_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,
  lending_partner_id uuid references public.crm_lending_partners(id) on delete set null,

  business_name text not null,
  owner_name text,
  status text not null default 'not_started' check (status in (
    'not_started', 'documents_pending', 'ready_to_submit', 'submitted', 'approved', 'declined'
  )),
  date_submitted date,

  has_bank_statements boolean not null default false,
  has_completed_application boolean not null default false,
  has_incorporation_date boolean not null default false,
  has_owner_info boolean not null default false,

  notes text
);

create index if not exists crm_canacap_applications_status_idx on public.crm_canacap_applications(status);

alter table public.crm_canacap_applications enable row level security;

create policy "crm_canacap_applications_admin_all"
  on public.crm_canacap_applications for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create or replace function public.crm_canacap_applications_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_canacap_applications_set_updated_at_trigger on public.crm_canacap_applications;

create trigger crm_canacap_applications_set_updated_at_trigger
  before update on public.crm_canacap_applications
  for each row
  execute function public.crm_canacap_applications_set_updated_at();
