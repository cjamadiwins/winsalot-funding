-- Qualified-appointment confirmations for the Hidebrandt and Teknokraft call
-- guides. A prospect is only a qualified appointment when, in addition to the
-- earlier rules (genuine interest in an approved service, a stated need,
-- understanding and agreement), the person is the owner / decision-maker,
-- their contact information was verified and the appointment date and time
-- were confirmed. A request for information alone never qualifies.
--
-- Additive: three nullable columns and a replaced rule function. Records
-- created before 2026-11-11 are exempt from the three new confirmations.

alter table public.leadgen_lead_qualifications
  add column if not exists decision_maker text check (decision_maker in ('yes', 'no', 'unsure')),
  add column if not exists contact_verified boolean,
  add column if not exists appointment_confirmed boolean;

create or replace function public.leadgen_qualification_is_qualifiable(q public.leadgen_lead_qualifications)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_length(public.leadgen_qualification_missing(q), 1), 0) = 0
    and q.understands_services is true
    and q.agreed_to_appointment is true
    and q.lead_gen_only is not true
    -- Call confirmations (20261112000000): the appointment was accepted by the
    -- owner / decision-maker, the contact details were verified and the date
    -- and time were confirmed. Qualifications created before this rule keep
    -- the earlier requirements so existing records and approvals still work.
    and (
      q.created_at < timestamptz '2026-11-11 00:00:00+00'
      or (q.decision_maker = 'yes' and q.contact_verified is true and q.appointment_confirmed is true)
    )
    and exists (
      select 1
      from public.leadgen_client_qualification_settings s
      where s.client_id = q.client_id
        and exists (select 1 from unnest(q.services_of_interest) as picked(service) where picked.service = any (s.approved_services))
    );
$$;
