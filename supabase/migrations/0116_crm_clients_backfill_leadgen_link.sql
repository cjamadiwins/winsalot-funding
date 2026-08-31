-- Backfills crm_clients.leadgen_client_id (added in 0114_client_portal_access)
-- for existing Growth CRM clients that were created before that linking
-- field existed, so an admin doesn't have to manually re-link every
-- pre-existing client from the new "Lead Generation Client" control.
--
-- Only links a pair when the match is genuinely unambiguous:
--   - the crm_clients row isn't already linked
--   - exactly one leadgen_clients row shares its company_name
--     (case-insensitive, trimmed)
--   - that leadgen_clients row doesn't already share its name with a
--     second leadgen_clients row
--   - that leadgen_clients row isn't already linked to a different
--     crm_clients row (crm_clients_leadgen_client_unique_idx would reject
--     it anyway, but this keeps the statement a safe no-op either way)
-- Anything ambiguous (no match, or more than one candidate on either
-- side) is left null, exactly as the brief asks - an admin links those
-- from the dropdown instead.
with candidates as (
  select
    cc.id as crm_client_id,
    lg.id as leadgen_client_id,
    count(*) over (partition by cc.id) as crm_match_count,
    count(*) over (partition by lg.id) as leadgen_match_count
  from public.crm_clients cc
  join public.leadgen_clients lg
    on lower(trim(lg.name)) = lower(trim(cc.company_name))
  where cc.leadgen_client_id is null
)
update public.crm_clients cc
set leadgen_client_id = c.leadgen_client_id
from candidates c
where cc.id = c.crm_client_id
  and c.crm_match_count = 1
  and c.leadgen_match_count = 1
  and not exists (
    select 1 from public.crm_clients other
    where other.leadgen_client_id = c.leadgen_client_id
  );
