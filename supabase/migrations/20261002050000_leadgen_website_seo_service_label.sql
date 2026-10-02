-- Lead Generation CRM: one umbrella service label for the Website Design & SEO
-- clients (Hidebrandt Web Services, Teknokraft Canada Inc.):
--   "Lead Generation for Website & SEO"
-- The lead niche (industry) and market (location) stay separate, trailing the
-- label. Label/display text only: campaign IDs, leads, call logs, appointments,
-- notes, outcomes and every client/Primary assignment are untouched (renames are
-- in-place updates of the same rows). Idempotent. Growth CRM and all other
-- clients are not touched.

-- 1. Campaigns. The client's oldest campaign (the onboarding umbrella) becomes
--    exactly the label; each per-niche campaign keeps its niche/market after it.
with ranked as (
  select c.id, c.name, cl.name as client_name,
         row_number() over (partition by c.client_id order by c.created_at, c.id) as rn
  from public.leadgen_campaigns c
  join public.leadgen_clients cl on cl.id = c.client_id
  where cl.slug in ('hidebrandt-web-services', 'teknokraft-canada')
), wanted as (
  select id, name,
         case
           when rn = 1 then 'Lead Generation for Website & SEO'
           else 'Lead Generation for Website & SEO — ' || btrim(regexp_replace(
                  case when left(name, length(client_name)) = client_name then substr(name, length(client_name) + 1) else name end,
                  '^\s*[–—-]\s*', ''))
         end as new_name
  from ranked
)
update public.leadgen_campaigns c
set name = w.new_name, updated_at = now()
from wanted w
where c.id = w.id and c.name is distinct from w.new_name;

-- 2. Call-list campaign label (display only): label + niche + market.
update public.call_list_segments s
set campaign_name = concat_ws(' — ', 'Lead Generation for Website & SEO', nullif(btrim(s.industry), ''), nullif(btrim(s.territory), ''))
from public.leadgen_campaigns c
join public.leadgen_clients cl on cl.id = c.client_id
where s.leadgen_campaign_id = c.id
  and s.crm = 'lead_generation'
  and cl.slug in ('hidebrandt-web-services', 'teknokraft-canada')
  and s.campaign_name is distinct from concat_ws(' — ', 'Lead Generation for Website & SEO', nullif(btrim(s.industry), ''), nullif(btrim(s.territory), ''));

-- 3. Two older Hidebrandt Winnipeg lists were still on Henry Osuji's roster;
--    Goodness Ugbana is the active Hidebrandt agent. Add her first (she already
--    holds Hidebrandt), then take Henry off. Only the roster changes - leads,
--    calls, notes and history stay as they are (the roster-name trigger refreshes
--    the list's agent suffix).
insert into public.call_list_segment_agents (segment_id, agent_id)
select s.id, g.id
from public.call_list_segments s
join public.leadgen_users g on g.full_name = 'Goodness Ugbana' and g.role = 'agent'
where s.id in ('7027d57e-581c-5de5-9f84-219bb059ef26', 'f61d41e3-a76f-47b9-aa62-d69b2e02b090')
  and exists (
    select 1 from public.leadgen_campaign_agents a
    join public.leadgen_campaigns c on c.id = a.campaign_id
    join public.leadgen_clients cl on cl.id = c.client_id
    where a.agent_id = g.id and cl.slug = 'hidebrandt-web-services'
  )
on conflict (segment_id, agent_id) do nothing;

delete from public.call_list_segment_agents sa
using public.leadgen_users h
where h.full_name = 'Henry Osuji' and h.role = 'agent'
  and sa.agent_id = h.id
  and sa.segment_id in ('7027d57e-581c-5de5-9f84-219bb059ef26', 'f61d41e3-a76f-47b9-aa62-d69b2e02b090')
  and exists (
    select 1 from public.call_list_segment_agents g
    join public.leadgen_users gu on gu.id = g.agent_id and gu.full_name = 'Goodness Ugbana'
    where g.segment_id = sa.segment_id
  );
