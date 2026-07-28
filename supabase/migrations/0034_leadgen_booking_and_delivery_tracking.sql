-- Lead Generation CRM: public consultation booking page (reschedule/
-- cancel tokens) + full Resend delivery-status tracking + permanently-
-- bounced-address blocking. Purely additive - no cleaning-CRM table
-- touched, no existing leadgen_* column removed or renamed.

-- ---------------------------------------------------------------------
-- Public consultation booking + reschedule/cancel tokens
-- ---------------------------------------------------------------------
alter table public.leadgen_appointments
  add column if not exists admin_notified_at timestamptz;

create table if not exists public.leadgen_appointment_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  appointment_id uuid not null references public.leadgen_appointments(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists leadgen_appointment_tokens_appointment_idx on public.leadgen_appointment_tokens(appointment_id);

alter table public.leadgen_appointment_tokens enable row level security;

create policy "leadgen_appointment_tokens_admin_all"
  on public.leadgen_appointment_tokens for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- No agent/client policy - the public booking page and its
-- reschedule/cancel management page have no Supabase Auth session at
-- all (same as the cleaning CRM's customer_quote_tokens/
-- provider_quote_tokens), so they read/write through the service-role
-- client, exactly like those two existing public flows.

-- ---------------------------------------------------------------------
-- Full Resend delivery-status tracking for leadgen_emails
-- ---------------------------------------------------------------------
alter table public.leadgen_emails
  drop constraint leadgen_emails_status_check;

alter table public.leadgen_emails
  add constraint leadgen_emails_status_check
  check (status in ('draft', 'sending', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed'));

alter table public.leadgen_emails
  add column if not exists delayed_at timestamptz,
  add column if not exists complained_at timestamptz;

-- ---------------------------------------------------------------------
-- Permanently-bounced recipient addresses - blocks an agent from
-- repeatedly emailing an address that has hard-bounced, until an admin
-- clears it (brief: "unless an admin corrects or approves the email
-- address"). Keyed on the lowercased address itself, not any one lead/
-- client, since the same address could appear on more than one lead.
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_bounced_emails (
  email text primary key,
  bounce_reason text,
  bounced_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references auth.users(id) on delete set null
);

alter table public.leadgen_bounced_emails enable row level security;

create policy "leadgen_bounced_emails_admin_all"
  on public.leadgen_bounced_emails for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

-- Agents need read access purely to show the "this address bounced"
-- warning badge next to a lead/client's email - no bounce detail here
-- is sensitive.
create policy "leadgen_bounced_emails_agent_select"
  on public.leadgen_bounced_emails for select
  using (public.leadgen_user_role(auth.uid()) = 'agent');

-- Widen the agent insert policy on leadgen_emails to also block sending
-- to a currently (uncleared) permanently-bounced address - enforced at
-- the RLS layer, not just the UI, same as every other agent restriction
-- on this table.
drop policy "leadgen_emails_agent_insert_own_lead" on public.leadgen_emails;

create policy "leadgen_emails_agent_insert_own_lead"
  on public.leadgen_emails for insert
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and sent_by = auth.uid()
    and lead_id is not null
    and exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
    and not exists (
      select 1 from public.leadgen_bounced_emails b
      where b.email = lower(to_email) and b.cleared_at is null
    )
  );
