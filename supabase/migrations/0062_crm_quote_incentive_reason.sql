-- Weekly Agent Incentive - a reason column alongside quote_requests.
-- incentive_status (migration 0058), mirroring 0061 for the Lead Gen
-- CRM: an admin marking a quote Draft/Cancelled/Invalid/Duplicate/Test
-- can record why (brief: "Reject invalid records using a required
-- reason"). Nullable here too - "required" is enforced by the admin
-- quote workflow UI when the marked status isn't Qualified/unreviewed.
alter table public.quote_requests
  add column if not exists incentive_status_reason text;
