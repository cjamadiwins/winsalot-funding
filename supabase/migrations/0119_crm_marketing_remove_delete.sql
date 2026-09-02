-- Support for "Remove from Campaign" (per Campaign Contact) and "Delete
-- Campaign" (per weekly email sequence) on /admin/crm/marketing.
--
-- Neither action ever deletes a row. crm_marketing_deliveries.enrollment_id
-- is `on delete cascade` (see 0117_crm_weekly_marketing.sql), so hard-
-- deleting a crm_marketing_enrollments row would destroy that contact's
-- previously-sent-email history - not allowed. Instead:
--   - "Remove from Campaign" sets status='stopped' (cancels future sends,
--     same mechanism the weekly job and "Stop" already rely on) and stamps
--     removed_at, which /admin/crm/marketing's query filters out of the
--     visible "Campaign Contacts" list. The row, its consent fields, and
--     its delivery history are untouched.
--   - "Delete Campaign" sets crm_marketing_templates.active=false for every
--     template in that campaign_type (already a supported, harmless state -
--     the weekly job just skips enrollments with "no active template for
--     this campaign") and removes (as above) every active/paused
--     enrollment of that campaign_type only, leaving other campaign types
--     untouched.
alter table public.crm_marketing_enrollments
  add column if not exists removed_at timestamptz;
