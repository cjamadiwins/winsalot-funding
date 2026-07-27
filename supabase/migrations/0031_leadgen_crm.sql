-- Lead Generation CRM: a lightweight, separate, multi-client CRM for
-- Winsalot Corp's own lead-generation service business (agents cold-call
-- prospects on behalf of paying clients, book them consultations, and
-- report results back to the client). Completely independent of the
-- cleaning CRM (crm_users/crm_leads/crm_activities/crm_followups/
-- cleaning_providers/quote_requests/etc.) - every table here is prefixed
-- `leadgen_`, has its own role/auth model, and its own RLS helper
-- functions, so nothing here can affect or be affected by the cleaning
-- CRM's schema, policies, or behavior. Reuses only genuinely shared,
-- non-cleaning-specific infrastructure: Supabase Auth (auth.users) and
-- the Resend integration (a new, separate email log table - never writes
-- to crm_lead_emails).
--
-- Also distinct from the pre-existing `lead_generation` table/`/lead-
-- generation` public page (migration 0002) - that's a single public
-- intake form for Winsalot's own marketing leads, unrelated to this
-- multi-tenant CRM. Both coexist untouched.

-- ---------------------------------------------------------------------
-- leadgen_users: one row per Supabase Auth user who's part of this CRM.
-- Three roles - admin/agent (Winsalot staff) and client (an external
-- paying client's own login, scoped to exactly one leadgen_clients row).
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  -- URL-safe unique identifier for the client's future dedicated
  -- workspace (leads.winsalotcorp.com/client/<slug>) - assigned at
  -- creation, never reused, enforced unique at the database level so two
  -- clients can never collide even if the same display name is chosen.
  slug text not null unique,
  contact_name text,
  contact_email text,
  contact_phone text,
  -- Default consultation booking link for this client - individual
  -- campaigns may override it (leadgen_campaigns.booking_link below).
  booking_link text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists leadgen_clients_slug_idx on public.leadgen_clients(slug);

create table if not exists public.leadgen_users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  role text not null check (role in ('admin', 'agent', 'client')),
  -- Set only for role='client' - which client workspace this login is
  -- scoped to. Always null for admin/agent.
  client_id uuid references public.leadgen_clients(id) on delete cascade,
  active boolean not null default true,
  constraint leadgen_users_client_role_pairing check (
    (role = 'client' and client_id is not null) or (role != 'client' and client_id is null)
  )
);

create index if not exists leadgen_users_client_idx on public.leadgen_users(client_id);

-- security definer, same "avoid self-referential RLS recursion" pattern
-- as crm_user_role() (migration 0007) - a completely separate function so
-- neither CRM's role model can ever influence the other's.
create or replace function public.leadgen_user_role(uid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.leadgen_users where id = uid and active limit 1;
$$;

create or replace function public.leadgen_user_client_id(uid uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select client_id from public.leadgen_users where id = uid and active and role = 'client' limit 1;
$$;

revoke execute on function public.leadgen_user_role(uuid) from public, anon;
grant execute on function public.leadgen_user_role(uuid) to authenticated;
revoke execute on function public.leadgen_user_client_id(uuid) from public, anon;
grant execute on function public.leadgen_user_client_id(uuid) to authenticated;

alter table public.leadgen_users enable row level security;

create policy "leadgen_users_select_self"
  on public.leadgen_users for select
  using (id = auth.uid());

create policy "leadgen_users_admin_all"
  on public.leadgen_users for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- leadgen_clients RLS (table itself created above, ahead of the role
-- functions that reference it).
-- ---------------------------------------------------------------------
alter table public.leadgen_clients enable row level security;

create policy "leadgen_clients_admin_all"
  on public.leadgen_clients for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- Agents are internal staff - seeing which clients/campaigns exist isn't
-- a client-separation concern (only a *client* login must never see
-- another client's data). Agents get read-only visibility so lead lists
-- can display the client/campaign name.
create policy "leadgen_clients_agent_select"
  on public.leadgen_clients for select
  using (public.leadgen_user_role(auth.uid()) = 'agent');

create policy "leadgen_clients_client_select_own"
  on public.leadgen_clients for select
  using (id = public.leadgen_user_client_id(auth.uid()));

-- ---------------------------------------------------------------------
-- leadgen_campaigns
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  -- Overrides leadgen_clients.booking_link when set; falls back to the
  -- client's default when null (see getEffectiveBookingLink()).
  booking_link text,
  start_date date,
  end_date date,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists leadgen_campaigns_client_idx on public.leadgen_campaigns(client_id);

alter table public.leadgen_campaigns enable row level security;

create policy "leadgen_campaigns_admin_all"
  on public.leadgen_campaigns for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_campaigns_agent_select"
  on public.leadgen_campaigns for select
  using (public.leadgen_user_role(auth.uid()) = 'agent');

create policy "leadgen_campaigns_client_select_own"
  on public.leadgen_campaigns for select
  using (client_id = public.leadgen_user_client_id(auth.uid()));

-- ---------------------------------------------------------------------
-- leadgen_leads
-- ---------------------------------------------------------------------
-- Call outcome options double as the lead's current status (brief's
-- "CALL OUTCOME OPTIONS" list) - a call outcome *is* the new status.
-- 'Consultation Information Sent' is added for the Send Consultation
-- Email workflow, which sets it automatically after a successful send.
create table if not exists public.leadgen_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  business_name text not null,
  industry text,
  contact_name text,
  decision_maker_name text,
  phone text,
  email text,
  website text,
  city text,
  province text,
  lead_source text,
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  campaign_id uuid references public.leadgen_campaigns(id) on delete set null,
  assigned_agent_id uuid references auth.users(id) on delete set null,
  status text not null default 'New' check (status in (
    'New', 'Not called', 'No answer', 'Voicemail', 'Gatekeeper', 'Owner reached',
    'Callback requested', 'Interested', 'Information requested', 'Appointment booked',
    'Not interested', 'Wrong number', 'Do not call', 'Closed',
    'Consultation Information Sent'
  )),
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists leadgen_leads_client_idx on public.leadgen_leads(client_id);
create index if not exists leadgen_leads_campaign_idx on public.leadgen_leads(campaign_id);
create index if not exists leadgen_leads_agent_idx on public.leadgen_leads(assigned_agent_id);
create index if not exists leadgen_leads_status_idx on public.leadgen_leads(status);
create index if not exists leadgen_leads_next_follow_up_idx on public.leadgen_leads(next_follow_up_at);

alter table public.leadgen_leads enable row level security;

create policy "leadgen_leads_admin_all"
  on public.leadgen_leads for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- "Agents can only view leads assigned to them" (brief) - no blanket
-- agent-select policy exists here at all, unlike leadgen_clients/
-- leadgen_campaigns above. An administrator reassigning a lead is the
-- only way an agent's visibility into it changes.
create policy "leadgen_leads_agent_select_own"
  on public.leadgen_leads for select
  using (assigned_agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');

create policy "leadgen_leads_agent_update_own"
  on public.leadgen_leads for update
  using (assigned_agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent')
  with check (assigned_agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');

create policy "leadgen_leads_client_select_own"
  on public.leadgen_leads for select
  using (client_id = public.leadgen_user_client_id(auth.uid()));

-- ---------------------------------------------------------------------
-- leadgen_lead_activities: full call/email/status/note history - the
-- activity timeline (brief: "Record every call attempt in an activity
-- timeline. Keep the previous notes and status history."). Entirely
-- internal - no client access at all (agent-only notes and call detail
-- must never reach a client login).
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_lead_activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leadgen_leads(id) on delete cascade,
  agent_id uuid references auth.users(id) on delete set null,
  activity_type text not null check (activity_type in (
    'call', 'email', 'note', 'status_change', 'lead_assigned', 'lead_reassigned',
    'follow_up_scheduled', 'follow_up_completed', 'appointment_booked',
    'appointment_updated', 'consultation_email_sent'
  )),
  call_outcome text check (call_outcome is null or call_outcome in (
    'New', 'Not called', 'No answer', 'Voicemail', 'Gatekeeper', 'Owner reached',
    'Callback requested', 'Interested', 'Information requested', 'Appointment booked',
    'Not interested', 'Wrong number', 'Do not call', 'Closed',
    'Consultation Information Sent'
  )),
  notes text,
  occurred_at timestamptz not null default now()
);

create index if not exists leadgen_lead_activities_lead_idx on public.leadgen_lead_activities(lead_id, occurred_at desc);

alter table public.leadgen_lead_activities enable row level security;

create policy "leadgen_lead_activities_admin_all"
  on public.leadgen_lead_activities for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_lead_activities_agent_select_own_lead"
  on public.leadgen_lead_activities for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
  );

create policy "leadgen_lead_activities_agent_insert_own_lead"
  on public.leadgen_lead_activities for insert
  with check (
    agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- leadgen_followups: scheduled callbacks (brief "FOLLOW-UP FEATURES").
-- Same shape/semantics as the cleaning CRM's crm_followups, but a fully
-- separate table.
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_followups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leadgen_leads(id) on delete cascade,
  agent_id uuid references auth.users(id) on delete set null,
  scheduled_at timestamptz not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null
);

create index if not exists leadgen_followups_lead_idx on public.leadgen_followups(lead_id);
create index if not exists leadgen_followups_agent_pending_idx
  on public.leadgen_followups(agent_id, scheduled_at)
  where status = 'pending';

alter table public.leadgen_followups enable row level security;

create policy "leadgen_followups_admin_all"
  on public.leadgen_followups for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_followups_agent_select_own"
  on public.leadgen_followups for select
  using (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');

create policy "leadgen_followups_agent_insert_own"
  on public.leadgen_followups for insert
  with check (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');

create policy "leadgen_followups_agent_update_own"
  on public.leadgen_followups for update
  using (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent')
  with check (agent_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent');

-- ---------------------------------------------------------------------
-- leadgen_appointments
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_appointments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_id uuid references public.leadgen_leads(id) on delete set null,
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  campaign_id uuid references public.leadgen_campaigns(id) on delete set null,
  business_name text not null,
  contact_name text,
  phone text,
  email text,
  appointment_date date not null,
  appointment_time time not null,
  timezone text not null default 'America/Toronto',
  meeting_type text not null default 'Phone Call' check (meeting_type in ('Phone Call', 'Video Call', 'In Person')),
  meeting_link text,
  assigned_specialist_id uuid references auth.users(id) on delete set null,
  appointment_notes text,
  confirmation_sent boolean not null default false,
  status text not null default 'Booked' check (status in (
    'Booked', 'Confirmed', 'Completed', 'No-show', 'Rescheduled', 'Cancelled'
  )),
  client_feedback text,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists leadgen_appointments_client_idx on public.leadgen_appointments(client_id, appointment_date);
create index if not exists leadgen_appointments_lead_idx on public.leadgen_appointments(lead_id);
create index if not exists leadgen_appointments_specialist_idx on public.leadgen_appointments(assigned_specialist_id);

alter table public.leadgen_appointments enable row level security;

create policy "leadgen_appointments_admin_all"
  on public.leadgen_appointments for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- An agent can see/manage an appointment if they're the assigned
-- specialist, or it belongs to a lead assigned to them.
create policy "leadgen_appointments_agent_select_own"
  on public.leadgen_appointments for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and (
      assigned_specialist_id = auth.uid()
      or exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
    )
  );

create policy "leadgen_appointments_agent_insert_own"
  on public.leadgen_appointments for insert
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and (
      assigned_specialist_id = auth.uid()
      or exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
    )
  );

create policy "leadgen_appointments_agent_update_own"
  on public.leadgen_appointments for update
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and (
      assigned_specialist_id = auth.uid()
      or exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
    )
  );

create policy "leadgen_appointments_client_select_own"
  on public.leadgen_appointments for select
  using (client_id = public.leadgen_user_client_id(auth.uid()));

-- ---------------------------------------------------------------------
-- leadgen_email_templates: reusable, admin-managed. Agents may read (to
-- use when composing) but never edit (brief: "Cannot change system-wide
-- templates"). No client access - clients never compose.
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_email_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  key text not null unique,
  name text not null,
  subject text not null,
  body text not null,
  description text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null
);

alter table public.leadgen_email_templates enable row level security;

create policy "leadgen_email_templates_admin_all"
  on public.leadgen_email_templates for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_email_templates_agent_select"
  on public.leadgen_email_templates for select
  using (public.leadgen_user_role(auth.uid()) = 'agent');

-- Seed the one fully-implemented template for v1 (brief: "For this task,
-- fully implement the Consultation Information template first"). Other
-- template keys can be added later the same way - purely additive rows,
-- no schema change needed.
insert into public.leadgen_email_templates (key, name, subject, body, description)
values (
  'consultation_information',
  'Consultation Information',
  'Your FREE 15-Minute AI Business Growth Consultation',
  E'Hello {{first_name}},\n\nThank you for speaking with us today.\n\nAs discussed, we would like to invite you to a FREE 15-minute AI Business Growth Consultation.\n\nDuring the consultation, our specialist will show you practical ways businesses are using AI to:\n\n- Attract more customers\n- Generate more qualified leads\n- Automate customer follow-up\n- Save time on repetitive tasks\n- Improve sales opportunities\n\nThe consultation is completely free and there is no obligation.\n\n{{booking_paragraph}}\n\nWe look forward to speaking with you.\n\nRegards,\n\nWinsalot Corp.\nEmpowering Businesses, One Solution at a Time.',
  'Sent to a prospect who asked for information about the free 15-minute consultation.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- leadgen_emails: every email this CRM sends, to a client contact *or* a
-- prospect/lead - one unified, fully tracked log (brief sections "DIRECT
-- CLIENT EMAIL" + "EMAIL TRACKING"). `lead_id is not null` distinguishes
-- a prospect-facing send (e.g. the consultation email) from a
-- client-facing send (e.g. a campaign report) - both share the same
-- tracking shape, so one table keeps this DRY instead of duplicating
-- send/log/webhook logic per audience.
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.leadgen_clients(id) on delete cascade,
  campaign_id uuid references public.leadgen_campaigns(id) on delete set null,
  lead_id uuid references public.leadgen_leads(id) on delete set null,
  appointment_id uuid references public.leadgen_appointments(id) on delete set null,
  template_key text references public.leadgen_email_templates(key) on delete set null,
  to_email text not null,
  to_name text,
  subject text not null,
  body text not null,
  sender_email text not null,
  sent_by uuid references auth.users(id) on delete set null,
  status text not null default 'draft' check (status in (
    'draft', 'sending', 'sent', 'delivered', 'bounced', 'failed'
  )),
  resend_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  bounce_reason text,
  failed_at timestamptz,
  failure_reason text,
  -- Whether a client login may see this in their Communications view -
  -- always true for a client-facing send; a prospect-facing send (e.g.
  -- the consultation email, or any agent-internal note-to-self) is only
  -- marked visible if an administrator explicitly surfaces it, per the
  -- brief's "client may view messages intended for them, but must not
  -- see internal drafts or internal-only communications."
  client_visible boolean not null default true
);

create index if not exists leadgen_emails_client_idx on public.leadgen_emails(client_id, created_at desc);
create index if not exists leadgen_emails_lead_idx on public.leadgen_emails(lead_id, created_at desc);
create index if not exists leadgen_emails_resend_id_idx on public.leadgen_emails(resend_message_id);

alter table public.leadgen_emails enable row level security;

create policy "leadgen_emails_admin_all"
  on public.leadgen_emails for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_emails_agent_select_own"
  on public.leadgen_emails for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and (
      sent_by = auth.uid()
      or (lead_id is not null and exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid()))
    )
  );

-- Agents may only send a prospect email (consultation email) for a lead
-- assigned to them (brief: "Agent: Can send consultation emails only for
-- leads assigned to them... Agents must not be able to email the client
-- unless the administrator explicitly grants permission") - lead_id must
-- be set and owned by this agent; a client-facing send (lead_id null)
-- can never be inserted by an agent at all.
create policy "leadgen_emails_agent_insert_own_lead"
  on public.leadgen_emails for insert
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and sent_by = auth.uid()
    and lead_id is not null
    and exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
  );

-- A client only ever sees a non-draft message explicitly marked visible
-- to them - never a draft, and never one an admin has kept internal.
create policy "leadgen_emails_client_select_own"
  on public.leadgen_emails for select
  using (
    client_id = public.leadgen_user_client_id(auth.uid())
    and client_visible = true
    and status != 'draft'
  );
