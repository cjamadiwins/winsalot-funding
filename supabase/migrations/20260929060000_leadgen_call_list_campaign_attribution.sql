-- Lead Generation CRM: call-list-driven client/campaign attribution.
--
-- The call list (call_list_segments.leadgen_campaign_id -> leadgen_campaigns
-- -> leadgen_clients) stays the single source of truth for which client an
-- agent is calling for; call_list_segment_agents and leadgen_campaign_agents
-- stay the agent assignments. No new table is needed.
--
-- Additive only:
--   * leadgen_call_logs.campaign_id - call logs already stored client_id, but
--     the campaign was only derivable through the segment's *current* campaign,
--     which an admin may later reassign. Stamping it at call time keeps
--     reporting attribution stable. Nullable (manual, non-list calls have none).
--   * leadgen_clients.is_internal_test - lets the admin assignment screen flag
--     call lists still linked to Winsalot's own test client, instead of
--     matching a client by name in application code.
-- Table-level grants/RLS on both tables are unchanged and already cover the
-- new columns (agents insert their own call logs; clients stay admin-managed).

alter table public.leadgen_call_logs
  add column if not exists campaign_id uuid references public.leadgen_campaigns(id) on delete set null;

create index if not exists leadgen_call_logs_campaign_idx on public.leadgen_call_logs(campaign_id);

-- Backfill only where the segment's campaign belongs to the same client the
-- call was actually logged under - never rewrites an existing attribution.
update public.leadgen_call_logs l
set campaign_id = s.leadgen_campaign_id
from public.call_list_segments s
join public.leadgen_campaigns c on c.id = s.leadgen_campaign_id
where l.call_list_segment_id = s.id
  and l.campaign_id is null
  and c.client_id = l.client_id;

alter table public.leadgen_clients
  add column if not exists is_internal_test boolean not null default false;

update public.leadgen_clients set is_internal_test = true where name = 'Winsalot Corp. Test' and is_internal_test = false;
