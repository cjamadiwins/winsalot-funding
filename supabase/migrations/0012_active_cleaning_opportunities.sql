-- Active Cleaning Opportunities: a lead-generation table of publicly
-- available RFPs/tenders/signals indicating a business or organization in
-- Metro Vancouver or the Greater Toronto Area may be in the market for
-- commercial cleaning/janitorial/custodial services. Purely additive - no
-- existing table, column, or row is modified.
--
-- Rows are written by the daily collection job (src/lib/opportunities/run.ts)
-- via the service-role client (src/app/api/cron/cleaning-opportunities/route.ts),
-- the same pattern already used for quote_requests writes from public forms.
-- Admins read/manage everything through the session-scoped client + RLS,
-- same as crm_leads. There is no agent-facing policy yet - assigned_agent
-- is a plain FK for CRM handoff, not a visibility gate, until a later phase
-- decides agents should see their assigned opportunities directly.
--
-- Every record is a *potential* opportunity surfaced from public sources,
-- never a guaranteed buyer - see docs/active-cleaning-opportunities.md.

create table if not exists public.active_cleaning_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_name text,
  opportunity_title text not null,
  description text,
  opportunity_type text not null check (opportunity_type in (
    'rfp_tender', 'quote_request', 'hiring_signal', 'new_location', 'other'
  )),
  service_needed text,
  city text,
  province text check (province is null or province in ('BC', 'ON')),
  contact_name text,
  public_email text,
  public_phone text,
  website text,
  source_name text not null,
  source_url text not null,
  date_posted date,
  deadline date,
  date_discovered timestamptz not null default now(),
  intent_score int not null default 0 check (intent_score between 0 and 100),
  intent_level text not null default 'Research' check (intent_level in ('Hot', 'Warm', 'Research')),
  status text not null default 'New' check (status in (
    'New', 'Reviewing', 'Assigned', 'Contacted', 'Follow-up',
    'Quote requested', 'Converted', 'Not suitable', 'Expired'
  )),
  assigned_agent uuid references public.crm_users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedup guard for the collection job's upsert (also re-checked in app code
-- via src/lib/opportunities/dedupe.ts, which fuzzy-matches title/org before
-- ever reaching this insert) - organization_name/description are nullable
-- so the unique index only covers the two fields every connector always
-- has: the opportunity's own title and its source link.
create unique index if not exists active_cleaning_opportunities_source_idx
  on public.active_cleaning_opportunities (source_url, opportunity_title);

create index if not exists active_cleaning_opportunities_city_idx
  on public.active_cleaning_opportunities (city);
create index if not exists active_cleaning_opportunities_province_idx
  on public.active_cleaning_opportunities (province);
create index if not exists active_cleaning_opportunities_intent_level_idx
  on public.active_cleaning_opportunities (intent_level);
create index if not exists active_cleaning_opportunities_status_idx
  on public.active_cleaning_opportunities (status);
create index if not exists active_cleaning_opportunities_deadline_idx
  on public.active_cleaning_opportunities (deadline);
create index if not exists active_cleaning_opportunities_assigned_agent_idx
  on public.active_cleaning_opportunities (assigned_agent);
create index if not exists active_cleaning_opportunities_date_discovered_idx
  on public.active_cleaning_opportunities (date_discovered desc);

alter table public.active_cleaning_opportunities enable row level security;

-- Admin-only for phase 1, same shape as crm_leads_admin_all. The daily
-- collection job never uses this policy - it writes via the service-role
-- client (src/lib/supabase-admin.ts), which bypasses RLS entirely, exactly
-- like the existing quote_requests writes from the public quote form.
create policy "active_cleaning_opportunities_admin_all"
  on public.active_cleaning_opportunities for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Keeps updated_at current on every admin edit (status change, note, agent
-- assignment) without every Server Action having to set it by hand.
create or replace function public.active_cleaning_opportunities_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists active_cleaning_opportunities_updated_at_trigger
  on public.active_cleaning_opportunities;

create trigger active_cleaning_opportunities_updated_at_trigger
  before update on public.active_cleaning_opportunities
  for each row
  execute function public.active_cleaning_opportunities_set_updated_at();

-- Trigger-only function, never called directly from application code or a
-- policy expression - same lockdown as crm_followups_sync_lead_next_follow_up
-- in migration 0011.
revoke execute on function public.active_cleaning_opportunities_set_updated_at() from public;
revoke execute on function public.active_cleaning_opportunities_set_updated_at() from anon;
revoke execute on function public.active_cleaning_opportunities_set_updated_at() from authenticated;
