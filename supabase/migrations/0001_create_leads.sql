-- Matches the `leads` table as it actually exists in the Business Finance
-- Supabase project (created directly via the SQL editor, not this file).
-- Kept here so local setups / fresh environments can recreate it.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  monthly_revenue numeric not null check (monthly_revenue >= 0),
  funding_amount_requested numeric,
  product_interest text,
  source_page text default 'homepage'
);

alter table public.leads enable row level security;

-- No policies are defined, so only requests using the service role key
-- (server-side only, e.g. the /api/leads route handler) can read or write.
