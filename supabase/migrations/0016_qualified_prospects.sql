-- Expands Active Cleaning Opportunities into a daily lead engine with two
-- categories on the same table: 'Active Opportunity' (the existing
-- strict tender/RFP collector, unchanged) and 'Qualified Prospect' (a new
-- source category - businesses that fit strong commercial-cleaning
-- target profiles but haven't publicly requested cleaning). Purely
-- additive except for one rename: intent_level's third tier is renamed
-- 'Research' -> 'Prospect', since it's now shared by both categories
-- (a weak-signal tender and a directory-sourced prospect with no
-- confirmed buying signal both land there) and "Prospect" reads far
-- better for the latter, which is now the common case. Existing rows are
-- migrated, not dropped.

update public.active_cleaning_opportunities
set intent_level = 'Prospect'
where intent_level = 'Research';

alter table public.active_cleaning_opportunities
  drop constraint if exists active_cleaning_opportunities_intent_level_check;

alter table public.active_cleaning_opportunities
  add constraint active_cleaning_opportunities_intent_level_check
  check (intent_level in ('Hot', 'Warm', 'Prospect'));

alter table public.active_cleaning_opportunities
  drop constraint if exists active_cleaning_opportunities_opportunity_type_check;

alter table public.active_cleaning_opportunities
  add constraint active_cleaning_opportunities_opportunity_type_check
  check (opportunity_type in (
    'rfp_tender', 'quote_request', 'hiring_signal', 'new_location', 'qualified_prospect', 'other'
  ));

alter table public.active_cleaning_opportunities
  add column if not exists lead_category text not null default 'Active Opportunity'
  check (lead_category in ('Active Opportunity', 'Qualified Prospect'));

alter table public.active_cleaning_opportunities
  add column if not exists industry text;

create index if not exists active_cleaning_opportunities_lead_category_idx
  on public.active_cleaning_opportunities (lead_category);
create index if not exists active_cleaning_opportunities_industry_idx
  on public.active_cleaning_opportunities (industry);

-- Extends the agent column-restriction trigger (migration 0012, extended
-- again in 0015; same function name replaced in place) so lead_category
-- and industry join the other system/admin-determined fields an agent can
-- never edit.
create or replace function public.active_cleaning_opportunities_restrict_agent_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.crm_user_role(auth.uid()) = 'agent' then
    if new.status is distinct from old.status
      and new.status not in (
        'New', 'Contacted', 'No answer', 'Follow-up required',
        'Quote requested', 'Converted', 'Not suitable', 'Expired'
      )
    then
      raise exception 'Agents cannot set opportunities to this status.';
    end if;

    if new.assigned_agent is distinct from old.assigned_agent then
      raise exception 'Agents cannot reassign opportunities.';
    end if;

    if new.intent_score is distinct from old.intent_score
      or new.intent_level is distinct from old.intent_level
      or new.source_name is distinct from old.source_name
      or new.source_url is distinct from old.source_url
      or new.matched_cleaning_terms is distinct from old.matched_cleaning_terms
      or new.accepted_reason is distinct from old.accepted_reason
      or new.lead_category is distinct from old.lead_category
      or new.industry is distinct from old.industry
    then
      raise exception 'Agents cannot edit intent scoring, source, or classification details.';
    end if;

    if new.organization_name is distinct from old.organization_name
      or new.opportunity_title is distinct from old.opportunity_title
      or new.description is distinct from old.description
      or new.opportunity_type is distinct from old.opportunity_type
      or new.service_needed is distinct from old.service_needed
      or new.city is distinct from old.city
      or new.province is distinct from old.province
      or new.contact_name is distinct from old.contact_name
      or new.public_email is distinct from old.public_email
      or new.public_phone is distinct from old.public_phone
      or new.website is distinct from old.website
      or new.date_posted is distinct from old.date_posted
      or new.deadline is distinct from old.deadline
      or new.notes is distinct from old.notes
      or new.archived_at is distinct from old.archived_at
      or new.archived_by is distinct from old.archived_by
    then
      raise exception 'Agents cannot edit business, contact, or archive information.';
    end if;
  end if;
  return new;
end;
$$;
