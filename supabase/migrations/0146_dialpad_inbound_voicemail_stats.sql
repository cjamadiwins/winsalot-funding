-- Dialpad User Statistics reporting: surface two more columns already
-- present in Dialpad's own export (inbound_calls, voicemails) that the
-- CRM previously discarded. Purely additive - existing rows default to
-- 0, which is factually correct for every already-imported report (the
-- importer never populated these before, so there is nothing to
-- backfill from).
alter table public.dialpad_user_stats
  add column if not exists inbound_calls integer not null default 0 check (inbound_calls >= 0),
  add column if not exists voicemails integer not null default 0 check (voicemails >= 0);
