-- Supporting indexes for the admin Call Logs list's new server-side
-- pagination/search/date-range filters (both the Growth CRM and Lead
-- Generation CRM) - purely additive, no existing column, row, or policy
-- touched.
--
-- crm_call_logs_agent_created_idx / leadgen_call_logs_agent_created_idx
-- (migration 0130) are composite on (agent_id, created_at) and only help an
-- agent-scoped query. The admin list frequently queries across every
-- agent (searching/date-filtering/sorting the whole table), which needs
-- its own plain created_at index to keep "newest first" pagination fast as
-- either table grows into the thousands.
create index if not exists crm_call_logs_created_at_idx
  on public.crm_call_logs(created_at desc);
create index if not exists leadgen_call_logs_created_at_idx
  on public.leadgen_call_logs(created_at desc);

-- "Search by business name or phone number" is an ILIKE '%term%' scan,
-- which a plain btree index can't accelerate. pg_trgm's trigram GIN
-- indexes are the standard Postgres answer for fast substring search
-- without standing up a separate search service.
create extension if not exists pg_trgm with schema extensions;

create index if not exists crm_call_logs_business_name_trgm_idx
  on public.crm_call_logs using gin (business_name extensions.gin_trgm_ops);
create index if not exists crm_call_logs_phone_trgm_idx
  on public.crm_call_logs using gin (phone extensions.gin_trgm_ops);

create index if not exists leadgen_call_logs_business_name_trgm_idx
  on public.leadgen_call_logs using gin (business_name extensions.gin_trgm_ops);
create index if not exists leadgen_call_logs_phone_trgm_idx
  on public.leadgen_call_logs using gin (phone extensions.gin_trgm_ops);
