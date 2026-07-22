-- Adds the data-quality fields the stricter cleaning-relevance filter
-- writes on every accepted record: the exact strong cleaning-related
-- phrase(s) matched, and a short human-readable reason it was accepted
-- (see src/lib/opportunities/cleaning-relevance.ts). Purely additive -
-- both columns are nullable, so every existing row (including the two
-- from the first live run, reviewed and corrected separately) is
-- unaffected.

alter table public.active_cleaning_opportunities
  add column if not exists matched_cleaning_terms text[];

alter table public.active_cleaning_opportunities
  add column if not exists accepted_reason text;

-- Extends the agent column-restriction trigger (migration 0012, same
-- function name replaced in place) so these two new system-determined
-- fields join intent_score/intent_level/source_name/source_url as things
-- an agent can never edit, even on their own assigned opportunity.
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
