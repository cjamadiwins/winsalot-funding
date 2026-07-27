-- Provider Profile: the single, permanent operational profile for a
-- cleaning provider, built on the pre-existing `cleaning_providers` table
-- (migration 0004) rather than a new identity table. `cleaning_providers`
-- is what the quote-assignment system (`quote_requests`,
-- `provider_quote_tokens`, `provider_quote_submissions`) already
-- references - this migration only *adds* columns to it, so every
-- existing row, every existing query (provider selection/assignment,
-- copy-on-quote, the /admin/providers directory), and the quote pipeline
-- itself keep working exactly as before.
--
-- `provider_leads` (Provider Acquisition, migration 0026/0027) stays the
-- recruiting pipeline only: it gains a permanent `cleaning_provider_id`
-- link, set automatically the moment a lead is approved (never a manual
-- admin linking step - see the "Approve and Add to Providers" action in
-- application code), after which the same `cleaning_providers` row is the
-- provider's profile everywhere - Provider Acquisition, the Providers
-- directory, quote assignment, and quote history alike.
--
-- Purely additive throughout: no existing table, column, row, policy, or
-- trigger is dropped or rewritten in a way that changes current behavior
-- for customer quote requests, provider quotes, CRM leads, training,
-- authentication, email tracking, or SMS notifications.

-- ---------------------------------------------------------------------
-- cleaning_providers: the operational Provider Profile
-- ---------------------------------------------------------------------
alter table public.cleaning_providers
  add column if not exists assigned_agent_id uuid references public.crm_users(id) on delete set null,
  add column if not exists created_by uuid references public.crm_users(id) on delete set null,
  add column if not exists logo_path text,
  add column if not exists job_title text,
  add column if not exists website text,
  add column if not exists street_address text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists cities_served text[] not null default '{}',
  add column if not exists services_offered text[] not null default '{}',
  add column if not exists years_in_business text,
  add column if not exists number_of_employees text,
  add column if not exists business_description text,
  add column if not exists wsib_wcb_applicable boolean not null default true,
  -- Same Follow-Up Calendar / last-contact bookkeeping already used by
  -- provider_leads, so agent-scheduled follow-ups and activity logging
  -- work identically on an operational provider.
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_follow_up_at timestamptz,
  -- Denormalized "latest tracked email" mirror, same pattern as
  -- provider_leads.last_email_* (migration 0026).
  add column if not exists last_email_status text check (last_email_status is null or last_email_status in (
    'sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed'
  )),
  add column if not exists last_email_status_at timestamptz,
  add column if not exists last_email_type text check (last_email_type is null or last_email_type in ('provider_message')),
  add column if not exists last_email_to text;

-- Provider Scorecard - lives only on the operational profile (a
-- not-yet-approved Provider Acquisition lead has no scorecard at all).
alter table public.cleaning_providers
  add column if not exists score smallint check (score is null or (score between 0 and 100)),
  add column if not exists score_label text,
  add column if not exists score_breakdown jsonb,
  add column if not exists score_missing_categories text[] not null default '{}',
  add column if not exists score_is_new_provider boolean not null default false,
  add column if not exists score_calculated_at timestamptz;

create index if not exists cleaning_providers_assigned_agent_idx on public.cleaning_providers(assigned_agent_id);
create index if not exists cleaning_providers_score_idx on public.cleaning_providers(score);
create index if not exists cleaning_providers_next_follow_up_idx on public.cleaning_providers(next_follow_up_at);

-- Adds 'suspended' alongside the two existing values - an administrator
-- can suspend an operational provider without deleting their history.
-- 'active'/'inactive' keep meaning exactly what they already do
-- everywhere else (e.g. the quote-assignment dropdown's
-- `status === 'active'` filter).
alter table public.cleaning_providers drop constraint if exists cleaning_providers_status_check;
alter table public.cleaning_providers add constraint cleaning_providers_status_check
  check (status in ('active', 'inactive', 'suspended'));

-- Admin: unrestricted, matching every other admin-scoped table in this
-- project. Agents: read/update only providers assigned to them
-- (brief: "Agents may manage assigned operational providers... but may
-- not approve, delete, suspend, decline, or reassign them" - enforced at
-- the Server Action layer, same convention as provider_leads; RLS here
-- only draws the row-ownership boundary). No insert/delete policy for
-- agents - creating a new operational provider only ever happens through
-- an admin action (direct "Add Provider" or the "Approve and Add to
-- Providers" action).
alter table public.cleaning_providers enable row level security;

create policy "cleaning_providers_admin_all"
  on public.cleaning_providers for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "cleaning_providers_agent_select_own"
  on public.cleaning_providers for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and assigned_agent_id = auth.uid()
  );

create policy "cleaning_providers_agent_update_own"
  on public.cleaning_providers for update
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and assigned_agent_id = auth.uid()
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and assigned_agent_id = auth.uid()
  );

-- ---------------------------------------------------------------------
-- provider_leads: recruiting pipeline only, permanently linked once
-- approved.
-- ---------------------------------------------------------------------
alter table public.provider_leads
  add column if not exists logo_path text,
  add column if not exists job_title text,
  add column if not exists street_address text,
  add column if not exists postal_code text,
  add column if not exists number_of_employees text,
  add column if not exists business_description text,
  add column if not exists cities_served text[] not null default '{}',
  add column if not exists wsib_wcb_applicable boolean not null default true,
  -- Set automatically by the "Approve and Add to Providers" action
  -- (src/lib/provider-approval.ts) - never edited directly by an admin
  -- picking from a dropdown, and never cleared once set.
  add column if not exists cleaning_provider_id uuid references public.cleaning_providers(id) on delete set null;

create index if not exists provider_leads_cleaning_provider_idx on public.provider_leads(cleaning_provider_id);

-- Widened alongside crm_lead_emails_email_type_check below so the
-- generic "Send Email" quick action can also be used on a
-- not-yet-approved Provider Acquisition lead, not just an approved
-- operational provider.
alter table public.provider_leads drop constraint if exists provider_leads_last_email_type_check;
alter table public.provider_leads add constraint provider_leads_last_email_type_check
  check (last_email_type is null or last_email_type in ('provider_intake', 'provider_message'));

-- New provider-status values the Provider Profile adds (Active/Inactive/
-- Suspended/Declined) alongside every status already in use - no existing
-- status value is removed or renamed, so every existing row and every
-- existing status-based query keeps working unchanged. ("Active" here
-- still just means "the acquisition record considers this provider
-- active" - once approved, the operational status on cleaning_providers
-- is what actually governs quote-assignment eligibility.)
alter table public.provider_leads drop constraint if exists provider_leads_status_check;
alter table public.provider_leads add constraint provider_leads_status_check
  check (status in (
    'New', 'Contact Attempted', 'Contacted', 'Interested', 'Intake Form Sent',
    'Follow-up Required', 'Intake Form Completed', 'Under Review',
    'Approved Provider', 'Not Interested', 'Invalid Contact', 'Closed',
    'Active', 'Inactive', 'Suspended', 'Declined'
  ));

-- ---------------------------------------------------------------------
-- crm_activities / crm_followups / crm_lead_emails: extended with a 4th
-- mutually-exclusive target so the operational profile has its own
-- activity timeline, follow-up calendar, and tracked-email history,
-- exactly like leads/opportunities/provider_leads already do. A record's
-- pre-approval acquisition-phase history (tied to provider_lead_id) is
-- never moved or retargeted - the operational profile displays it
-- alongside its own history via a join through provider_leads, so nothing
-- from the recruiting phase is lost or duplicated.
-- ---------------------------------------------------------------------
alter table public.crm_activities
  add column if not exists cleaning_provider_id uuid references public.cleaning_providers(id) on delete cascade;

alter table public.crm_activities drop constraint if exists crm_activities_exactly_one_target;
alter table public.crm_activities add constraint crm_activities_exactly_one_target
  check (
    (case when lead_id is not null then 1 else 0 end)
    + (case when opportunity_id is not null then 1 else 0 end)
    + (case when provider_lead_id is not null then 1 else 0 end)
    + (case when cleaning_provider_id is not null then 1 else 0 end)
    = 1
  );

create index if not exists crm_activities_cleaning_provider_idx on public.crm_activities(cleaning_provider_id, occurred_at desc);

-- New system-logged activity types for both the Provider Acquisition and
-- operational-profile timelines (status changes, agent reassignment,
-- quote invitations/submissions/decisions, and score recalculations).
-- Every activity type already in use (call, email, text, voicemail, note,
-- outcome) is kept exactly as-is - purely an addition to the allowed set.
-- The "Log Activity" form's own dropdown (ACTIVITY_TYPES in
-- src/lib/crm-types.ts) is deliberately left unchanged, so these new
-- types are only ever written by system code, not offered as a manual
-- entry.
alter table public.crm_activities drop constraint if exists crm_activities_activity_type_check;
alter table public.crm_activities add constraint crm_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'text', 'voicemail', 'note', 'outcome',
    'status_change', 'assignment_change',
    'quote_invited', 'quote_submitted', 'quote_accepted', 'quote_declined',
    'score_change'
  ));

drop policy if exists "crm_activities_agent_select_own_lead" on public.crm_activities;
create policy "crm_activities_agent_select_own_lead"
  on public.crm_activities for select
  using (
    (lead_id is not null and exists (
      select 1 from public.crm_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    ))
    or
    (opportunity_id is not null and exists (
      select 1 from public.active_cleaning_opportunities o
      where o.id = opportunity_id and o.assigned_agent = auth.uid()
    ))
    or
    (provider_lead_id is not null and exists (
      select 1 from public.provider_leads p
      where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
    ))
    or
    (cleaning_provider_id is not null and exists (
      select 1 from public.cleaning_providers cp
      where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
    ))
  );

drop policy if exists "crm_activities_agent_insert_own_lead" on public.crm_activities;
create policy "crm_activities_agent_insert_own_lead"
  on public.crm_activities for insert
  with check (
    agent_id = auth.uid()
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
      or
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
      or
      (cleaning_provider_id is not null and exists (
        select 1 from public.cleaning_providers cp
        where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
      ))
    )
  );

alter table public.crm_followups
  add column if not exists cleaning_provider_id uuid references public.cleaning_providers(id) on delete cascade;

alter table public.crm_followups drop constraint if exists crm_followups_exactly_one_target;
alter table public.crm_followups add constraint crm_followups_exactly_one_target
  check (
    (case when lead_id is not null then 1 else 0 end)
    + (case when opportunity_id is not null then 1 else 0 end)
    + (case when provider_lead_id is not null then 1 else 0 end)
    + (case when cleaning_provider_id is not null then 1 else 0 end)
    = 1
  );

create index if not exists crm_followups_cleaning_provider_idx on public.crm_followups(cleaning_provider_id);
create index if not exists crm_followups_cleaning_provider_pending_scheduled_at_idx
  on public.crm_followups(scheduled_at)
  where status = 'pending' and cleaning_provider_id is not null;

drop policy if exists "crm_followups_agent_select_own_lead" on public.crm_followups;
create policy "crm_followups_agent_select_own_lead"
  on public.crm_followups for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
      or
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
      or
      (cleaning_provider_id is not null and exists (
        select 1 from public.cleaning_providers cp
        where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
      ))
    )
  );

drop policy if exists "crm_followups_agent_insert_own_lead" on public.crm_followups;
create policy "crm_followups_agent_insert_own_lead"
  on public.crm_followups for insert
  with check (
    scheduled_by = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
      or
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
      or
      (cleaning_provider_id is not null and exists (
        select 1 from public.cleaning_providers cp
        where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
      ))
    )
  );

drop policy if exists "crm_followups_agent_update_own_lead" on public.crm_followups;
create policy "crm_followups_agent_update_own_lead"
  on public.crm_followups for update
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
      or
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
      or
      (cleaning_provider_id is not null and exists (
        select 1 from public.cleaning_providers cp
        where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
      ))
    )
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
      or
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
      or
      (cleaning_provider_id is not null and exists (
        select 1 from public.cleaning_providers cp
        where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
      ))
    )
  );

-- Extends the existing sync trigger function (created in migration 0011,
-- extended for opportunities in 0013 and provider_leads in 0026) in
-- place so it also maintains cleaning_providers.next_follow_up_at. Every
-- other target keeps behaving exactly as before.
create or replace function public.crm_followups_sync_lead_next_follow_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lead_id uuid := coalesce(new.lead_id, old.lead_id);
  target_opportunity_id uuid := coalesce(new.opportunity_id, old.opportunity_id);
  target_provider_lead_id uuid := coalesce(new.provider_lead_id, old.provider_lead_id);
  target_cleaning_provider_id uuid := coalesce(new.cleaning_provider_id, old.cleaning_provider_id);
  next_pending timestamptz;
begin
  if target_lead_id is not null then
    select min(scheduled_at) into next_pending
    from public.crm_followups
    where lead_id = target_lead_id and status = 'pending';

    update public.crm_leads
    set next_follow_up_at = next_pending
    where id = target_lead_id;
  end if;

  if target_opportunity_id is not null then
    select min(scheduled_at) into next_pending
    from public.crm_followups
    where opportunity_id = target_opportunity_id and status = 'pending';

    update public.active_cleaning_opportunities
    set next_follow_up_at = next_pending
    where id = target_opportunity_id;
  end if;

  if target_provider_lead_id is not null then
    select min(scheduled_at) into next_pending
    from public.crm_followups
    where provider_lead_id = target_provider_lead_id and status = 'pending';

    update public.provider_leads
    set next_follow_up_at = next_pending
    where id = target_provider_lead_id;
  end if;

  if target_cleaning_provider_id is not null then
    select min(scheduled_at) into next_pending
    from public.crm_followups
    where cleaning_provider_id = target_cleaning_provider_id and status = 'pending';

    update public.cleaning_providers
    set next_follow_up_at = next_pending
    where id = target_cleaning_provider_id;
  end if;

  return coalesce(new, old);
end;
$$;

alter table public.crm_lead_emails
  add column if not exists cleaning_provider_id uuid references public.cleaning_providers(id) on delete cascade;

alter table public.crm_lead_emails alter column lead_id drop not null;

alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_exactly_one_target;
alter table public.crm_lead_emails add constraint crm_lead_emails_exactly_one_target
  check (
    (case when lead_id is not null then 1 else 0 end)
    + (case when provider_lead_id is not null then 1 else 0 end)
    + (case when cleaning_provider_id is not null then 1 else 0 end)
    = 1
  );

create index if not exists crm_lead_emails_cleaning_provider_idx on public.crm_lead_emails(cleaning_provider_id, created_at desc);

-- New tracked email type for the generic "Send Email" quick action
-- (distinct from the existing 'provider_intake' template email, which is
-- unchanged).
alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_email_type_check;
alter table public.crm_lead_emails add constraint crm_lead_emails_email_type_check
  check (email_type in ('quote_request', 'follow_up', 'provider_intake', 'provider_message'));

-- ---------------------------------------------------------------------
-- Internal Notes - dual-keyed: a note logged during the recruiting phase
-- keeps its provider_lead_id, and is also linked to cleaning_provider_id
-- the moment that lead is approved (backfilled by the approval action),
-- so it continues to show up on the operational profile without being
-- copied into a second row. A note logged directly against an operational
-- provider (including ones that never went through Provider Acquisition
-- at all) only ever has cleaning_provider_id set. Never visible to
-- providers - there is no provider-facing login to this data anywhere in
-- the app.
-- ---------------------------------------------------------------------
create table if not exists public.provider_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_lead_id uuid references public.provider_leads(id) on delete cascade,
  cleaning_provider_id uuid references public.cleaning_providers(id) on delete cascade,
  user_id uuid references public.crm_users(id) on delete set null,
  -- Denormalized author display name, captured at write time. crm_users
  -- only lets an agent select their *own* row (crm_users_select_self,
  -- migration 0010), so a note authored by someone else (an admin, or a
  -- different agent before a reassignment) could never be resolved to a
  -- name via a join from an agent's session - this avoids that entirely.
  author_name text not null,
  note text not null,
  constraint provider_notes_at_least_one_target check (
    provider_lead_id is not null or cleaning_provider_id is not null
  )
);

create index if not exists provider_notes_provider_lead_idx on public.provider_notes(provider_lead_id, created_at desc);
create index if not exists provider_notes_cleaning_provider_idx on public.provider_notes(cleaning_provider_id, created_at desc);

alter table public.provider_notes enable row level security;

create policy "provider_notes_admin_all"
  on public.provider_notes for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "provider_notes_agent_select_own"
  on public.provider_notes for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
      or
      (cleaning_provider_id is not null and exists (
        select 1 from public.cleaning_providers cp
        where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
      ))
    )
  );

create policy "provider_notes_agent_insert_own"
  on public.provider_notes for insert
  with check (
    user_id = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and (
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
      or
      (cleaning_provider_id is not null and exists (
        select 1 from public.cleaning_providers cp
        where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
      ))
    )
  );

-- Agents may only ever edit their own note - never another agent's, even
-- for a provider assigned to them.
create policy "provider_notes_agent_update_own_note"
  on public.provider_notes for update
  using (public.crm_user_role(auth.uid()) = 'agent' and user_id = auth.uid())
  with check (public.crm_user_role(auth.uid()) = 'agent' and user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Files - Business Licence, Insurance Certificate, WSIB/WCB,
-- Certifications, Other Documents. Same dual-key pattern as
-- provider_notes. Stored in the private `provider-files` storage bucket
-- below; agents can upload but never permanently remove - only an
-- administrator can.
-- ---------------------------------------------------------------------
create table if not exists public.provider_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_lead_id uuid references public.provider_leads(id) on delete cascade,
  cleaning_provider_id uuid references public.cleaning_providers(id) on delete cascade,
  uploaded_by uuid references public.crm_users(id) on delete set null,
  doc_type text not null check (doc_type in (
    'business_licence', 'insurance_certificate', 'wsib_wcb', 'certification', 'other'
  )),
  file_name text not null,
  storage_path text not null,
  file_size bigint,
  mime_type text,
  expires_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references public.crm_users(id) on delete set null,
  constraint provider_documents_at_least_one_target check (
    provider_lead_id is not null or cleaning_provider_id is not null
  )
);

create index if not exists provider_documents_provider_lead_idx on public.provider_documents(provider_lead_id, created_at desc);
create index if not exists provider_documents_cleaning_provider_idx on public.provider_documents(cleaning_provider_id, created_at desc);

alter table public.provider_documents enable row level security;

create policy "provider_documents_admin_all"
  on public.provider_documents for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "provider_documents_agent_select_own"
  on public.provider_documents for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
      or
      (cleaning_provider_id is not null and exists (
        select 1 from public.cleaning_providers cp
        where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
      ))
    )
  );

create policy "provider_documents_agent_insert_own"
  on public.provider_documents for insert
  with check (
    uploaded_by = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and (
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
      or
      (cleaning_provider_id is not null and exists (
        select 1 from public.cleaning_providers cp
        where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
      ))
    )
  );

-- ---------------------------------------------------------------------
-- Manual Scorecard Adjustments - administrator-only, always shown
-- separately from the automatically calculated score. Scorecards only
-- exist on the operational profile, so this targets cleaning_providers
-- exclusively (no dual-key needed).
-- ---------------------------------------------------------------------
create table if not exists public.provider_score_adjustments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cleaning_provider_id uuid not null references public.cleaning_providers(id) on delete cascade,
  admin_id uuid references public.crm_users(id) on delete set null,
  amount smallint not null check (amount between -100 and 100),
  reason text not null
);

create index if not exists provider_score_adjustments_cleaning_provider_idx
  on public.provider_score_adjustments(cleaning_provider_id, created_at desc);

alter table public.provider_score_adjustments enable row level security;

create policy "provider_score_adjustments_admin_all"
  on public.provider_score_adjustments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Agents can view adjustments for providers assigned to them (transparency
-- of the scorecard) but can never create, edit, or remove one themselves.
create policy "provider_score_adjustments_agent_select_own"
  on public.provider_score_adjustments for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.cleaning_providers cp
      where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Provider Intake Form version history - stays tied to provider_leads
-- only (the acquisition-phase intake form); the operational profile
-- reads it read-only through the permanent provider_leads.cleaning_
-- provider_id link when one exists.
-- ---------------------------------------------------------------------
create table if not exists public.provider_intake_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_lead_id uuid not null references public.provider_leads(id) on delete cascade,
  submission jsonb not null,
  completed_at timestamptz not null default now(),
  completed_by_label text
);

create index if not exists provider_intake_versions_provider_lead_idx
  on public.provider_intake_versions(provider_lead_id, completed_at desc);

alter table public.provider_intake_versions enable row level security;

create policy "provider_intake_versions_admin_all"
  on public.provider_intake_versions for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "provider_intake_versions_agent_select_own_provider"
  on public.provider_intake_versions for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.provider_leads p
      where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Outbound SMS log for the "Send SMS" quick action (distinct from the
-- pre-existing internal admin SMS *notifications* sent via
-- src/lib/twilio.ts's sendSms(), which are completely unchanged). Same
-- dual-key pattern as provider_notes/provider_documents.
-- ---------------------------------------------------------------------
create table if not exists public.provider_sms_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_lead_id uuid references public.provider_leads(id) on delete cascade,
  cleaning_provider_id uuid references public.cleaning_providers(id) on delete cascade,
  agent_id uuid references public.crm_users(id) on delete set null,
  to_phone text not null,
  body text not null,
  activity_id uuid references public.crm_activities(id) on delete set null,
  constraint provider_sms_messages_at_least_one_target check (
    provider_lead_id is not null or cleaning_provider_id is not null
  )
);

create index if not exists provider_sms_messages_provider_lead_idx on public.provider_sms_messages(provider_lead_id, created_at desc);
create index if not exists provider_sms_messages_cleaning_provider_idx on public.provider_sms_messages(cleaning_provider_id, created_at desc);

alter table public.provider_sms_messages enable row level security;

-- Written exclusively by the service-role client from the Send SMS server
-- action, same "RLS enabled, no insert policy for authenticated users"
-- pattern as crm_lead_emails (migration 0022) - only read access is
-- granted here.
create policy "provider_sms_messages_admin_all"
  on public.provider_sms_messages for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "provider_sms_messages_agent_select_own"
  on public.provider_sms_messages for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
      or
      (cleaning_provider_id is not null and exists (
        select 1 from public.cleaning_providers cp
        where cp.id = cleaning_provider_id and cp.assigned_agent_id = auth.uid()
      ))
    )
  );

-- ---------------------------------------------------------------------
-- Private storage bucket for logos and compliance documents. No
-- storage.objects policies are added - every read/write goes through a
-- Server Action using the service-role client after requireCrmUser()/
-- requireCrmAdmin() and an explicit ownership check, the same
-- "RLS enabled, service-role only" convention already used for
-- crm_lead_emails and crm_notifications elsewhere in this project.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('provider-files', 'provider-files', false)
on conflict (id) do nothing;
