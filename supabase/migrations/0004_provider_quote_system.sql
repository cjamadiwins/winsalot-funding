-- Adds the private provider-quote workflow: cleaning providers you manage,
-- secure per-request tokens that give a provider access to exactly one
-- quote request, the price they submit, and the customer-facing quote you
-- approve. Run this after 0001-0003. Admin access to all of this goes
-- through the /admin dashboard (Supabase Auth + service role key), never
-- directly from the browser, so no public RLS policies are defined here.

create table if not exists public.cleaning_providers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_name text not null,
  contact_person text,
  email text,
  phone text,
  service_locations text,
  pricing_notes text,
  internal_notes text,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

alter table public.cleaning_providers enable row level security;

-- Secure links handed out to a specific provider for a specific request.
-- The raw token is only ever shown once, in the admin dashboard; only its
-- SHA-256 hash is stored. A link is valid only while it's unexpired and
-- unrevoked, and only ever resolves to the one (request, provider) pair
-- it was created for.
create table if not exists public.provider_quote_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  provider_id uuid not null references public.cleaning_providers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  viewed_at timestamptz
);

create index if not exists provider_quote_tokens_request_idx
  on public.provider_quote_tokens (quote_request_id);

alter table public.provider_quote_tokens enable row level security;

-- The price a provider submits through their token-gated link.
create table if not exists public.provider_quote_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  provider_id uuid not null references public.cleaning_providers(id) on delete cascade,
  token_id uuid references public.provider_quote_tokens(id) on delete set null,
  price numeric not null check (price >= 0),
  price_type text not null check (price_type in ('hourly', 'per_visit', 'weekly', 'monthly', 'one_time')),
  estimated_hours numeric,
  travel_charge numeric,
  additional_charges numeric,
  notes text
);

create index if not exists provider_quote_submissions_request_idx
  on public.provider_quote_submissions (quote_request_id);

alter table public.provider_quote_submissions enable row level security;

-- Tracks the assignment + the admin-approved, customer-facing quote.
-- `status` progresses: new -> assigned -> provider_quote_received ->
-- quote_approved. Not enforced with a check constraint, to stay flexible.
alter table public.quote_requests
  add column if not exists assigned_provider_id uuid references public.cleaning_providers(id),
  add column if not exists assigned_at timestamptz,
  add column if not exists customer_quote_price numeric,
  add column if not exists customer_quote_price_type text,
  add column if not exists customer_quote_summary text,
  add column if not exists customer_quote_approved_at timestamptz,
  add column if not exists customer_quote_sent_at timestamptz;

-- No policies are defined on any table above, so only requests using the
-- service role key (server-side only, from the authenticated /admin
-- dashboard or the token-validated /provider-quote route) can read or
-- write.
