-- Provider Profile: the central profile page for a cleaning provider,
-- opened whenever an admin/agent clicks a provider's business name from
-- Provider Acquisition. Purely additive on top of provider_leads
-- (migration 0026/0027) - every existing column, row, policy, and trigger
-- keeps behaving exactly as before. No existing customer quote request,
-- provider acquisition, provider quote, CRM, training zone, authentication,
-- email tracking, or SMS notification behavior is changed.

-- ---------------------------------------------------------------------
-- General Information fields the profile adds on top of provider_leads
-- ---------------------------------------------------------------------
alter table public.provider_leads
  add column if not exists logo_path text,
  add column if not exists job_title text,
  add column if not exists street_address text,
  add column if not exists postal_code text,
  add column if not exists number_of_employees text,
  add column if not exists business_description text,
  -- Service Area "Cities Served" (distinct from the single required `city`
  -- column, which stays exactly as-is for every existing consumer).
  add column if not exists cities_served text[] not null default '{}',
  -- Documentation scoring must not penalize a provider for a WSIB/WCB
  -- certificate when it doesn't apply to their business.
  add column if not exists wsib_wcb_applicable boolean not null default true,
  -- Optional link into the pre-existing, separate private quote-assignment
  -- system (cleaning_providers / quote_requests.assigned_provider_id -
  -- migration 0004) so Quote History can be shown on the profile without
  -- merging these two previously-independent systems. Null until an
  -- administrator links the two records.
  add column if not exists cleaning_provider_id uuid references public.cleaning_providers(id) on delete set null;

-- ---------------------------------------------------------------------
-- Provider Scorecard - system-calculated, transparent, re-computable
-- ---------------------------------------------------------------------
alter table public.provider_leads
  add column if not exists score smallint check (score is null or (score between 0 and 100)),
  add column if not exists score_label text,
  add column if not exists score_breakdown jsonb,
  add column if not exists score_missing_categories text[] not null default '{}',
  add column if not exists score_is_new_provider boolean not null default false,
  add column if not exists score_calculated_at timestamptz;

create index if not exists provider_leads_score_idx on public.provider_leads(score);
create index if not exists provider_leads_cleaning_provider_idx on public.provider_leads(cleaning_provider_id);

-- New provider-status values the Provider Profile adds (Active/Inactive/
-- Suspended/Declined) alongside every status already in use - no existing
-- status value is removed or renamed, so every existing row and every
-- existing status-based query keeps working unchanged.
alter table public.provider_leads drop constraint if exists provider_leads_status_check;
alter table public.provider_leads add constraint provider_leads_status_check
  check (status in (
    'New', 'Contact Attempted', 'Contacted', 'Interested', 'Intake Form Sent',
    'Follow-up Required', 'Intake Form Completed', 'Under Review',
    'Approved Provider', 'Not Interested', 'Invalid Contact', 'Closed',
    'Active', 'Inactive', 'Suspended', 'Declined'
  ));

-- New system-logged activity types for the Activity Timeline (status
-- changes, agent reassignment, quote invitations/submissions/decisions,
-- and score recalculations). Every activity type already in use (call,
-- email, text, voicemail, note, outcome) is kept exactly as-is - this is
-- purely an addition to the allowed set, and the "Log Activity" form's own
-- dropdown (ACTIVITY_TYPES in src/lib/crm-types.ts) is deliberately left
-- unchanged, so these new types are only ever written by system code, not
-- offered as a manual entry.
alter table public.crm_activities drop constraint if exists crm_activities_activity_type_check;
alter table public.crm_activities add constraint crm_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'text', 'voicemail', 'note', 'outcome',
    'status_change', 'assignment_change',
    'quote_invited', 'quote_submitted', 'quote_accepted', 'quote_declined',
    'score_change'
  ));

-- New tracked email type for the generic "Send Email" quick action
-- (distinct from the existing 'provider_intake' template email, which is
-- unchanged).
alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_email_type_check;
alter table public.crm_lead_emails add constraint crm_lead_emails_email_type_check
  check (email_type in ('quote_request', 'follow_up', 'provider_intake', 'provider_message'));

-- ---------------------------------------------------------------------
-- Internal Notes - never visible to providers (there is no provider-
-- facing login to this data anywhere in the app, so this is naturally
-- internal-only).
-- ---------------------------------------------------------------------
create table if not exists public.provider_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_lead_id uuid not null references public.provider_leads(id) on delete cascade,
  user_id uuid references public.crm_users(id) on delete set null,
  -- Denormalized author display name, captured at write time. crm_users
  -- only lets an agent select their *own* row (crm_users_select_self,
  -- migration 0010), so a note authored by someone else (an admin, or a
  -- different agent before a reassignment) could never be resolved to a
  -- name via a join from an agent's session - this avoids that entirely.
  author_name text not null,
  note text not null
);

create index if not exists provider_notes_provider_lead_idx on public.provider_notes(provider_lead_id, created_at desc);

alter table public.provider_notes enable row level security;

create policy "provider_notes_admin_all"
  on public.provider_notes for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "provider_notes_agent_select_own_provider"
  on public.provider_notes for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.provider_leads p
      where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
    )
  );

create policy "provider_notes_agent_insert_own_provider"
  on public.provider_notes for insert
  with check (
    user_id = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.provider_leads p
      where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
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
-- Certifications, Other Documents. Stored in the private `provider-files`
-- storage bucket below; agents can upload but never permanently remove -
-- only an administrator can (brief: "Agents must not... Permanently remove
-- documents").
-- ---------------------------------------------------------------------
create table if not exists public.provider_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_lead_id uuid not null references public.provider_leads(id) on delete cascade,
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
  removed_by uuid references public.crm_users(id) on delete set null
);

create index if not exists provider_documents_provider_lead_idx on public.provider_documents(provider_lead_id, created_at desc);

alter table public.provider_documents enable row level security;

create policy "provider_documents_admin_all"
  on public.provider_documents for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "provider_documents_agent_select_own_provider"
  on public.provider_documents for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.provider_leads p
      where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
    )
  );

create policy "provider_documents_agent_insert_own_provider"
  on public.provider_documents for insert
  with check (
    uploaded_by = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.provider_leads p
      where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Manual Scorecard Adjustments - administrator-only, always shown
-- separately from the automatically calculated score.
-- ---------------------------------------------------------------------
create table if not exists public.provider_score_adjustments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_lead_id uuid not null references public.provider_leads(id) on delete cascade,
  admin_id uuid references public.crm_users(id) on delete set null,
  amount smallint not null check (amount between -100 and 100),
  reason text not null
);

create index if not exists provider_score_adjustments_provider_lead_idx
  on public.provider_score_adjustments(provider_lead_id, created_at desc);

alter table public.provider_score_adjustments enable row level security;

create policy "provider_score_adjustments_admin_all"
  on public.provider_score_adjustments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Agents can view adjustments for providers assigned to them (transparency
-- of the scorecard) but can never create, edit, or remove one themselves.
create policy "provider_score_adjustments_agent_select_own_provider"
  on public.provider_score_adjustments for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.provider_leads p
      where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Provider Intake Form version history - the public intake route already
-- writes the latest submission onto provider_leads.intake_submission
-- (migration 0027); this preserves every prior version instead of
-- overwriting it.
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
-- Outbound SMS log for the new "Send SMS" quick action (distinct from the
-- pre-existing internal admin SMS *notifications* sent via
-- src/lib/twilio.ts's sendSms(), which are completely unchanged).
-- ---------------------------------------------------------------------
create table if not exists public.provider_sms_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_lead_id uuid not null references public.provider_leads(id) on delete cascade,
  agent_id uuid references public.crm_users(id) on delete set null,
  to_phone text not null,
  body text not null,
  activity_id uuid references public.crm_activities(id) on delete set null
);

create index if not exists provider_sms_messages_provider_lead_idx
  on public.provider_sms_messages(provider_lead_id, created_at desc);

alter table public.provider_sms_messages enable row level security;

-- Written exclusively by the service-role client from the Send SMS server
-- action, same "RLS enabled, no insert policy for authenticated users"
-- pattern as crm_lead_emails (migration 0022) - only read access is
-- granted here.
create policy "provider_sms_messages_admin_all"
  on public.provider_sms_messages for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "provider_sms_messages_agent_select_own_provider"
  on public.provider_sms_messages for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.provider_leads p
      where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
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
