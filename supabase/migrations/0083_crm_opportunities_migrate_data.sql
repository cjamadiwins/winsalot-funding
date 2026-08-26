-- One-time data migration: copies every existing crm_leads row into
-- crm_opportunities as a 'lead_generation' opportunity (this pipeline only
-- ever ran quote-style commercial-cleaning lead work, which is the closest
-- existing analog to the new Lead Generation service). crm_leads itself is
-- left completely untouched - this is an INSERT, not a move - so nothing
-- about "don't delete the database" is violated, and crm_activities/
-- crm_followups rows for these leads stay reachable unchanged because the
-- id is carried over unchanged below (a migrated opportunity has the exact
-- same id as its source crm_leads row).
--
-- Cleaning-specific fields that have no equivalent column on
-- crm_opportunities (service_address, property_type, approximate_size,
-- cleaning_frequency, preferred_start_date, best_time_to_contact,
-- lead_source) are folded into the new row's notes rather than dropped, so
-- no historical detail is silently lost.
insert into public.crm_opportunities (
  id,
  created_at,
  opportunity_type,
  stage,
  business_name,
  contact_name,
  phone,
  email,
  city,
  notes,
  assigned_agent_id,
  created_by,
  next_follow_up_at,
  last_contacted_at,
  current_marketing_method,
  closed_reason,
  closed_at,
  closed_by
)
select
  l.id,
  l.created_at,
  'lead_generation',
  case l.stage
    when 'New interested lead' then 'New Prospect'
    when 'Waiting for cleaning details' then 'Contacted'
    when 'Quote requested from provider' then 'Interested'
    when 'Provider quote received' then 'Interested'
    when 'Quote sent to customer' then 'Proposal or Application Sent'
    when 'Follow-up required' then 'Follow-Up Required'
    when 'Customer accepted' then 'Client Won'
    when 'Customer declined' then 'Not Interested'
    when 'No response' then 'Follow-Up Required'
    when 'Closed/completed' then 'Client Won'
    when 'Closed – Won' then 'Client Won'
    when 'Closed – Lost' then 'Not Interested'
    else 'New Prospect'
  end,
  l.business_name,
  l.contact_name,
  l.phone,
  l.email,
  l.city,
  trim(both e'\n' from concat_ws(e'\n',
    nullif(l.notes, ''),
    case when l.service_address is not null or l.property_type is not null
           or l.approximate_size is not null or l.cleaning_frequency is not null
           or l.preferred_start_date is not null or l.best_time_to_contact is not null
           or l.lead_source is not null
      then trim(both e'\n' from concat_ws(e'\n',
        '[Migrated from legacy Cleaning CRM lead]',
        case when l.service_address is not null then 'Service address: ' || l.service_address end,
        case when l.property_type is not null then 'Property type: ' || l.property_type end,
        case when l.approximate_size is not null then 'Approximate size: ' || l.approximate_size end,
        case when l.cleaning_frequency is not null then 'Cleaning frequency: ' || l.cleaning_frequency end,
        case when l.preferred_start_date is not null then 'Preferred start date: ' || l.preferred_start_date::text end,
        case when l.best_time_to_contact is not null then 'Best time to contact: ' || l.best_time_to_contact end,
        case when l.lead_source is not null then 'Lead source: ' || l.lead_source end
      ))
    end
  )),
  l.assigned_agent_id,
  l.created_by,
  l.next_follow_up_at,
  l.last_contacted_at,
  l.service_requested,
  case
    when l.closed_reason is not null then l.closed_reason
    when l.stage in ('Customer accepted', 'Customer declined', 'No response', 'Closed/completed')
      then 'Migrated from legacy pipeline'
    else null
  end,
  coalesce(l.closed_at, case
    when l.stage in ('Customer accepted', 'Customer declined', 'Closed/completed', 'Closed – Won', 'Closed – Lost')
      then l.created_at
    else null
  end),
  l.closed_by
from public.crm_leads l
on conflict (id) do nothing;

-- Repoint opportunity_id on every existing crm_activities/crm_followups
-- row that belongs to a migrated lead, so a migrated opportunity's full
-- activity timeline and scheduled callbacks show up in the new
-- opportunity-scoped UI/RLS (which queries by opportunity_id) without
-- losing anything or duplicating rows. lead_id is cleared in the same
-- statement (not left set alongside opportunity_id) to satisfy the
-- pre-existing three-way crm_activities_exactly_one_target /
-- crm_followups_exactly_one_target check constraints (migration 0026,
-- "exactly one of lead_id/opportunity_id/provider_lead_id"), which this
-- migration deliberately leaves untouched rather than loosening. Nothing
-- is actually lost by clearing lead_id: a migrated opportunity carries
-- the exact same id as its source crm_leads row (see the INSERT above),
-- so the historical link is still fully recoverable through
-- opportunity_id alone.
update public.crm_activities a
set opportunity_id = a.lead_id, lead_id = null
where a.lead_id is not null
  and a.opportunity_id is null
  and exists (select 1 from public.crm_opportunities o where o.id = a.lead_id);

update public.crm_followups f
set opportunity_id = f.lead_id, lead_id = null
where f.lead_id is not null
  and f.opportunity_id is null
  and exists (select 1 from public.crm_opportunities o where o.id = f.lead_id);
