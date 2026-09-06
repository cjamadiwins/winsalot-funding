-- Client Loyalty & Retention module for the Winsalot Growth CRM.
--
-- Admin-only (mirrors crm_marketing_* exactly: no agent policy on any
-- table here at all, same as crm_clients/crm_invoices - see 0091's own
-- rationale). Built on the existing crm_clients table (no duplicate
-- client list, no change to crm_clients' own columns or status enum) -
-- a client is either enrolled here or not, via crm_retention_enrollments.
--
-- Entirely additive and independent of crm_marketing_* (prospect
-- marketing, keyed to crm_opportunities), leadgen_appointment_reminders /
-- winsalot_appointment_reminders (booking-lifecycle reminders), and every
-- other cron/email system in this app. Naming follows this codebase's
-- crm_ prefix convention rather than the bare "client_retention_..."
-- names sometimes used for illustration, matching crm_marketing_*'s own
-- precedent (see 0117's header comment on this exact choice).
--
-- retention_status is a status scoped to this module only, distinct from
-- crm_clients.status (Prospect/Pilot/Active/Paused/Completed/Archived) -
-- it never overloads or replaces that column. Its values (active, paused,
-- follow_up, re_engagement, re_engagement_completed, inactive, cancelled)
-- are exactly the "Client Status" automation states the brief describes
-- for the retention program itself.

-- ---------------------------------------------------------------------
-- crm_retention_templates: editable email copy for all three campaign
-- types. Same shape/convention as crm_marketing_templates (0117):
-- (campaign_type, sequence_number) picks which template is due next via
-- send_count % active-count, so a paused/reactivated client resumes
-- exactly where it left off rather than catching up or skipping (see
-- crm-marketing-job.ts's templateForEnrollment, mirrored in
-- crm-retention-job.ts).
-- ---------------------------------------------------------------------
create table if not exists public.crm_retention_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  campaign_type text not null check (campaign_type in ('client_success', 'follow_up', 're_engagement')),
  sequence_number integer not null check (sequence_number >= 1),
  label text not null check (length(trim(label)) > 0),
  subject text not null check (length(trim(subject)) > 0),
  body text not null check (length(trim(body)) > 0),
  active boolean not null default true,
  unique (campaign_type, sequence_number)
);

-- ---------------------------------------------------------------------
-- crm_retention_enrollments: one row per client's current relationship
-- with the retention program (a client is "enrolled" iff a row exists
-- here). campaign_type + retention_status together drive
-- crm-retention-job.ts's automation rules:
--   - client_success / active   -> weekly rotating 4-week sequence
--   - re_engagement / re_engagement -> the 3-email sequence (day 0/7/14)
--   - re_engagement / re_engagement_completed -> terminal, no more sends
--   - follow_up / follow_up     -> no automatic cadence; driven entirely
--                                  by crm_retention_followups below
--   - */ paused, inactive, cancelled -> never sends automatically
-- send_count is reused for both: it indexes the rotating 4-week
-- (x2 cycles = 8 templates) Client Success sequence, and counts which of
-- the 3 Re-Engagement emails is next.
-- ---------------------------------------------------------------------
create table if not exists public.crm_retention_enrollments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id uuid not null unique references public.crm_clients(id) on delete cascade,
  campaign_type text not null check (campaign_type in ('client_success', 'follow_up', 're_engagement')),
  retention_status text not null default 'active' check (retention_status in (
    'active', 'paused', 'follow_up', 're_engagement', 're_engagement_completed', 'inactive', 'cancelled'
  )),
  auto_send boolean not null default true,
  start_date date not null default current_date,
  cadence_days integer not null default 7 check (cadence_days >= 1),
  next_send_at timestamptz,
  last_sent_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  re_engagement_started_at timestamptz,
  re_engagement_completed_at timestamptz,
  last_error text,
  claim_token uuid,
  claimed_at timestamptz,
  paused_at timestamptz,
  stopped_at timestamptz,
  removed_at timestamptz,
  created_by uuid references public.crm_users(id) on delete set null,
  updated_by uuid references public.crm_users(id) on delete set null
);

create index if not exists crm_retention_enrollments_due_idx
  on public.crm_retention_enrollments(next_send_at)
  where removed_at is null and retention_status in ('active', 're_engagement');
create index if not exists crm_retention_enrollments_status_idx
  on public.crm_retention_enrollments(retention_status);

-- ---------------------------------------------------------------------
-- crm_retention_followups: the Follow-Up campaign's own fields (brief
-- section 3) - deliberately not folded into crm_retention_enrollments
-- since a client can be followed up on more than once over its lifetime
-- and each occurrence needs its own date/reason/note/assignment. The
-- partial unique index enforces "no duplicate scheduled follow-ups": a
-- client can have at most one open (unresolved, uncancelled) follow-up
-- at a time.
-- ---------------------------------------------------------------------
create table if not exists public.crm_retention_followups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  -- Always populated by scheduleFollowupAction (which upserts the
  -- client's crm_retention_enrollments row first) - not null so a
  -- follow-up can never exist without the enrollment
  -- crm_retention_emails.enrollment_id (also not null) requires when
  -- recording its send.
  enrollment_id uuid not null references public.crm_retention_enrollments(id) on delete cascade,
  follow_up_date date not null,
  follow_up_reason text not null check (length(trim(follow_up_reason)) > 0),
  internal_note text,
  assigned_admin uuid references public.crm_users(id) on delete set null,
  last_contact_at timestamptz,
  next_contact_at timestamptz,
  auto_send boolean not null default false,
  template_id uuid references public.crm_retention_templates(id) on delete set null,
  claim_token uuid,
  claimed_at timestamptz,
  sent_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.crm_users(id) on delete set null
);

create index if not exists crm_retention_followups_client_idx
  on public.crm_retention_followups(client_id, follow_up_date desc);
create index if not exists crm_retention_followups_due_idx
  on public.crm_retention_followups(follow_up_date)
  where resolved_at is null and cancelled_at is null;
create unique index if not exists crm_retention_followups_one_open_per_client
  on public.crm_retention_followups(client_id)
  where resolved_at is null and cancelled_at is null;

-- ---------------------------------------------------------------------
-- crm_retention_emails: delivery tracking, same shape and idempotency
-- design as crm_marketing_deliveries (0117) - unique(enrollment_id,
-- occurrence_key) is what makes a retried cron run or a second manual
-- "Run Now" click safe. occurrence_key is the enrollment's own
-- next_send_at for Client Success/Re-Engagement sends, or the
-- follow-up row's id for a Follow-Up send - either way, a fixed,
-- never-reused value per real send.
-- ---------------------------------------------------------------------
create table if not exists public.crm_retention_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  enrollment_id uuid not null references public.crm_retention_enrollments(id) on delete cascade,
  followup_id uuid references public.crm_retention_followups(id) on delete set null,
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  template_id uuid references public.crm_retention_templates(id) on delete set null,
  campaign_type text not null check (campaign_type in ('client_success', 'follow_up', 're_engagement')),
  occurrence_key text not null,
  scheduled_for timestamptz not null default now(),
  to_email text not null,
  subject text not null,
  resend_email_id text unique,
  status text not null default 'sending' check (status in (
    'sending', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed'
  )),
  status_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count between 1 and 3),
  sent_at timestamptz,
  delivered_at timestamptz,
  delayed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  failed_at timestamptz,
  error_detail text,
  unique (enrollment_id, occurrence_key)
);

create index if not exists crm_retention_emails_enrollment_idx
  on public.crm_retention_emails(enrollment_id, created_at desc);
create index if not exists crm_retention_emails_client_idx
  on public.crm_retention_emails(client_id, created_at desc);

-- ---------------------------------------------------------------------
-- crm_retention_events: internal-staff-only chronological history for a
-- client's "Retention & Follow-Up History" section (brief section 10) -
-- deliberately separate from crm_activities (the client profile's
-- existing general Activity History), so this module's own automated
-- and admin-driven events never bloat that shared, cross-feature enum
-- or feed.
-- ---------------------------------------------------------------------
create table if not exists public.crm_retention_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  enrollment_id uuid references public.crm_retention_enrollments(id) on delete set null,
  event_type text not null check (event_type in (
    'enrolled', 'client_success_email_sent', 'paused', 'resumed', 'stopped',
    'campaign_type_changed', 'removed_from_campaign',
    'followup_scheduled', 'followup_email_sent', 'followup_resolved', 'followup_cancelled',
    're_engagement_started', 're_engagement_email_sent', 're_engagement_completed',
    'manual_review_required', 'delivery_failed'
  )),
  notes text not null,
  performed_by uuid references public.crm_users(id) on delete set null,
  performed_by_name text,
  occurred_at timestamptz not null default now()
);

create index if not exists crm_retention_events_client_idx
  on public.crm_retention_events(client_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- Row Level Security. Same admin-only convention throughout this app:
-- templates/enrollments/followups/events are readable+writable by an
-- admin session (crm_retention_events also needs admin write access
-- since server actions log to it via the session client, not just the
-- service-role job - same "session-client audit log" precedent as
-- crm_email_resubscribe_audit, 0120); crm_retention_emails is
-- admin-*readable* only, same as crm_marketing_deliveries - all writes to
-- it come from the service-role job/webhook, which bypasses RLS anyway.
-- ---------------------------------------------------------------------
alter table public.crm_retention_templates enable row level security;
alter table public.crm_retention_enrollments enable row level security;
alter table public.crm_retention_followups enable row level security;
alter table public.crm_retention_emails enable row level security;
alter table public.crm_retention_events enable row level security;

create policy "crm_retention_templates_admin_all"
  on public.crm_retention_templates for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_retention_enrollments_admin_all"
  on public.crm_retention_enrollments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_retention_followups_admin_all"
  on public.crm_retention_followups for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_retention_emails_admin_select"
  on public.crm_retention_emails for select
  using (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_retention_events_admin_all"
  on public.crm_retention_events for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- claim_due_crm_retention_enrollments: atomic claim for the Client
-- Success weekly cadence and the Re-Engagement 3-email sequence alike -
-- both live on crm_retention_enrollments and share the same next_send_at
-- scheduling shape. `FOR UPDATE SKIP LOCKED` + a stale-claim (30 minute)
-- re-claim window is the exact same idempotency mechanism as
-- claim_due_crm_marketing_enrollments (0117): two overlapping cron runs,
-- a retry, and a manual "Run Now" click can never claim the same due
-- enrollment twice. Follow-Up is excluded here entirely - it is never
-- claimed by cadence, only by its own due date (see
-- claim_due_crm_retention_followups below).
-- ---------------------------------------------------------------------
create or replace function public.claim_due_crm_retention_enrollments(p_limit integer default 50)
returns setof public.crm_retention_enrollments
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select e.id
    from public.crm_retention_enrollments e
    where e.removed_at is null
      and (
        (e.campaign_type = 'client_success' and e.retention_status = 'active')
        or (e.campaign_type = 're_engagement' and e.retention_status = 're_engagement')
      )
      and e.next_send_at is not null
      and e.next_send_at <= now()
      and (e.claimed_at is null or e.claimed_at < now() - interval '30 minutes')
    order by e.next_send_at asc
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  update public.crm_retention_enrollments e
     set claimed_at = now(),
         claim_token = gen_random_uuid(),
         updated_at = now()
    from due
   where e.id = due.id
  returning e.*;
end;
$$;

revoke all on function public.claim_due_crm_retention_enrollments(integer) from public;
grant execute on function public.claim_due_crm_retention_enrollments(integer) to service_role;

-- ---------------------------------------------------------------------
-- claim_due_crm_retention_followups: the Follow-Up campaign's own claim,
-- separate from the cadence-based function above since eligibility here
-- is "its own follow_up_date has arrived AND Auto Send is on", not a
-- recurring next_send_at. Same SKIP LOCKED + stale-claim pattern, so a
-- follow-up can never be auto-sent twice.
-- ---------------------------------------------------------------------
create or replace function public.claim_due_crm_retention_followups(p_limit integer default 50)
returns setof public.crm_retention_followups
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select f.id
    from public.crm_retention_followups f
    where f.resolved_at is null
      and f.cancelled_at is null
      and f.sent_at is null
      and f.auto_send = true
      and f.follow_up_date <= current_date
      and (f.claimed_at is null or f.claimed_at < now() - interval '30 minutes')
    order by f.follow_up_date asc
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  update public.crm_retention_followups f
     set claimed_at = now(),
         claim_token = gen_random_uuid(),
         updated_at = now()
    from due
   where f.id = due.id
  returning f.*;
end;
$$;

revoke all on function public.claim_due_crm_retention_followups(integer) from public;
grant execute on function public.claim_due_crm_retention_followups(integer) to service_role;

-- ---------------------------------------------------------------------
-- Automation rule from brief section 5: "Changing a client's CRM status
-- should automatically update campaign eligibility." crm_clients.status
-- moving to 'Archived' is this app's existing "this client relationship
-- has ended" signal (see 0091) - when that happens, immediately cancel
-- this client's retention enrollment (brief: "Cancelled: Immediately stop
-- all retention emails") rather than leaving it active/scheduled against
-- an archived account. Never fires the other direction (reactivating a
-- client in the main CRM does not auto re-enroll or auto-resume
-- retention - enrollment and resuming stay deliberate admin actions per
-- brief section 6).
-- ---------------------------------------------------------------------
create or replace function public.crm_retention_cancel_on_client_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'Archived' and old.status is distinct from new.status then
    update public.crm_retention_enrollments
       set retention_status = 'cancelled',
           stopped_at = now(),
           claim_token = null,
           claimed_at = null,
           updated_at = now()
     where client_id = new.id
       and retention_status <> 'cancelled';

    insert into public.crm_retention_events (client_id, enrollment_id, event_type, notes)
    select e.client_id, e.id, 'stopped',
           'Client archived in Growth CRM — all retention emails cancelled automatically.'
    from public.crm_retention_enrollments e
    where e.client_id = new.id
      and e.updated_at >= now() - interval '5 seconds';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_retention_cancel_on_client_archive on public.crm_clients;
create trigger crm_retention_cancel_on_client_archive
  after update of status on public.crm_clients
  for each row execute function public.crm_retention_cancel_on_client_archive();

-- ---------------------------------------------------------------------
-- Seed default, admin-editable templates for all three campaign types.
-- Every template uses {{first_name}}/{{business_name}} tokens only -
-- never a specific client name - so the exact same copy works for every
-- current and future Winsalot Corp client (brief section 7). Client
-- Success ships two full 4-week cycles (sequence 1-8) so the rotation
-- never repeats the exact same wording back to back (brief: "restart the
-- sequence with updated wording"); branding throughout is "Winsalot
-- Client Success" / "Client Success Update", never "loyalty program"
-- (brief section 2's external-branding requirement).
-- ---------------------------------------------------------------------
insert into public.crm_retention_templates (campaign_type, sequence_number, label, subject, body)
values
  ('client_success', 1, 'Week 1 — Your Winsalot Partnership', 'Your Winsalot Partnership', E'Hi {{first_name}},\n\nWe wanted to take a moment to recap what our team is doing behind the scenes for {{business_name}} — prospecting, appointment setting, timely follow-up, campaign support, reporting, and ongoing account support.\n\nWe are glad to be part of your growth, and we are always here if you would like to talk about how things are going.'),
  ('client_success', 2, 'Week 2 — Consistency Creates Results', 'Consistency Creates Results', E'Hi {{first_name}},\n\nOutbound prospecting and lead generation work best through consistent outreach, follow-up, testing, and optimization over time — not a one-time push.\n\nThat steady, ongoing effort is exactly what our team keeps doing for {{business_name}} every week, and we will keep refining it as we learn what works best for your business.'),
  ('client_success', 3, 'Week 3 — Working Behind the Scenes', 'Working Behind the Scenes', E'Hi {{first_name}},\n\nA quick look at what has been happening for {{business_name}} recently: prospect tracking, calls, follow-ups, appointment management, reporting, and ongoing campaign monitoring and optimization.\n\nWe like keeping you in the loop on the work that supports your account, even when it is not always visible day to day.'),
  ('client_success', 4, 'Week 4 — Growing Together', 'Growing Together', E'Hi {{first_name}},\n\nAs {{business_name}} continues to grow, we would love to hear whether you would like us to target any new industries, locations, services, offers, or customer segments.\n\nJust reply and let us know — we are happy to adjust the approach with you.'),
  ('client_success', 5, 'Week 1 (Cycle 2) — Your Winsalot Partnership', 'A Look at Your Winsalot Partnership', E'Hi {{first_name}},\n\nWe wanted to check back in on everything our team continues to handle for {{business_name}} — prospecting, appointment setting, consistent follow-up, campaign support, reporting, and day-to-day account support.\n\nSupporting your growth is what we focus on, and we welcome any conversation about how things are going.'),
  ('client_success', 6, 'Week 2 (Cycle 2) — Consistency Creates Results', 'Why Consistency Matters for Your Results', E'Hi {{first_name}},\n\nSteady, consistent outreach — paired with follow-up, testing, and ongoing optimization — is what tends to produce the best long-term results in lead generation.\n\nThat is the approach we continue to apply for {{business_name}}, and we are always refining it based on what we are seeing.'),
  ('client_success', 7, 'Week 3 (Cycle 2) — Working Behind the Scenes', 'What We Have Been Working On', E'Hi {{first_name}},\n\nHere is a quick update on the ongoing work for {{business_name}}: prospect tracking, outreach calls, follow-ups, appointment management, reporting, and continued campaign monitoring.\n\nWe want you to always have visibility into the effort behind your account.'),
  ('client_success', 8, 'Week 4 (Cycle 2) — Growing Together', 'Let''s Keep Growing Together', E'Hi {{first_name}},\n\nAs we continue supporting {{business_name}}, is there any new industry, location, service, offer, or customer segment you would like us to help you target next?\n\nWe would love to hear your thoughts whenever is convenient.')
on conflict (campaign_type, sequence_number) do nothing;

insert into public.crm_retention_templates (campaign_type, sequence_number, label, subject, body)
values
  ('follow_up', 1, 'Follow-Up Check-In', 'Checking Back In', E'Hi {{first_name}},\n\nWe wanted to reconnect regarding {{business_name}} now that some time has passed. If now is a better time to continue our conversation, we would be glad to pick things back up whenever works for you.\n\nJust reply and let us know how you would like to proceed.')
on conflict (campaign_type, sequence_number) do nothing;

insert into public.crm_retention_templates (campaign_type, sequence_number, label, subject, body)
values
  ('re_engagement', 1, 'Email 1 — Friendly Check-In', 'Checking In With You', E'Hi {{first_name}},\n\nIt has been a little while since we last connected about {{business_name}}, and we wanted to check in and see how things are going on your end.\n\nWe are here whenever you would like to reconnect.'),
  ('re_engagement', 2, 'Email 2 — Continued Support', 'Still Here to Support Your Growth', E'Hi {{first_name}},\n\nWe wanted to remind you that Winsalot Corp is still here to support {{business_name}}''s growth whenever it is useful. Priorities can shift, so we would love to hear whether anything has changed on your end.\n\nFeel free to reply and let us know.'),
  ('re_engagement', 3, 'Email 3 — Final Light-Touch Follow-Up', 'One Last Check-In', E'Hi {{first_name}},\n\nWe have not heard back, so we wanted to send one last note. Would you like to continue working together, pause for now, or reconnect at a later time?\n\nWhatever works best for {{business_name}} is completely fine with us — just let us know.')
on conflict (campaign_type, sequence_number) do nothing;
