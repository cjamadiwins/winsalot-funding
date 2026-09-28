-- Hidebrandt Web Services' real campaign (leadgen_campaigns id
-- 91e3698a-6c59-4f83-8eb4-e5cb93f86015) had zero call_list_segments and
-- zero leadgen_leads attached to it - the actual Painting Companies and
-- Auto Repair Shops production segments for Hidebrandt (Winnipeg,
-- Manitoba territory; Goodness Ugbana + Henry Osuji already rostered on
-- each via call_list_segment_agents) were instead parked under a
-- generic, unnamed "Website Design Lead Generation" campaign belonging
-- to a placeholder "Winsalot Corp. Test" client. No leadgen_leads had
-- been promoted from any of these 12 segments yet - only their
-- pre-promotion call_list_leads dial rows exist, and those stay attached
-- to the segment itself (keyed by segment_id, not campaign_id) so they
-- need no change here - which makes re-pointing the segments a clean
-- fix with nothing to retroactively repair.
--
-- Re-attaches exactly the 12 Winnipeg Painting Companies / Auto Repair
-- Shops segments (matched by id, not by industry/territory text, so
-- this can never silently sweep up a future unrelated segment that
-- happens to share the same industry/territory strings) to Hidebrandt's
-- real campaign, and reactivates that campaign (it had been
-- deliberately paused in migration 20260928050419 pending this fix) so
-- Goodness/Henry's existing segment-level access keeps working without
-- interruption - segment access requires an *active* leadgen campaign
-- (see isAgentAssignedToActiveSegment/deploySegment in
-- src/lib/call-list-segments.ts and src/lib/call-list-deploy.ts).
--
-- The Toronto Auto Repair Shops segments are deliberately left
-- untouched here - they belong to a different client's campaign, not
-- Hidebrandt's. Both updates guard on the current "wrong" state, so
-- re-running this migration is a safe no-op.

update public.call_list_segments
set leadgen_campaign_id = '91e3698a-6c59-4f83-8eb4-e5cb93f86015'
where id in (
  'c9f88abc-1221-524e-8d59-89f77f066f9c', -- Auto Repair — Winnipeg — Has Website / Review Required (Admin Only)
  'ed01e0f9-211b-5400-9084-d711be6d16a6', -- Auto Repair — Winnipeg — No Website — Goodness Ugbana
  '68ec8911-68be-5fd9-8c40-006c884a970c', -- Auto Repair — Winnipeg — No Website — Henry Osuji
  'eebec1cc-2f3a-5a71-8911-909c331b6ee9', -- Auto Repair — Winnipeg — Uncontactable / Data Issue (Admin Only)
  'b8041f3e-c42c-5257-a101-f7756a3f7d65', -- Auto Repair — Winnipeg — Website Needs Rebrand — Goodness Ugbana
  '7027d57e-581c-5de5-9f84-219bb059ef26', -- Auto Repair — Winnipeg — Website Needs Rebrand — Henry Osuji
  'f7aa210b-e037-4981-8fc3-4c84afb52893', -- Painting Companies — Winnipeg, Manitoba — Has Website — Review Required — Admin Only
  'ebea5278-b525-4a6c-aa17-b04a80c336dc', -- Painting Companies — Winnipeg, Manitoba — No Website — Goodness Ugbana
  'd2c6214f-4897-47f2-a76e-fb88ff684697', -- Painting Companies — Winnipeg, Manitoba — No Website — Henry Osuji
  '70d01977-c8b4-4002-9781-a75a74e48f0d', -- Painting Companies — Winnipeg, Manitoba — Uncontactable / Data Issue — Admin Only
  'd0621eba-2298-46c9-8812-62f497c2cf4d', -- Painting Companies — Winnipeg, Manitoba — Website Needs Rebrand — Goodness Ugbana
  'f61d41e3-a76f-47b9-aa62-d69b2e02b090'  -- Painting Companies — Winnipeg, Manitoba — Website Needs Rebrand — Henry Osuji
)
and leadgen_campaign_id = 'fdca0dda-ab13-48ad-98d6-d9a455f04798'; -- only if still under the generic test campaign

update public.leadgen_campaigns
set status = 'active', updated_at = now()
where id = '91e3698a-6c59-4f83-8eb4-e5cb93f86015'
  and status = 'paused';
