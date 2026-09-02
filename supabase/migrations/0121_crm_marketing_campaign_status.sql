-- Real Active/Paused/Archived status for each weekly-marketing campaign
-- (a MarketingCampaignType: lead_generation/business_financing/both_services -
-- see crm_marketing_templates.campaign_type). Previously "deleting" a
-- campaign was emulated purely by deactivating every one of its
-- templates (0119) - there was no single source of truth an admin page
-- or the weekly job could read a real status from. This table is that
-- source of truth: one row per campaign_type.
--
-- - 'active'   - sends on its normal schedule.
-- - 'paused'   - the weekly job (runCrmMarketingJob) skips every
--                enrollment in this campaign_type without touching the
--                enrollment row at all (see clearClaim() with no
--                updates) - so contact status, next_send_at, and
--                send_count are all exactly what they were before the
--                pause. Reactivating just flips this back to 'active';
--                the next due check naturally resumes each contact at
--                its own correct next step, never touching any
--                individually-unsubscribed/stopped/removed contact.
-- - 'archived' - the "Delete Campaign" outcome. Still never a real
--                DELETE of this row, crm_marketing_templates,
--                crm_marketing_enrollments, or crm_marketing_deliveries -
--                see 0119's own comment on why a hard delete of any of
--                those is unsafe (crm_marketing_deliveries.enrollment_id
--                is `on delete cascade`).
create table if not exists public.crm_marketing_campaigns (
  campaign_type text primary key check (campaign_type in (
    'lead_generation', 'business_financing', 'both_services'
  )),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  paused_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.crm_users(id) on delete set null
);

alter table public.crm_marketing_campaigns enable row level security;

create policy "crm_marketing_campaigns_admin_all"
  on public.crm_marketing_campaigns for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

insert into public.crm_marketing_campaigns (campaign_type)
values ('lead_generation'), ('business_financing'), ('both_services')
on conflict (campaign_type) do nothing;

-- Backfill: a campaign_type whose templates were already all deactivated
-- (the old "Delete Campaign" mechanism, before this table existed) is
-- carried forward as archived rather than silently reappearing as active.
update public.crm_marketing_campaigns c
set status = 'archived', archived_at = now(), updated_at = now()
where c.status = 'active'
  and exists (select 1 from public.crm_marketing_templates t where t.campaign_type = c.campaign_type)
  and not exists (select 1 from public.crm_marketing_templates t where t.campaign_type = c.campaign_type and t.active);
