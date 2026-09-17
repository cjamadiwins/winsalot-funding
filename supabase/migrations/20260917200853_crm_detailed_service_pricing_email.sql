-- One reusable source of truth for the approved Lead Generation price.
-- Agents may read it for previews/sends; only admins may change it.
create table if not exists public.crm_service_pricing (
  service_key text primary key check (service_key in ('lead_generation')),
  price_cents integer not null check (price_cents > 0),
  billing_period text not null check (billing_period in ('month')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.crm_users(id) on delete set null
);

insert into public.crm_service_pricing (service_key, price_cents, billing_period)
values ('lead_generation', 75000, 'month')
on conflict (service_key) do nothing;

alter table public.crm_service_pricing enable row level security;

grant select, update on public.crm_service_pricing to authenticated;

create policy "crm_service_pricing_staff_select"
  on public.crm_service_pricing for select
  to authenticated
  using (
    exists (
      select 1 from public.crm_users u
      where u.id = (select auth.uid())
        and u.active = true
        and u.role in ('admin', 'agent')
    )
  );

create policy "crm_service_pricing_admin_update"
  on public.crm_service_pricing for update
  to authenticated
  using (
    exists (
      select 1 from public.crm_users u
      where u.id = (select auth.uid()) and u.active = true and u.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.crm_users u
      where u.id = (select auth.uid()) and u.active = true and u.role = 'admin'
    )
  );

-- Keep this send in the existing one-to-one Resend delivery ledger.
alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_email_type_check;
alter table public.crm_lead_emails add constraint crm_lead_emails_email_type_check
  check (email_type in (
    'quote_request', 'follow_up', 'provider_intake', 'consultation_invite',
    'appointment_reminder', 'appointment_confirmation', 'consultation_follow_up',
    'detailed_service_pricing'
  ));
