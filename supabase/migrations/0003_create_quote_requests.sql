-- Quote requests submitted through the Afsoon Cleaning Team landing page
-- (/afsoon-cleaning). Run this in the Supabase SQL editor, or apply it with
-- the Supabase CLI, to create the table the API route writes to.

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  phone text not null,
  email text,
  city text not null,
  service_address text,
  property_type text not null check (property_type in ('residential', 'commercial')),
  cleaning_type text not null,
  bedrooms text,
  bathrooms text,
  property_size text,
  preferred_date date,
  service_frequency text check (service_frequency in ('one-time', 'recurring')),
  preferred_contact_method text check (preferred_contact_method in ('phone', 'email', 'text')),
  description text not null,
  consent_to_contact boolean not null default false,
  status text not null default 'new',
  source text not null default 'Afsoon Cleaning Team landing page'
);

alter table public.quote_requests enable row level security;

-- No policies are defined, so only requests using the service role key
-- (server-side only, e.g. the /api/afsoon-cleaning-quote route handler)
-- can read or write.
