-- Expands Qualified Prospects into a daily-rotating engine sourced from
-- OpenStreetMap's Overpass API: per-city (not just per-region) queries, an
-- explicit street address and OpenStreetMap element id per record, a
-- dedicated prospect status vocabulary agents use instead of the tender
-- pipeline's, and a small log table recording each collection run so the
-- admin dashboard can show "last successful search" without re-deriving it
-- from the opportunities table itself (candidates found/rejected are never
-- persisted there - see docs/active-cleaning-opportunities.md). NOT applied
-- to the live project yet - pending approval, per the established pattern
-- for this feature.

alter table public.active_cleaning_opportunities
  add column if not exists address text;

alter table public.active_cleaning_opportunities
  add column if not exists osm_id text;

create index if not exists active_cleaning_opportunities_osm_id_idx
  on public.active_cleaning_opportunities (osm_id)
  where osm_id is not null;

-- Status values are shared by both lead categories on the same column;
-- which subset is actually valid for a given row is enforced by
-- lead_category down in the agent-restrict trigger below (an admin can
-- still set either set on either category, matching the existing "admin
-- bypasses the trigger entirely" pattern - only agents are restricted to
-- their own category's vocabulary).
alter table public.active_cleaning_opportunities
  drop constraint if exists active_cleaning_opportunities_status_check;

alter table public.active_cleaning_opportunities
  add constraint active_cleaning_opportunities_status_check
  check (status in (
    'New', 'Reviewing', 'Assigned', 'Contacted', 'No answer', 'Follow-up required',
    'Quote requested', 'Converted', 'Not suitable', 'Expired',
    'Unverified Prospect', 'Verified', 'Invalid', 'Called', 'Interested', 'Follow-up', 'Not Interested'
  ));

-- One row per daily qualified-prospects collection run, written by the
-- same service-role client the run itself uses
-- (src/lib/opportunities/run.ts) - never by a session-scoped client, same
-- "system-of-record trail, not agent-writable" pattern as the audit log
-- above.
create table if not exists public.opportunity_collection_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  source_name text not null default 'OpenStreetMap (Overpass API)',
  cities_searched text[] not null default '{}',
  industries_searched text[] not null default '{}',
  candidates_found int not null default 0,
  new_records_added int not null default 0,
  duplicates_skipped int not null default 0,
  errors text[] not null default '{}',
  success boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists opportunity_collection_runs_ran_at_idx
  on public.opportunity_collection_runs (ran_at desc);

alter table public.opportunity_collection_runs enable row level security;

-- Admin-only read, same shape as the opportunities audit log's own policy.
-- No insert/update/delete policy for any session-scoped role - only the
-- collection job's service-role client writes here.
create policy "opportunity_collection_runs_admin_select"
  on public.opportunity_collection_runs for select
  using (public.crm_user_role(auth.uid()) = 'admin');

-- Extends the agent column-restriction trigger (migration 0012, extended in
-- 0015/0016; same function name replaced in place): the allowed status set
-- now branches by lead_category (a Qualified Prospect uses its own agent
-- vocabulary - Verified/Invalid/Called/Interested/Follow-up/Not Interested
-- - never the tender pipeline's), and address/osm_id join the other
-- system/admin-determined fields an agent can never edit.
create or replace function public.active_cleaning_opportunities_restrict_agent_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.crm_user_role(auth.uid()) = 'agent' then
    if new.status is distinct from old.status then
      if old.lead_category = 'Qualified Prospect' then
        if new.status not in ('Verified', 'Invalid', 'Called', 'Interested', 'Follow-up', 'Not Interested') then
          raise exception 'Agents cannot set prospects to this status.';
        end if;
      else
        if new.status not in (
          'New', 'Contacted', 'No answer', 'Follow-up required',
          'Quote requested', 'Converted', 'Not suitable', 'Expired'
        ) then
          raise exception 'Agents cannot set opportunities to this status.';
        end if;
      end if;
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
      or new.osm_id is distinct from old.osm_id
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
      or new.address is distinct from old.address
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
