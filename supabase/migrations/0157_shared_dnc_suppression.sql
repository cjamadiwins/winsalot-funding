-- Shared Do Not Contact / Suppression system for BOTH the Lead Generation
-- CRM (src/app/leadgen/*) and the Growth CRM (src/app/admin, src/app/agent).
-- One Supabase project already backs both apps (see crm-auth.ts's own note
-- that "Supabase Auth is one project shared by both CRMs"), so one shared
-- table here is what makes a Do Not Call added in either CRM automatically
-- recognized in the other - there is deliberately no per-CRM suppression
-- table to keep in sync.
--
-- Same "service-role only, no RLS policies" convention as the existing
-- crm_email_suppressions table (migration 0087): this is internal
-- compliance bookkeeping checked and written entirely from trusted server
-- code (src/lib/dnc-suppression.ts) that has already run requireCrmAgent/
-- requireCrmAdmin/requireLeadgenAgent/requireLeadgenAdmin - never queried
-- directly by a browser session client from either CRM.

create table if not exists public.crm_dnc_suppressions (
  id uuid primary key default gen_random_uuid(),

  contact_name text,
  business_name text,

  phone text,
  -- Digits-only, NANP-leading-1-stripped form of `phone` (see
  -- normalizePhoneNumber in src/lib/dnc-suppression.ts) - what every
  -- suppression lookup actually matches on, so "(416) 555-1234",
  -- "416-555-1234", and "+1 416 555 1234" all resolve to the same row.
  normalized_phone text,
  email text,

  -- Loose reference to the originating crm_opportunities.id or
  -- leadgen_leads.id - no foreign key, since it can point into either
  -- table depending on source_crm and either row may later be deleted
  -- without that ever being a reason to drop this suppression record.
  contact_id uuid,
  source_crm text not null check (source_crm in ('lead_generation', 'growth')),
  original_assignment text,

  reason text not null,
  notes text,

  added_by_user_id uuid,
  added_by_name text,

  -- Per-channel suppression (Item 6: "Phone suppression only = prevent
  -- calling", etc.) - a "Do Not Call" call outcome sets block_phone only;
  -- an admin's "All Channels" restriction sets all three.
  block_phone boolean not null default false,
  block_sms boolean not null default false,
  block_email boolean not null default false,

  status text not null default 'active' check (status in ('active', 'removed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  removed_at timestamptz,
  removed_by uuid,
  removed_by_name text,
  removal_reason text,

  constraint crm_dnc_suppressions_identifier_required
    check (normalized_phone is not null or email is not null),
  constraint crm_dnc_suppressions_channel_required
    check (block_phone or block_sms or block_email)
);

alter table public.crm_dnc_suppressions enable row level security;

-- Enforces "avoid duplicate suppression records where possible" (Item 9):
-- only one *active* row per phone number / email address can exist at a
-- time. addOrUpdateDncSuppression() (src/lib/dnc-suppression.ts) looks for
-- an existing active row first and merges channels into it rather than
-- inserting a second one; a removed row doesn't count here, so a
-- previously-removed number/email can be freely re-suppressed later.
create unique index if not exists crm_dnc_suppressions_active_phone_uidx
  on public.crm_dnc_suppressions (normalized_phone)
  where status = 'active' and normalized_phone is not null;

create unique index if not exists crm_dnc_suppressions_active_email_uidx
  on public.crm_dnc_suppressions (email)
  where status = 'active' and email is not null;

create index if not exists crm_dnc_suppressions_status_idx on public.crm_dnc_suppressions (status);
create index if not exists crm_dnc_suppressions_source_crm_idx on public.crm_dnc_suppressions (source_crm);

-- Append-only audit trail (Item 10) - never updated or deleted by
-- application code, and there is no policy granting any ordinary session
-- client access to erase or edit it, only the service-role client used by
-- src/lib/dnc-suppression.ts after an admin/agent auth check.
create table if not exists public.crm_dnc_audit_log (
  id uuid primary key default gen_random_uuid(),
  suppression_id uuid not null references public.crm_dnc_suppressions(id) on delete cascade,
  action text not null check (action in ('added', 'updated', 'removed', 'reactivated')),
  source_crm text not null check (source_crm in ('lead_generation', 'growth')),
  performed_by uuid,
  performed_by_name text,
  reason text,
  notes text,
  channels jsonb,
  created_at timestamptz not null default now()
);

alter table public.crm_dnc_audit_log enable row level security;

create index if not exists crm_dnc_audit_log_suppression_id_idx on public.crm_dnc_audit_log (suppression_id);
