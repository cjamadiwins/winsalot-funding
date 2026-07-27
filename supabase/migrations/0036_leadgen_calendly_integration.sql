-- Lead Generation CRM: switches the consultation booking button to an
-- external Calendly link (per the brief: "Do not create a separate
-- internal booking page") and adds a second "services information"
-- link, both configured per-client. Also adds Calendly webhook support
-- so a booking made on Calendly is captured back into the CRM.

-- The internal booking page + its reschedule/cancel token flow (added in
-- migration 0034) are removed along with this migration - Calendly now
-- owns booking, rescheduling, and cancellation entirely, so this table
-- has no remaining purpose. Nothing else referenced it.
drop table if exists public.leadgen_appointment_tokens;

alter table public.leadgen_clients
  add column if not exists services_info_link text,
  -- Matches an incoming Calendly webhook payload's scheduled_event.
  -- event_type URI to this client (see src/app/api/webhooks/calendly/
  -- route.ts). Optional: with only one Calendly-linked client, the
  -- webhook falls back to matching "the only client with a calendly.com
  -- booking_link" - set this explicitly once more than one client uses
  -- Calendly, so each booking lands on the right client unambiguously.
  add column if not exists calendly_event_type_uri text;

alter table public.leadgen_appointments
  -- Calendly's invitee URI for a booking - the natural idempotency key
  -- for the webhook handler (a redelivered event, or an update event for
  -- the same booking, matches this instead of inserting a duplicate row).
  add column if not exists calendly_invitee_uri text unique;
