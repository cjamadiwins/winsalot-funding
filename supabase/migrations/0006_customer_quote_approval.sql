-- Customer quote approval & acceptance workflow.
--
-- Purely additive: new nullable columns on quote_requests plus a new
-- customer_quote_tokens table, mirroring provider_quote_tokens (0004). No
-- existing column, row, or constraint is changed.
--
-- quote_requests.status has no CHECK constraint (see 0004's comment) so the
-- new pipeline's status literals ("Request Submitted", "Sent to Provider",
-- "Awaiting Winsalot Approval", "Approved", "Sent to Customer",
-- "Customer Accepted", "Customer Declined") are introduced in application
-- code, not here.

alter table public.quote_requests
  add column if not exists customer_quote_provider_name text,
  add column if not exists customer_quote_notes text,
  add column if not exists quote_expires_at timestamptz,
  add column if not exists customer_response text check (customer_response in ('accepted', 'declined')),
  add column if not exists customer_response_at timestamptz,
  add column if not exists customer_response_comments text;

-- Secure customer-facing link: only the SHA-256 hash of the raw token is
-- ever stored, same pattern as provider_quote_tokens.
create table if not exists public.customer_quote_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  viewed_at timestamptz
);

create index if not exists customer_quote_tokens_request_idx
  on public.customer_quote_tokens (quote_request_id);

alter table public.customer_quote_tokens enable row level security;
-- No policies defined -> only the service-role key can read/write, same as
-- every other table in this schema.
