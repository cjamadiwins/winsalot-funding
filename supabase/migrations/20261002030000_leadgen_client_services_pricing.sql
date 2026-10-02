-- Lead Generation CRM: client "Products, Services & Pricing".
--
-- Internal, per-client reference of what each client offers (services,
-- pricing, inclusions, exclusions, technical + sales notes) for Admin and the
-- agents assigned to that client. Additive only: no existing table, column,
-- row, policy or grant is changed.
--
-- Access model (explicit grants only):
--   * Admin: SELECT through RLS; every write goes through a server action using
--     service_role after requireLeadgenAdmin() (same pattern as
--     leadgen_appointment_briefs). `authenticated` has no write grant at all.
--   * Agent: SELECT only, only ACTIVE entries, only for clients they are
--     assigned to (leadgen_agent_client_allowed - the same gate that scopes
--     leadgen_clients/leadgen_campaigns to an agent).
--   * Client portal users and anon: no policy, no grant - not exposed.
--   * Every row carries its own client_id, so one client's pricing can never
--     appear on another client.
--
-- Pricing history: an AFTER INSERT/UPDATE trigger appends every create /
-- price change / deactivate / reactivate / edit to
-- leadgen_client_service_history (previous + new snapshot, who, when), so an
-- older price is never silently overwritten. A pure re-ordering is not logged.

create table if not exists public.leadgen_client_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  -- 'service' = a priced product/service; 'note' = a reference note with no
  -- price (e.g. a platform approach or general sales note).
  entry_type text not null default 'service' check (entry_type in ('service', 'note')),
  name text not null check (length(trim(name)) > 0),
  description text,
  pricing_type text check (pricing_type is null or pricing_type in ('starting_at', 'fixed', 'hourly', 'monthly', 'annual', 'custom_quote')),
  price_amount numeric(12, 2) check (price_amount is null or price_amount >= 0),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  plus_taxes boolean not null default true,
  -- e.g. "Two-year signup"
  price_condition text,
  included text[] not null default '{}',
  additional_costs text[] not null default '{}',
  technical_notes text,
  sales_notes text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.leadgen_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.leadgen_users(id) on delete set null,
  constraint leadgen_client_services_service_has_pricing check (entry_type = 'note' or pricing_type is not null),
  constraint leadgen_client_services_amount_for_priced check (pricing_type is null or pricing_type = 'custom_quote' or price_amount is not null)
);

create unique index if not exists leadgen_client_services_client_name_idx
  on public.leadgen_client_services(client_id, lower(name));
create index if not exists leadgen_client_services_client_order_idx
  on public.leadgen_client_services(client_id, sort_order, created_at);

create table if not exists public.leadgen_client_service_history (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.leadgen_client_services(id) on delete cascade,
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  change_type text not null check (change_type in ('created', 'updated', 'price_changed', 'deactivated', 'reactivated')),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.leadgen_users(id) on delete set null,
  previous jsonb,
  snapshot jsonb not null
);

create index if not exists leadgen_client_service_history_service_idx
  on public.leadgen_client_service_history(service_id, changed_at desc);

create or replace function public.leadgen_client_services_log_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_type := 'created';
  else
    -- Re-ordering only: nothing worth a history row.
    if (to_jsonb(new) - 'sort_order' - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'sort_order' - 'updated_at' - 'updated_by') then
      return new;
    end if;
    if new.is_active is distinct from old.is_active then
      v_type := case when new.is_active then 'reactivated' else 'deactivated' end;
    elsif (new.pricing_type, new.price_amount, new.currency, new.plus_taxes, new.price_condition)
          is distinct from (old.pricing_type, old.price_amount, old.currency, old.plus_taxes, old.price_condition) then
      v_type := 'price_changed';
    else
      v_type := 'updated';
    end if;
  end if;

  insert into public.leadgen_client_service_history (service_id, client_id, change_type, changed_by, previous, snapshot)
  values (new.id, new.client_id, v_type, new.updated_by, case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists leadgen_client_services_history_trigger on public.leadgen_client_services;
create trigger leadgen_client_services_history_trigger
  after insert or update on public.leadgen_client_services
  for each row execute function public.leadgen_client_services_log_history();

revoke execute on function public.leadgen_client_services_log_history() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------
alter table public.leadgen_client_services enable row level security;
alter table public.leadgen_client_service_history enable row level security;

drop policy if exists "leadgen_client_services_admin_select" on public.leadgen_client_services;
create policy "leadgen_client_services_admin_select"
  on public.leadgen_client_services for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

drop policy if exists "leadgen_client_services_agent_select_assigned" on public.leadgen_client_services;
create policy "leadgen_client_services_agent_select_assigned"
  on public.leadgen_client_services for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and is_active = true
    and public.leadgen_agent_client_allowed(auth.uid(), client_id)
  );

drop policy if exists "leadgen_client_service_history_admin_select" on public.leadgen_client_service_history;
create policy "leadgen_client_service_history_admin_select"
  on public.leadgen_client_service_history for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

revoke all on table public.leadgen_client_services from anon, authenticated;
grant select on table public.leadgen_client_services to authenticated;
grant all on table public.leadgen_client_services to service_role;

revoke all on table public.leadgen_client_service_history from anon, authenticated;
grant select on table public.leadgen_client_service_history to authenticated;
grant all on table public.leadgen_client_service_history to service_role;

comment on table public.leadgen_client_services is
  'Internal per-client Products, Services & Pricing reference (client-provided). Admin-written via service_role server actions; agents read ACTIVE entries for their assigned clients only; never exposed to client portal users.';
comment on table public.leadgen_client_service_history is
  'Append-only history of every change to leadgen_client_services (written by trigger). Admin-readable only.';

-- ---------------------------------------------------------------------
-- Initial data: Hidebrandt Web Services ONLY (client-provided by Theodore).
-- Keyed by the existing client's slug; idempotent; no other client is touched.
-- ---------------------------------------------------------------------
insert into public.leadgen_client_services
  (client_id, entry_type, name, description, pricing_type, price_amount, currency, plus_taxes, price_condition, included, additional_costs, technical_notes, sales_notes, sort_order)
select c.id, v.entry_type, v.name, v.description, v.pricing_type, v.price_amount, 'CAD', v.plus_taxes, v.price_condition, v.included, v.additional_costs, v.technical_notes, v.sales_notes, v.sort_order
from public.leadgen_clients c
cross join (values
  (
    'service', 'Brochure-Style Website',
    'A standard informational/business website designed around the customer’s brand, content, and requirements.',
    'starting_at', 465.00::numeric, true, null::text,
    array[
      'Content Management System selected according to client needs',
      'Possible CMS platforms include WordPress, Drupal, Joomla, etc.',
      'Website design according to the customer’s logo and specifications',
      'Contact form',
      'Up to 15 pages of content',
      'Image gallery where required'
    ],
    array[]::text[],
    'The CMS/platform is selected according to the needs of the individual project.',
    'Present as “Starting at CA$465 + applicable taxes”. Do not present CA$465 as a guaranteed final project price if additional custom work is required; exact pricing depends on the scope and the client provides the final quote.',
    10
  ),
  (
    'service', 'E-commerce Website',
    'Standalone/self-hosted e-commerce website development customized to the project requirements.',
    'starting_at', 1395.00::numeric, true, null::text,
    array[]::text[],
    array[
      'Plugins',
      'Extensions',
      'Payment-provider integrations',
      'Shipping-provider integrations',
      'Third-party integrations',
      'Other custom e-commerce requirements'
    ],
    null::text,
    'E-commerce websites typically start at CA$1,395 + applicable taxes; present as “Starting at”, not a fixed final project price. The client quotes e-commerce requirements individually, line-by-line, so there are no surprises and the customer can choose the direction and components required for each e-commerce item.',
    20
  ),
  (
    'note', 'E-commerce Platform Approach',
    null::text,
    null::text, null::numeric, true, null::text,
    array[]::text[],
    array[]::text[],
    'Hidebrandt Web Services uses standalone/self-hosted e-commerce systems where appropriate. Examples provided by the client: Magento, Shopware. The client does not normally use Software-as-a-Service marketplace/e-commerce platforms such as Shopify, eBay, or Facebook Marketplace. Client’s stated reason: the customer owns and controls the website, software, and data, and the site can be packaged and moved if necessary.',
    'This is Hidebrandt Web Services’ own technical/service preference (client-provided). It is not a Winsalot Corp. opinion or recommendation.',
    30
  ),
  (
    'service', 'Website Hosting',
    null::text,
    'monthly', 10.00::numeric, true, 'Two-year signup',
    array[]::text[],
    array[]::text[],
    null::text,
    'Current hosting offer supplied by Hidebrandt Web Services. Admin can update or deactivate this offer if pricing changes.',
    40
  ),
  (
    'service', 'Domain + SSL',
    'Domain registration/provisioning plus SSL certificate where required.',
    'annual', 50.00::numeric, true, null::text,
    array[]::text[],
    array[]::text[],
    null::text,
    'Use this when a new domain and SSL certificate need to be purchased/provided for the project.',
    50
  ),
  (
    'service', 'Custom Development / Custom Work',
    'Custom development or project work outside the standard package scope.',
    'hourly', 46.50::numeric, true, null::text,
    array[]::text[],
    array[]::text[],
    null::text,
    null::text,
    60
  ),
  (
    'note', 'Pricing Transparency',
    null::text,
    null::text, null::numeric, true, null::text,
    array[]::text[],
    array[]::text[],
    null::text,
    'Pricing is intended to be transparent. Additional or custom requirements should be quoted clearly so the customer understands the cost before work proceeds.',
    70
  )
) as v(entry_type, name, description, pricing_type, price_amount, plus_taxes, price_condition, included, additional_costs, technical_notes, sales_notes, sort_order)
where c.slug = 'hidebrandt-web-services'
  and not exists (
    select 1 from public.leadgen_client_services s
    where s.client_id = c.id and lower(s.name) = lower(v.name)
  );
