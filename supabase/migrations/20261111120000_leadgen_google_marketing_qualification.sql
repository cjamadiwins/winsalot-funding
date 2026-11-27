-- Google visibility / marketing step of the Hidebrandt and Teknokraft call
-- guides. Answers are stored on the existing per-lead qualification record
-- (leadgen_lead_qualifications) so they ride along with lead history, Admin
-- review and the appointment preparation brief. All columns are optional and
-- never required for "qualified"; other clients leave them null.

alter table public.leadgen_lead_qualifications
  add column if not exists google_interest text check (google_interest in ('yes', 'more', 'no')),
  add column if not exists online_customers_satisfied text check (online_customers_satisfied in ('satisfied', 'not_satisfied')),
  add column if not exists google_visibility text check (google_visibility in ('yes', 'no', 'unsure')),
  add column if not exists ai_search_interest text check (ai_search_interest in ('yes', 'no', 'more')),
  add column if not exists investing_marketing text check (investing_marketing in ('yes', 'no', 'unsure')),
  add column if not exists specialist_interest text check (specialist_interest in ('yes', 'no', 'follow_up'));

-- Same guard as before, plus the new standard service key 'digital_marketing'.
-- Admin still decides per client whether it is an approved service
-- (leadgen_client_qualification_settings.approved_services); nothing is auto-approved here.
create or replace function public.leadgen_qualification_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_bad text;
begin
  select picked.service into v_bad
  from unnest(new.services_of_interest) as picked(service)
  where picked.service not in ('new_website', 'redesign_rebranding', 'ecommerce', 'seo_visibility', 'human_search_optimization', 'digital_marketing')
    and picked.service not like 'custom:%'
  limit 1;
  if v_bad is not null then
    raise exception 'qualification_invalid_service: %', v_bad;
  end if;

  if new.lead_gen_only then
    new.category := 'not_qualified_lead_gen_only';
    if new.outcome = 'qualified' then
      raise exception 'qualification_not_allowed: the prospect wants lead generation only';
    end if;
  end if;

  if new.outcome = 'qualified' and not public.leadgen_qualification_is_qualifiable(new) then
    raise exception 'qualification_incomplete: missing %, or understanding/agreement not confirmed, or no Admin-approved service selected',
      coalesce(array_to_string(public.leadgen_qualification_missing(new), ', '), 'nothing');
  end if;

  if tg_op = 'UPDATE' then
    -- Once an appointment has been approved on this qualification, only Admin may edit it.
    if v_actor is not null
       and coalesce(public.leadgen_user_role(v_actor), '') <> 'admin'
       and exists (select 1 from public.leadgen_appointments a where a.qualification_id = old.id and a.qc_status = 'approved') then
      raise exception 'qualification_locked: an approved appointment depends on this qualification';
    end if;
    -- The lead and client a qualification belongs to never change.
    new.lead_id := old.lead_id;
    new.client_id := old.client_id;
  end if;

  if new.outcome = 'qualified' and new.submitted_at is null then
    new.submitted_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
