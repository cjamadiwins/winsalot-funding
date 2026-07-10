-- Matches the `lead_generation` table as it exists in the Business Finance
-- Supabase project. Kept here so local setups / fresh environments can
-- recreate it.

create table if not exists public.lead_generation (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  business_name text not null,
  contact_person text not null,
  business_email text not null,
  phone_number text not null,
  business_website text,
  target_industry text not null,
  services_to_promote text not null,
  leads_per_month integer not null check (leads_per_month > 0),
  preferred_start_date date,
  additional_notes text
);

alter table public.lead_generation enable row level security;

-- No policies are defined, so only requests using the service role key
-- (server-side only, e.g. the /api/lead-generation-intake route handler)
-- can read or write.
