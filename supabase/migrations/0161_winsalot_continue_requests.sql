-- Growth CRM only: public "Continue With Winsalot Corp" next-step page
-- (/continue-with-winsalot) for a prospect who has already had a
-- consultation and wants to move forward. The page never creates a
-- crm_clients or crm_client_agreements row itself - that onboarding
-- machinery still only ever starts from an admin's own deliberate action
-- (see migration 0097/0145) - it only ever records the prospect's request
-- and notifies admins, exactly the "collect + notify + confirm" fallback
-- the brief itself specifies for a CRM where client/agreement creation is
-- admin-initiated.

create table if not exists public.winsalot_continue_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- The prospect record this request is about, when one could be
  -- resolved/created by email (see findOrCreateOpportunity in
  -- src/lib/winsalot-continue-request.ts) - null only if that insert
  -- itself somehow failed, never left unset on purpose.
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,

  contact_name text not null,
  business_name text not null,
  email text not null,
  phone text not null,
  notes text,

  -- Claim-once guard so a retried Server Action (double-click, a replayed
  -- request) can never send a second round of admin notifications for the
  -- same submission - same convention as winsalot_appointments.admin_notified_at.
  admin_notified_at timestamptz
);

create index if not exists winsalot_continue_requests_opportunity_idx on public.winsalot_continue_requests(opportunity_id);
create index if not exists winsalot_continue_requests_created_idx on public.winsalot_continue_requests(created_at desc);

alter table public.winsalot_continue_requests enable row level security;

-- Admin-only read/write, same convention as every other winsalot_* admin
-- table - the public submission itself always goes through the
-- service-role client (no Supabase session exists on a public,
-- unauthenticated page), so no insert policy is needed for any
-- session-scoped role.
create policy "winsalot_continue_requests_admin_all"
  on public.winsalot_continue_requests for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- New activity-timeline entry, purely additive - same pattern as every
-- prior extension of this constraint.
alter table public.crm_activities drop constraint if exists crm_activities_activity_type_check;
alter table public.crm_activities add constraint crm_activities_activity_type_check
  check (activity_type in (
    'call', 'email', 'text', 'voicemail', 'note', 'outcome',
    'consultation_booked', 'consultation_rescheduled', 'consultation_cancelled',
    'client_created', 'client_updated', 'client_archived', 'client_reactivated',
    'client_deleted', 'client_agent_assigned', 'client_agent_unassigned',
    'invoice_created', 'invoice_sent', 'invoice_reminder_sent', 'invoice_cancelled',
    'invoice_archived', 'payment_recorded', 'payment_reversed',
    'agreement_sent', 'agreement_signed', 'agreement_superseded',
    'intake_sent', 'intake_received', 'onboarding_invoice_recorded',
    'onboarding_payment_received', 'campaign_activated',
    'pilot_activated', 'pilot_results_review_started', 'pilot_converted',
    'pilot_extended', 'pilot_closed', 'pilot_results_recorded',
    'onboarding_record_updated', 'onboarding_record_deleted',
    'email_resubscribed',
    'consultation_completed', 'consultation_no_show',
    'continue_request_submitted'
  ));
