alter table public.crm_client_agreements
  add column if not exists appointment_target_min integer,
  add column if not exists appointment_target_max integer;

alter table public.crm_client_agreements
  add constraint crm_client_agreements_appointment_target_range_check
  check ((appointment_target_min is null and appointment_target_max is null)
    or (appointment_target_min > 0 and appointment_target_max >= appointment_target_min));

update public.crm_client_agreements a
set appointment_target_min = 8, appointment_target_max = 12
from public.crm_clients c
where a.client_id = c.id
  and c.company_name in ('Hidebrandt Web Services', 'Teknokraft Canada Inc.', 'Web6 Solutions')
  and a.campaign_type = 'performance_based_first'
  and a.status = 'draft'
  and a.monthly_target = 1;
