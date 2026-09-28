-- Launch the three Website Services campaigns (Hidebrandt Web Services,
-- Teknokraft Canada Inc., Web6 Solutions) for the September 29, 2026
-- outbound calling start date. Their leadgen_clients/leadgen_campaigns rows
-- and leadgen_campaign_agents assignments (Henry Osuji, Goodness Ugbana)
-- already existed from prior work; only the campaign status was still
-- 'paused', which kept them out of every active-campaign query on the
-- agent dashboard. Flipping to 'active' does not change RLS (campaign
-- access is governed by leadgen_campaign_agents / leadgen_agent_campaign_allowed,
-- not by this status column) - it only makes them selectable/visible where
-- the dashboard already filters on status = 'active'.
update public.leadgen_campaigns
set status = 'active', updated_at = now()
where id in (
  '91e3698a-6c59-4f83-8eb4-e5cb93f86015', -- Hidebrandt Web Services – Website Services Lead Generation
  '5bd953fa-7cda-4cb6-ac39-614b475734f4', -- Teknokraft Canada Inc. – Website Design & SEO Lead Generation
  'af834207-4246-4b79-b373-03e75919fccb'  -- Web6 Solutions – Website Design Lead Generation
)
  and status = 'paused';
