-- Lead Generation CRM: Hidebrandt + Teknokraft call lists keep DESCRIPTIVE names
-- (niche, market, and only genuine segmentation qualifiers such as "No Website",
-- "Website Review", "Website Needs Rebrand"); the umbrella service label lives on the
-- campaign, not in every list. Structure:
--   Client -> Lead Generation for Website & SEO -> niche list -> leads
-- Naming/display only: list ids, leads, rosters, calls, appointments, notes and RLS
-- are untouched. Idempotent.

-- 1. Drop the stray "Website Design" tag from six Winnipeg painting list names
--    (not a qualifier of the list). Original-name lists first so the roster-name
--    trigger keeps its existing "(segment xxxxxxxx)" disambiguation pattern.
update public.call_list_segments
set name = replace(name, ' — Website Design', '')
where id in (
  'ebea5278-b525-4a6c-aa17-b04a80c336dc', 'd0621eba-2298-46c9-8812-62f497c2cf4d',
  'f7aa210b-e037-4981-8fc3-4c84afb52893', '70d01977-c8b4-4002-9781-a75a74e48f0d'
) and name like '% — Website Design — %';

update public.call_list_segments
set name = replace(name, ' — Website Design', '')
where id in ('d2c6214f-4897-47f2-a76e-fb88ff684697', 'f61d41e3-a76f-47b9-aa62-d69b2e02b090')
  and name like '% — Website Design — %';

-- 2. The list's campaign label is exactly the umbrella (niche/market are in the list name).
update public.call_list_segments s
set campaign_name = 'Lead Generation for Website & SEO'
from public.leadgen_campaigns c
join public.leadgen_clients cl on cl.id = c.client_id
where s.leadgen_campaign_id = c.id
  and s.crm = 'lead_generation'
  and cl.slug in ('hidebrandt-web-services', 'teknokraft-canada')
  and s.campaign_name is distinct from 'Lead Generation for Website & SEO';
