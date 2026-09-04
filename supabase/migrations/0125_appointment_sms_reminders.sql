-- SMS appointment reminders (Twilio) for both CRMs, alongside the
-- existing email reminder systems (leadgen_appointment_reminders,
-- migration 0067/0124; winsalot_appointment_reminders, migration 0088).
-- Nothing about either email pipeline is touched by this migration - SMS
-- is claimed/sent/tracked through its own tables, independent of email
-- success or failure, and the two never share a dedup row.
--
-- Backward-compatible with every existing appointment: sms_consent
-- defaults to false, so no existing row starts receiving SMS reminders
-- until a person explicitly opts in via the new "SMS reminder consent"
-- checkbox on the booking/edit forms - this migration itself never sends
-- anything and never assumes consent for data collected before this
-- feature existed.

-- ---------------------------------------------------------------------
-- sms_consent: reuses the existing `phone` column already collected on
-- both leadgen_appointments and winsalot_appointments (see the public
-- booking actions/admin-agent edit actions for each CRM) as the "mobile
-- number" - no new phone column needed, only the consent flag.
-- ---------------------------------------------------------------------
alter table public.leadgen_appointments
  add column if not exists sms_consent boolean not null default false;

alter table public.winsalot_appointments
  add column if not exists sms_consent boolean not null default false;

-- ---------------------------------------------------------------------
-- sms_opt_outs: a phone number's STOP/START state, keyed by the E.164
-- number itself rather than by CRM or appointment. A person's opt-out
-- via STOP is a fact about their phone number, not about which CRM's
-- Twilio number they replied to - honoring it everywhere is both the
-- simpler rule and the safer one for compliance. Written only by the
-- inbound Twilio webhook (service role) and read by both CRMs' reminder
-- jobs before every prospect-facing send; the internal admin
-- notification (ADMIN_PHONE_NUMBER) never consults this table, by
-- design - it is not a consumer the STOP/START compliance flow applies
-- to, and the brief explicitly does not require consent for it.
create table if not exists public.sms_opt_outs (
  phone_e164 text primary key,
  opted_out_at timestamptz,
  opted_in_at timestamptz,
  last_keyword text,
  last_source_crm text check (last_source_crm in ('leadgen', 'growth')),
  updated_at timestamptz not null default now()
);

alter table public.sms_opt_outs enable row level security;

-- Read-only for both CRMs' admins/agents (so an appointment list can show
-- "Opted Out" instead of a stale "Scheduled"); all writes go through the
-- inbound-webhook's service-role client, which bypasses RLS entirely.
create policy "sms_opt_outs_leadgen_select"
  on public.sms_opt_outs for select
  using (public.leadgen_user_role(auth.uid()) in ('admin', 'agent'));

create policy "sms_opt_outs_crm_select"
  on public.sms_opt_outs for select
  using (public.crm_user_role(auth.uid()) in ('admin', 'agent'));

-- ---------------------------------------------------------------------
-- leadgen_appointment_sms_reminders: SMS counterpart to
-- leadgen_appointment_reminders (migration 0067/0124). Same
-- claim/dedup technique - one row per (appointment_id, reminder_type,
-- occurrence_key, recipient_type), inserted only at the moment a send is
-- actually claimed, so an appointment with no row yet displays as
-- "Scheduled" exactly like the email table. recipient_type splits the
-- prospect-facing reminder (consent-gated) from the internal
-- ADMIN_PHONE_NUMBER notification (never consent-gated) as two
-- fully independent claims per occurrence, so one can never block or be
-- confused with the other.
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_appointment_sms_reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  appointment_id uuid not null references public.leadgen_appointments(id) on delete cascade,
  lead_id uuid references public.leadgen_leads(id) on delete set null,
  reminder_type text not null check (reminder_type in ('24_hour_reminder', '1_hour_reminder')),
  recipient_type text not null default 'prospect' check (recipient_type in ('prospect', 'admin')),
  occurrence_key text not null,
  scheduled_appointment_at timestamptz not null,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'delivered', 'failed', 'skipped', 'opted_out')),
  recipient_phone text,
  twilio_message_sid text,
  twilio_status text,
  error_detail text,
  attempt_count integer not null default 0,
  sent_at timestamptz,
  delivered_at timestamptz,
  unique (appointment_id, reminder_type, occurrence_key, recipient_type)
);

create index if not exists leadgen_appointment_sms_reminders_lead_idx on public.leadgen_appointment_sms_reminders(lead_id);
create index if not exists leadgen_appointment_sms_reminders_appointment_idx on public.leadgen_appointment_sms_reminders(appointment_id);
-- Not unique: a retried send (claim-retry from 'failed'/'skipped') keeps
-- the same row and simply overwrites twilio_message_sid, so it's not
-- guaranteed globally unique at every instant, only looked up by it.
create index if not exists leadgen_appointment_sms_reminders_sid_idx on public.leadgen_appointment_sms_reminders(twilio_message_sid);

alter table public.leadgen_appointment_sms_reminders enable row level security;

create policy "leadgen_appointment_sms_reminders_admin_all"
  on public.leadgen_appointment_sms_reminders for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_appointment_sms_reminders_agent_select_own"
  on public.leadgen_appointment_sms_reminders for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and lead_id is not null
    and exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- winsalot_appointment_sms_reminders: SMS counterpart to
-- winsalot_appointment_reminders (migration 0088), same shape/rules as
-- the leadgen table above.
-- ---------------------------------------------------------------------
create table if not exists public.winsalot_appointment_sms_reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  appointment_id uuid not null references public.winsalot_appointments(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('24_hour_reminder', '1_hour_reminder')),
  recipient_type text not null default 'prospect' check (recipient_type in ('prospect', 'admin')),
  occurrence_key text not null,
  scheduled_appointment_at timestamptz not null,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'delivered', 'failed', 'skipped', 'opted_out')),
  recipient_phone text,
  twilio_message_sid text,
  twilio_status text,
  error_detail text,
  attempt_count integer not null default 0,
  sent_at timestamptz,
  delivered_at timestamptz,
  unique (appointment_id, reminder_type, occurrence_key, recipient_type)
);

create index if not exists winsalot_appointment_sms_reminders_appointment_idx on public.winsalot_appointment_sms_reminders(appointment_id);
create index if not exists winsalot_appointment_sms_reminders_sid_idx on public.winsalot_appointment_sms_reminders(twilio_message_sid);

alter table public.winsalot_appointment_sms_reminders enable row level security;

create policy "winsalot_appointment_sms_reminders_admin_all"
  on public.winsalot_appointment_sms_reminders for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "winsalot_appointment_sms_reminders_agent_select_own"
  on public.winsalot_appointment_sms_reminders for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.winsalot_appointments a
      where a.id = appointment_id and a.assigned_agent_id = auth.uid()
    )
  );
