-- Only the three existing Lead Generation website campaigns are scheduled.
-- Agreement records retain their original dates/statuses for Admin review.
-- Paused remains paused: activation is an explicit Admin action after the
-- September 29 date and review of consent/deposit requirements.
update public.leadgen_campaigns as campaign
set start_date = date '2026-09-29', updated_at = now()
from public.leadgen_clients as client
where campaign.client_id = client.id
  and client.active = true
  and client.name in ('Hidebrandt Web Services', 'Teknokraft Canada Inc.', 'Web6 Solutions')
  and campaign.status = 'paused'
  and campaign.start_date is distinct from date '2026-09-29';
