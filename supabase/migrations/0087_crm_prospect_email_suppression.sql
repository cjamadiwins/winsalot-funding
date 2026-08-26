-- Prospect-email system (Winsalot Growth CRM): widens crm_lead_emails to
-- accept the new templated "consultation invite" email type, and adds a
-- suppression/unsubscribe system for crm_opportunities prospects - no
-- equivalent existed before this (the Lead Gen CRM's leadgen_bounced_emails
-- is a separate product's separate table and only ever blocks on a hard
-- bounce, not a genuine unsubscribe click).

alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_email_type_check;
alter table public.crm_lead_emails add constraint crm_lead_emails_email_type_check
  check (email_type in ('quote_request', 'follow_up', 'provider_intake', 'consultation_invite'));

-- One row per email address that must never receive another promotional
-- Growth CRM email - checked by sendProspectEmail() (src/lib/send-prospect-email.ts)
-- before every send. Same "service-role only, no RLS policies" pattern as
-- crm_lead_emails (migration 0022): this is internal compliance
-- bookkeeping, not something an agent/admin queries directly - the CRM UI
-- only ever surfaces a yes/no "unsubscribed" flag for the prospect it's
-- currently looking at, resolved server-side.
create table if not exists public.crm_email_suppressions (
  email text primary key,
  reason text not null default 'unsubscribed',
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  suppressed_at timestamptz not null default now()
);

alter table public.crm_email_suppressions enable row level security;

-- A one-time-use link embedded in every prospect email's footer
-- (/unsubscribe/<token>, a public unauthenticated route - see
-- src/app/unsubscribe/[token]/page.tsx). Minted fresh per send rather than
-- derived from a signed value, so a token can't be forged or reused to
-- probe for other prospects' email addresses; looking one up only ever
-- reveals the single email address it was minted for.
create table if not exists public.crm_unsubscribe_tokens (
  token uuid primary key default gen_random_uuid(),
  email text not null,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.crm_unsubscribe_tokens enable row level security;

create index if not exists crm_unsubscribe_tokens_email_idx on public.crm_unsubscribe_tokens(email);
