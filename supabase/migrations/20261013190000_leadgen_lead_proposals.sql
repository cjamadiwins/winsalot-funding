-- Lead Generation CRM: "Request Proposal" - proposal tracking per lead.
--
-- Admin emails the lead's CLIENT (never the prospect) asking it to prepare a
-- proposal. The email itself reuses the existing tracked pipeline
-- (leadgen_emails + Resend + webhook delivery tracking, notification_type
-- 'proposal_requested' is already an allowed value), so this migration only adds
-- what is new:
--
--  1. leadgen_lead_proposals - ONE row per lead holding its Proposal Status
--     (not_requested / proposal_requested / in_preparation / proposal_sent /
--     accepted / declined). A separate table, not a column on leadgen_leads,
--     because agents hold table-wide UPDATE on leadgen_leads; the status must
--     only ever be changed by Admin through a server action (service_role).
--     Sending the request email only ever sets 'proposal_requested' - it never
--     marks a proposal as sent to the prospect.
--  2. leadgen_emails.request_key (+ partial unique index) - an idempotency key
--     the composer generates per send, so a double click / retried request can
--     never create or send a second email.
--  3. leadgen_lead_activities.activity_type - allow 'proposal_requested' and
--     'proposal_status_changed' (the constraint below is the CURRENT production
--     list plus those two values).
--  4. set_leadgen_client_activity_summary() - both new activities are internal
--     handoff entries, kept private exactly like 'client_notified' (otherwise
--     they would fall into the ELSE branch and be mirrored to the client portal).
--     Body is the current production definition with those two values added to
--     the internal list.
--
-- Additive only: no existing row, column, policy, grant or function is removed
-- or rewritten (the activity constraint and the summary function are replaced
-- by supersets of their current definitions). Nothing is backfilled and no lead,
-- follow-up, appointment, email, assignment, payroll or attendance record is
-- touched.
--
-- Access model for leadgen_lead_proposals (explicit grants only):
--   * authenticated: SELECT only, through RLS below -
--       Admin: every row.
--       Agent: only proposals of leads assigned to them (read-only).
--       Client: only its OWN client's proposals that have actually been
--               requested (never another client's, never 'not_requested').
--   * Every write goes through a server action using service_role after it has
--     verified the caller is an Admin.
--   * anon: no access at all.
--   * The table holds NO internal notes - only status, dates and ids - so
--     nothing internal can be exposed to a client through it.

create table if not exists public.leadgen_lead_proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leadgen_leads(id) on delete cascade,
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  campaign_id uuid references public.leadgen_campaigns(id) on delete set null,
  status text not null default 'proposal_requested' check (status in (
    'not_requested', 'proposal_requested', 'in_preparation', 'proposal_sent', 'accepted', 'declined'
  )),
  first_requested_at timestamptz,
  last_requested_at timestamptz,
  request_count integer not null default 0 check (request_count >= 0),
  last_request_email_id uuid references public.leadgen_emails(id) on delete set null,
  status_updated_at timestamptz not null default now(),
  status_updated_by uuid references public.leadgen_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leadgen_lead_proposals_client_idx on public.leadgen_lead_proposals (client_id, status);
create index if not exists leadgen_lead_proposals_status_idx on public.leadgen_lead_proposals (status, last_requested_at desc);

alter table public.leadgen_lead_proposals enable row level security;

drop policy if exists "leadgen_lead_proposals_admin_select" on public.leadgen_lead_proposals;
create policy "leadgen_lead_proposals_admin_select"
  on public.leadgen_lead_proposals for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

drop policy if exists "leadgen_lead_proposals_agent_select_own" on public.leadgen_lead_proposals;
create policy "leadgen_lead_proposals_agent_select_own"
  on public.leadgen_lead_proposals for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.leadgen_leads l
      where l.id = leadgen_lead_proposals.lead_id and l.assigned_agent_id = auth.uid()
    )
  );

drop policy if exists "leadgen_lead_proposals_client_select_own" on public.leadgen_lead_proposals;
create policy "leadgen_lead_proposals_client_select_own"
  on public.leadgen_lead_proposals for select
  using (
    client_id = public.leadgen_user_client_id(auth.uid())
    and status <> 'not_requested'
  );

revoke all on table public.leadgen_lead_proposals from anon, authenticated;
grant select on table public.leadgen_lead_proposals to authenticated;
grant all on table public.leadgen_lead_proposals to service_role;

comment on table public.leadgen_lead_proposals is
  'Proposal Status per lead for the Request Proposal feature. One row per lead. Written only via service_role server actions after an Admin check; clients can read only their own client''s requested proposals. Holds no internal notes.';

-- Double-send protection for the proposal request email.
alter table public.leadgen_emails
  add column if not exists request_key text;

create unique index if not exists leadgen_emails_request_key_idx
  on public.leadgen_emails (request_key)
  where request_key is not null;

-- Activity types (current production list + the two new values).
alter table public.leadgen_lead_activities
  drop constraint if exists leadgen_lead_activities_activity_type_check;
alter table public.leadgen_lead_activities
  add constraint leadgen_lead_activities_activity_type_check
    check (activity_type = ANY (ARRAY[
      'call', 'email', 'note', 'status_change', 'lead_assigned', 'lead_reassigned',
      'follow_up_scheduled', 'follow_up_completed', 'appointment_booked', 'appointment_updated',
      'consultation_email_sent', 'consultation_invitation_sent', 'consultation_follow_up_sent',
      'appointment_confirmation_resent', 'appointment_reminder_sent', 'appointment_reminder_auto_sent',
      'appointment_business_reminder_auto_sent',
      'mantra_collab_intro_sent', 'web6_solutions_intro_sent', 'teknokraft_intro_sent', 'hidebrandt_intro_sent',
      'opportunity_created', 'opportunity_outcome_changed',
      'client_notified', 'appointment_brief_sent',
      'proposal_requested', 'proposal_status_changed'
    ]::text[]));

create or replace function public.set_leadgen_client_activity_summary()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.activity_type in ('note', 'lead_assigned', 'lead_reassigned', 'client_notified', 'proposal_requested', 'proposal_status_changed') then
    new.client_visible := false;
    new.client_summary := null;
    return new;
  end if;

  new.client_visible := true;
  new.client_summary := case new.activity_type
    when 'call' then case
      when new.call_outcome is not null then 'Call completed — ' || lower(new.call_outcome) || '.'
      else 'Call completed.'
    end
    when 'email' then 'Email sent.'
    when 'status_change' then 'Lead status updated.'
    when 'follow_up_scheduled' then 'Follow-up scheduled.'
    when 'follow_up_completed' then 'Follow-up completed.'
    when 'appointment_booked' then 'Appointment booked.'
    when 'appointment_updated' then 'Appointment details updated.'
    when 'consultation_email_sent' then 'Consultation information sent by email.'
    when 'consultation_invitation_sent' then 'Consultation invitation sent by email.'
    when 'consultation_follow_up_sent' then 'Follow-up email sent.'
    when 'appointment_confirmation_resent' then 'Appointment confirmation sent again.'
    when 'appointment_reminder_sent' then 'Appointment reminder sent.'
    when 'appointment_reminder_auto_sent' then 'Automatic appointment reminder sent.'
    when 'mantra_collab_intro_sent' then 'Introduction email sent.'
    when 'opportunity_created' then 'Consultation completed — added to your pipeline.'
    when 'opportunity_outcome_changed' then 'Pipeline outcome updated.'
    when 'appointment_brief_sent' then 'Appointment brief sent.'
    else 'Lead activity updated.'
  end;
  return new;
end;
$function$;
