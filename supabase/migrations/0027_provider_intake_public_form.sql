-- Public Provider Intake Form integration: the public form at
-- https://leads.winsalotcorp.com/provider-intake (see PROVIDER_INTAKE_URL
-- in src/lib/provider-intake-content.ts) previously had nowhere correct to
-- write - it shared a domain with the unrelated Lead Generation Client
-- Intake form (LEAD_GEN_HOSTS/"/lead-generation", untouched by this
-- migration), so a provider's submission never reached provider_leads at
-- all. This migration only adds what the new /api/provider-intake route
-- (src/lib/provider-intake-submission.ts) needs on top of provider_leads
-- (migration 0026) - no existing table, column, row, policy, or trigger is
-- dropped or rewritten.

-- Records when a provider actually completed the public intake form
-- (distinct from last_contacted_at, which an agent's own call notes also
-- update) and preserves the raw submitted answers verbatim, so nothing the
-- provider entered is lost even if the matching/merge logic above it only
-- copies a subset onto the named columns.
alter table public.provider_leads
  add column if not exists intake_completed_at timestamptz;

alter table public.provider_leads
  add column if not exists intake_submission jsonb;

-- In-app CRM notifications ("notify the assigned agent and administrator
-- inside the CRM" - brief section 5). One row per recipient per event, so
-- an admin and the assigned agent each get their own read/unread state
-- and their own link back into the record from their own side of the CRM
-- (/admin/crm/provider-acquisition/[id] vs /agent/provider-acquisition/[id]).
create table if not exists public.crm_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.crm_users(id) on delete cascade,
  provider_lead_id uuid references public.provider_leads(id) on delete cascade,
  title text not null,
  body text,
  link_path text,
  is_read boolean not null default false,
  read_at timestamptz
);

create index if not exists crm_notifications_user_unread_idx
  on public.crm_notifications(user_id, is_read, created_at desc);

create index if not exists crm_notifications_provider_lead_idx
  on public.crm_notifications(provider_lead_id);

alter table public.crm_notifications enable row level security;

-- Only the recipient can see or mark their own notification read. Written
-- exclusively by the service-role client (the public intake route has no
-- Supabase session to act as), so there's no insert/delete policy for
-- authenticated users - matching the crm_lead_emails pattern (migration
-- 0022: RLS enabled, no policies, service-role only) for rows application
-- code shouldn't let a user forge on their own behalf.
create policy "crm_notifications_select_own"
  on public.crm_notifications for select
  using (user_id = auth.uid());

create policy "crm_notifications_update_own"
  on public.crm_notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
