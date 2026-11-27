-- Drops the two redundant copies flagged by the Supabase performance advisor
-- ("duplicate_index"). Each pair is byte-for-byte identical in definition; the
-- copy kept is the one the planner actually uses (idx_scan 14,372 vs 4 and
-- 14,656 vs 2 on 2026-10-20). Indexes only: no table data is touched, and the
-- queries they serve keep an identical index.
-- Rollback: recreate with the two CREATE INDEX statements at the bottom.

drop index if exists public.crm_activities_opportunity_idx;
drop index if exists public.crm_followups_opportunity_idx;

-- Rollback:
-- create index crm_activities_opportunity_idx on public.crm_activities using btree (opportunity_id, occurred_at desc);
-- create index crm_followups_opportunity_idx on public.crm_followups using btree (opportunity_id);
