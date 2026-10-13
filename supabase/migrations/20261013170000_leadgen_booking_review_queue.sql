-- Lead Generation CRM: Admin review queue for automated bookings that can't be
-- attached to a client.
--
-- A Calendly "invitee.created" webhook whose event type can't be matched to
-- exactly one client used to be logged and dropped (leadgen_appointments.client_id
-- is NOT NULL, so there was nowhere to keep it). Instead of guessing a client
-- (and therefore a campaign), the verified webhook payload is retained here for
-- an Admin to resolve by hand.
--
-- Additive only: one new table. No existing table, column, row, policy, grant
-- or function is created, altered or removed. Nothing is backfilled.
--
-- Access model (same as the other Admin-only Lead Gen tables):
--   * authenticated: SELECT only, and only through the Admin RLS policy below.
--   * Every write goes through a server action / the signature-verified webhook
--     using service_role.
--   * anon: no access at all.

create table if not exists public.leadgen_booking_review_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('calendly')),
  reason text not null check (reason in ('client_not_matched', 'missing_start_time')),
  -- Idempotency key: Calendly invitee URI. A redelivered webhook never queues twice.
  external_ref text not null,
  -- Set only when the client WAS matched (e.g. reason = missing_start_time).
  client_id uuid references public.leadgen_clients(id) on delete set null,
  contact_name text,
  contact_email text,
  contact_phone text,
  business_name text,
  appointment_start timestamptz,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  resolved_by uuid references public.leadgen_users(id) on delete set null,
  resolution_note text,
  constraint leadgen_booking_review_queue_unique_ref unique (source, external_ref)
);

create index if not exists leadgen_booking_review_queue_pending_idx
  on public.leadgen_booking_review_queue (created_at desc)
  where status = 'pending';

alter table public.leadgen_booking_review_queue enable row level security;

drop policy if exists "leadgen_booking_review_queue_admin_select" on public.leadgen_booking_review_queue;
create policy "leadgen_booking_review_queue_admin_select"
  on public.leadgen_booking_review_queue for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

revoke all on table public.leadgen_booking_review_queue from anon, authenticated;
grant select on table public.leadgen_booking_review_queue to authenticated;
grant all on table public.leadgen_booking_review_queue to service_role;

comment on table public.leadgen_booking_review_queue is
  'Admin review queue for automated (Calendly) bookings that could not be matched to a client from a verified source. Holds the signature-verified payload so nothing is lost and no client/campaign is guessed. Admin-readable only; written via service_role.';
