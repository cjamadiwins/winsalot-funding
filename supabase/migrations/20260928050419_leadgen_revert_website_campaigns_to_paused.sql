-- Correction: the prior migration (leadgen_website_campaign_launch_dates)
-- deliberately left these three campaigns 'paused', with the explicit note
-- that "activation is an explicit Admin action after the September 29 date
-- and review of consent/deposit requirements." A later change in this same
-- session (leadgen_launch_website_services_campaigns) flipped them to
-- 'active' in order to make them visible on the agent dashboard - that
-- silently overrode the documented decision above, which this migration
-- reverses. Agent-dashboard visibility for review purposes does not
-- require campaign.status = 'active' (RLS/campaign access is governed
-- entirely by leadgen_campaign_agents / leadgen_agent_campaign_allow, not
-- by this column) - see the corresponding application-code change that
-- lets the agent dashboard's "Your Current Campaigns" card show an
-- assigned campaign regardless of its active/paused status.
update public.leadgen_campaigns
set status = 'paused', updated_at = now()
where id in (
  '91e3698a-6c59-4f83-8eb4-e5cb93f86015', -- Hidebrandt Web Services – Website Services Lead Generation
  '5bd953fa-7cda-4cb6-ac39-614b475734f4', -- Teknokraft Canada Inc. – Website Design & SEO Lead Generation
  'af834207-4246-4b79-b373-03e75919fccb'  -- Web6 Solutions – Website Design Lead Generation
)
  and status = 'active';
