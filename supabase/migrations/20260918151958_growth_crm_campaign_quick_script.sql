-- Growth CRM: agent-selected "current campaign" for the Quick Call Script
-- card on the admin (/admin/crm) and agent (/agent/dashboard) dashboards -
-- which service the agent is presently calling for, so the card shows
-- exactly one campaign's script instead of every script at once. A fixed
-- text key rather than a campaign table row (unlike the Lead Generation
-- CRM's leadgen_users.current_campaign_id, migration 0118) - the Growth
-- CRM has no separate campaigns table, and these six keys are also the
-- only ones GROWTH_CRM_CAMPAIGN_SCRIPTS
-- (src/lib/growth-crm-campaign-scripts.ts) has a script for.

alter table public.crm_users
  add column if not exists current_campaign_key text
    check (current_campaign_key in (
      'website-development',
      'marketing-agencies',
      'bookkeeping-accounting',
      'it-services',
      'security-systems',
      'business-finance'
    ));
