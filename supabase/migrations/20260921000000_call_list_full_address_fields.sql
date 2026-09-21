-- Carries a LeadSwift import's full location data (street address, postal
-- code, country - city/province already existed) through the whole Call
-- List pipeline: staging (call_list_leads) -> Promote -> the real pipeline
-- (crm_opportunities for the Growth CRM, leadgen_leads for the Lead
-- Generation CRM). Purely additive, same convention as every migration in
-- this repo: no existing table, column, row, policy, or trigger is
-- altered or removed. city/province(_state) already existed on all three
-- tables and are reused as-is - this migration only adds the three fields
-- that were missing (street_address, postal_code, country), which
-- previously fell into call_list_leads.extra_fields and were never read
-- back out anywhere, including by Promote.
alter table public.call_list_leads
  add column if not exists street_address text,
  add column if not exists postal_code text,
  add column if not exists country text;

alter table public.crm_opportunities
  add column if not exists street_address text,
  add column if not exists postal_code text,
  add column if not exists country text;

alter table public.leadgen_leads
  add column if not exists street_address text,
  add column if not exists postal_code text,
  add column if not exists country text;

comment on column public.call_list_leads.street_address is 'From the LeadSwift/CSV import - street address only, never the full combined address.';
comment on column public.call_list_leads.postal_code is 'From the LeadSwift/CSV import.';
comment on column public.call_list_leads.country is 'From the LeadSwift/CSV import.';
