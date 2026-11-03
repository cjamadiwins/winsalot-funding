-- Lead Generation CRM: client qualification settings + appointment quality control.
--
-- Goal: only deliver appointments with prospects who genuinely want a service the
-- client actually offers (website development / redesign / e-commerce / SEO ...),
-- not prospects who want standalone lead generation or cold calling.
--
-- ADDITIVE ONLY. New tables, plus new nullable/defaulted columns on
-- leadgen_appointments. No existing row is updated or deleted, no existing policy,
-- grant or function is changed. In particular nothing here touches leadgen_leads,
-- call logs, incentive_status, payroll/commission tables or reminder tables.
--
-- Existing appointments keep qc_status = 'not_required' (they predate the process)
-- and their status/outcome is untouched. Appointments of the two gated clients
-- whose website-service interest is unclear are only FLAGGED, in a separate table,
-- for Admin review.
--
-- Client portal visibility: the client SELECT policies on leadgen_appointments and
-- leadgen_conversions (and the conversions UPDATE policy) are re-created with one
-- extra condition so a client cannot see an appointment, or the conversion row the
-- existing trigger creates for it, while it is awaiting approval, sent back, or
-- rejected. Existing appointments are 'not_required', so what clients see today is
-- unchanged.
--
-- Enforcement is in the database (triggers), so it holds for server actions that
-- use the service role as well as for direct API calls:
--   * a qualification can only be outcome 'qualified' when every required answer is
--     recorded, the prospect understands the service and agreed to the appointment,
--     does not want lead generation only, and picked a service the client has Admin-
--     approved;
--   * a new appointment for a gated client always starts 'pending_review' (the caller
--     cannot choose another value), and a signed-in agent/Admin cannot even submit one
--     without a valid, qualified qualification for that lead;
--   * an appointment can only become 'approved' by an Admin reviewer, with a linked
--     qualification that is still 'qualified' for the same lead and client;
--   * 'rejected' needs a reason, 'needs_info' needs Admin feedback;
--   * agents (authenticated, non-admin sessions) can never change review state.

-- ---------------------------------------------------------------------------
-- 1. Per-client approved services
-- ---------------------------------------------------------------------------
create table if not exists public.leadgen_client_qualification_settings (
  client_id uuid primary key references public.leadgen_clients(id) on delete cascade,
  -- When true, new appointments for this client need a qualification + Admin approval.
  enabled boolean not null default false,
  -- Standard keys: new_website, redesign_rebranding, ecommerce, seo_visibility,
  -- human_search_optimization. Admin-confirmed extras are stored as 'custom:<label>'.
  approved_services text[] not null default '{}',
  notes text,
  updated_by uuid references public.leadgen_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Agent qualification answers (one record per lead; updated as the call evolves)
-- ---------------------------------------------------------------------------
create table if not exists public.leadgen_lead_qualifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leadgen_leads(id),
  client_id uuid not null references public.leadgen_clients(id),
  campaign_id uuid references public.leadgen_campaigns(id) on delete set null,
  agent_id uuid references public.leadgen_users(id) on delete set null,

  -- Mandatory agent questions
  has_website text check (has_website in ('yes', 'no', 'unsure')),
  website_url text,
  interested_in_new_or_redesign text check (interested_in_new_or_redesign in ('new_website', 'redesign', 'both', 'neither', 'unsure')),
  satisfied_with_site text check (satisfied_with_site in ('satisfied', 'not_satisfied', 'unsure', 'not_applicable')),
  needs_ecommerce text check (needs_ecommerce in ('yes', 'no', 'unsure')),
  interested_in_seo text check (interested_in_seo in ('yes', 'no', 'unsure')),
  challenges text,
  understands_services boolean,
  agreed_to_appointment boolean,

  -- Supporting detail
  services_of_interest text[] not null default '{}',
  intended_improvements text,
  qualification_notes text,
  -- Prospect asked for standalone lead generation / cold calling instead of website services.
  lead_gen_only boolean not null default false,

  -- Filtering category. Automatic values are preliminary until an agent verifies them.
  category text check (category in (
    'no_website_new', 'existing_website_redesign', 'seo_visibility', 'ecommerce',
    'multiple_services', 'requires_further_qualification', 'not_qualified_lead_gen_only'
  )),
  category_source text not null default 'auto_preliminary' check (category_source in ('auto_preliminary', 'agent_verified')),

  outcome text not null default 'draft' check (outcome in ('draft', 'qualified', 'requires_further_qualification', 'not_qualified')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leadgen_lead_qualifications_one_per_lead unique (lead_id)
);

create index if not exists leadgen_lead_qualifications_client_idx on public.leadgen_lead_qualifications (client_id, outcome);
create index if not exists leadgen_lead_qualifications_agent_idx on public.leadgen_lead_qualifications (agent_id);

-- Names of the required answers that are still missing.
create or replace function public.leadgen_qualification_missing(q public.leadgen_lead_qualifications)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
    case when q.has_website is null then 'has_website' end,
    case when q.interested_in_new_or_redesign is null then 'interested_in_new_or_redesign' end,
    case when q.satisfied_with_site is null then 'satisfied_with_site' end,
    case when q.needs_ecommerce is null then 'needs_ecommerce' end,
    case when q.interested_in_seo is null then 'interested_in_seo' end,
    case when btrim(coalesce(q.challenges, '')) = '' then 'challenges' end,
    case when q.understands_services is null then 'understands_services' end,
    case when q.agreed_to_appointment is null then 'agreed_to_appointment' end
  ], null);
$$;

-- True only when the qualification may be marked 'qualified'.
create or replace function public.leadgen_qualification_is_qualifiable(q public.leadgen_lead_qualifications)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_length(public.leadgen_qualification_missing(q), 1), 0) = 0
    and q.understands_services is true
    and q.agreed_to_appointment is true
    and q.lead_gen_only is not true
    and exists (
      select 1
      from public.leadgen_client_qualification_settings s
      where s.client_id = q.client_id
        and exists (select 1 from unnest(q.services_of_interest) as picked(service) where picked.service = any (s.approved_services))
    );
$$;

create or replace function public.leadgen_qualification_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_bad text;
begin
  select picked.service into v_bad
  from unnest(new.services_of_interest) as picked(service)
  where picked.service not in ('new_website', 'redesign_rebranding', 'ecommerce', 'seo_visibility', 'human_search_optimization')
    and picked.service not like 'custom:%'
  limit 1;
  if v_bad is not null then
    raise exception 'qualification_invalid_service: %', v_bad;
  end if;

  if new.lead_gen_only then
    new.category := 'not_qualified_lead_gen_only';
    if new.outcome = 'qualified' then
      raise exception 'qualification_not_allowed: the prospect wants lead generation only';
    end if;
  end if;

  if new.outcome = 'qualified' and not public.leadgen_qualification_is_qualifiable(new) then
    raise exception 'qualification_incomplete: missing %, or understanding/agreement not confirmed, or no Admin-approved service selected',
      coalesce(array_to_string(public.leadgen_qualification_missing(new), ', '), 'nothing');
  end if;

  if tg_op = 'UPDATE' then
    -- Once an appointment has been approved on this qualification, only Admin may edit it.
    if v_actor is not null
       and coalesce(public.leadgen_user_role(v_actor), '') <> 'admin'
       and exists (select 1 from public.leadgen_appointments a where a.qualification_id = old.id and a.qc_status = 'approved') then
      raise exception 'qualification_locked: an approved appointment depends on this qualification';
    end if;
    -- The lead and client a qualification belongs to never change.
    new.lead_id := old.lead_id;
    new.client_id := old.client_id;
  end if;

  if new.outcome = 'qualified' and new.submitted_at is null then
    new.submitted_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leadgen_qualification_guard_trg on public.leadgen_lead_qualifications;
create trigger leadgen_qualification_guard_trg
  before insert or update on public.leadgen_lead_qualifications
  for each row execute function public.leadgen_qualification_guard();

-- ---------------------------------------------------------------------------
-- 3. Appointment review state
-- ---------------------------------------------------------------------------
alter table public.leadgen_appointments
  add column if not exists qc_status text not null default 'not_required',
  add column if not exists qualification_id uuid references public.leadgen_lead_qualifications(id) on delete set null,
  add column if not exists qc_submitted_at timestamptz,
  add column if not exists qc_reviewed_by uuid references public.leadgen_users(id) on delete set null,
  add column if not exists qc_reviewed_at timestamptz,
  add column if not exists qc_rejection_reason text,
  add column if not exists qc_admin_feedback text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leadgen_appointments_qc_status_check') then
    alter table public.leadgen_appointments
      add constraint leadgen_appointments_qc_status_check
      check (qc_status in ('not_required', 'pending_review', 'needs_info', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists leadgen_appointments_qc_status_idx on public.leadgen_appointments (qc_status) where qc_status <> 'not_required';

-- Client-facing notifications / reminders / briefs may go out only in these states.
create or replace function public.leadgen_appointment_client_notifiable(p_qc_status text)
returns boolean
language sql
immutable
as $$ select p_qc_status in ('not_required', 'approved'); $$;

create or replace function public.leadgen_appointment_qc_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_enabled boolean;
  v_q public.leadgen_lead_qualifications;
begin
  if tg_op = 'INSERT' then
    select coalesce(s.enabled, false) into v_enabled
    from public.leadgen_client_qualification_settings s
    where s.client_id = new.client_id;
    -- The caller cannot choose the review state: gated clients always start pending.
    new.qc_status := case when coalesce(v_enabled, false) then 'pending_review' else 'not_required' end;
    -- A signed-in user (agent or Admin) cannot submit an appointment for a gated
    -- client unless it links a valid, qualified qualification for the same lead and
    -- client. Server-side system bookings (public booking page, Calendly webhook) run
    -- as the service role with no signed-in user; they are held as pending and can
    -- never be approved without a qualification.
    if new.qc_status = 'pending_review' and v_actor is not null then
      select * into v_q from public.leadgen_lead_qualifications where id = new.qualification_id;
      if not found
         or v_q.outcome <> 'qualified'
         or v_q.client_id <> new.client_id
         or v_q.lead_id is distinct from new.lead_id
         or not public.leadgen_qualification_is_qualifiable(v_q) then
        raise exception 'qc_qualification_required: this client requires a complete, qualified qualification for the lead before an appointment can be submitted';
      end if;
    end if;
    new.qc_submitted_at := case when new.qc_status = 'pending_review' then now() else null end;
    new.qc_reviewed_by := null;
    new.qc_reviewed_at := null;
    new.qc_rejection_reason := null;
    new.qc_admin_feedback := null;
    return new;
  end if;

  if (new.qc_status, new.qualification_id, new.qc_submitted_at, new.qc_reviewed_by, new.qc_reviewed_at, new.qc_rejection_reason, new.qc_admin_feedback)
     is not distinct from
     (old.qc_status, old.qualification_id, old.qc_submitted_at, old.qc_reviewed_by, old.qc_reviewed_at, old.qc_rejection_reason, old.qc_admin_feedback) then
    return new;
  end if;

  -- Agents (and any other signed-in non-admin) can never change review state.
  if v_actor is not null and coalesce(public.leadgen_user_role(v_actor), '') <> 'admin' then
    raise exception 'qc_forbidden: only Admin can change appointment review state';
  end if;

  if new.qc_status is distinct from old.qc_status then
    if not (
      (old.qc_status = 'pending_review' and new.qc_status in ('approved', 'rejected', 'needs_info'))
      or (old.qc_status = 'needs_info' and new.qc_status in ('pending_review', 'rejected'))
    ) then
      raise exception 'qc_invalid_transition: % -> %', old.qc_status, new.qc_status;
    end if;

    if new.qc_status = 'approved' then
      select * into v_q from public.leadgen_lead_qualifications where id = new.qualification_id;
      if not found
         or v_q.outcome <> 'qualified'
         or v_q.client_id <> new.client_id
         or v_q.lead_id is distinct from new.lead_id
         or not public.leadgen_qualification_is_qualifiable(v_q) then
        raise exception 'qc_not_qualified: a complete qualification (qualified outcome, approved service, prospect understands and agreed) is required before approval';
      end if;
      if new.qc_reviewed_by is null
         or not exists (select 1 from public.leadgen_users u where u.id = new.qc_reviewed_by and u.role = 'admin') then
        raise exception 'qc_reviewer_required: approval must be recorded by an Admin';
      end if;
      new.qc_reviewed_at := coalesce(new.qc_reviewed_at, now());
      new.qc_rejection_reason := null;
    elsif new.qc_status = 'rejected' then
      if btrim(coalesce(new.qc_rejection_reason, '')) = '' then
        raise exception 'qc_reason_required: a rejection reason is required';
      end if;
      new.qc_reviewed_at := coalesce(new.qc_reviewed_at, now());
    elsif new.qc_status = 'needs_info' then
      if btrim(coalesce(new.qc_admin_feedback, '')) = '' then
        raise exception 'qc_feedback_required: tell the agent what to qualify further';
      end if;
      new.qc_reviewed_at := coalesce(new.qc_reviewed_at, now());
    elsif new.qc_status = 'pending_review' then
      new.qc_submitted_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leadgen_appointment_qc_guard_trg on public.leadgen_appointments;
create trigger leadgen_appointment_qc_guard_trg
  before insert or update on public.leadgen_appointments
  for each row execute function public.leadgen_appointment_qc_guard();

-- ---------------------------------------------------------------------------
-- 4. Append-only review log (written by trigger, so every path is audited)
-- ---------------------------------------------------------------------------
create table if not exists public.leadgen_appointment_qc_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  appointment_id uuid not null references public.leadgen_appointments(id) on delete cascade,
  client_id uuid not null references public.leadgen_clients(id),
  agent_id uuid references public.leadgen_users(id) on delete set null,
  action text not null check (action in ('submitted', 'resubmitted', 'approved', 'rejected', 'needs_info')),
  reason text,
  feedback text,
  reviewed_by uuid references public.leadgen_users(id) on delete set null
);
create index if not exists leadgen_appointment_qc_reviews_appt_idx on public.leadgen_appointment_qc_reviews (appointment_id, created_at);
create index if not exists leadgen_appointment_qc_reviews_client_idx on public.leadgen_appointment_qc_reviews (client_id, action);

create or replace function public.leadgen_appointment_qc_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    if new.qc_status <> 'pending_review' then return new; end if;
    v_action := 'submitted';
  else
    if new.qc_status is not distinct from old.qc_status then return new; end if;
    v_action := case new.qc_status
      when 'pending_review' then 'resubmitted'
      when 'approved' then 'approved'
      when 'rejected' then 'rejected'
      when 'needs_info' then 'needs_info'
    end;
    if v_action is null then return new; end if;
  end if;
  insert into public.leadgen_appointment_qc_reviews (appointment_id, client_id, agent_id, action, reason, feedback, reviewed_by)
  values (new.id, new.client_id, coalesce(new.booking_agent_id, new.assigned_specialist_id), v_action, new.qc_rejection_reason, new.qc_admin_feedback, new.qc_reviewed_by);
  return new;
end;
$$;

drop trigger if exists leadgen_appointment_qc_log_trg on public.leadgen_appointments;
create trigger leadgen_appointment_qc_log_trg
  after insert or update on public.leadgen_appointments
  for each row execute function public.leadgen_appointment_qc_log();

-- ---------------------------------------------------------------------------
-- 5. Legacy appointments flagged for Admin review (flag only; nothing changed)
-- ---------------------------------------------------------------------------
create table if not exists public.leadgen_appointment_legacy_flags (
  appointment_id uuid primary key references public.leadgen_appointments(id) on delete cascade,
  client_id uuid not null references public.leadgen_clients(id),
  reason text not null,
  flagged_at timestamptz not null default now(),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed_ok', 'reviewed_issue')),
  reviewed_by uuid references public.leadgen_users(id) on delete set null,
  reviewed_at timestamptz,
  admin_note text
);

-- ---------------------------------------------------------------------------
-- 6. Row level security
-- ---------------------------------------------------------------------------
alter table public.leadgen_client_qualification_settings enable row level security;
alter table public.leadgen_lead_qualifications enable row level security;
alter table public.leadgen_appointment_qc_reviews enable row level security;
alter table public.leadgen_appointment_legacy_flags enable row level security;

drop policy if exists leadgen_qualification_settings_admin_all on public.leadgen_client_qualification_settings;
create policy leadgen_qualification_settings_admin_all on public.leadgen_client_qualification_settings
  for all using (public.leadgen_user_role(auth.uid()) = 'admin') with check (public.leadgen_user_role(auth.uid()) = 'admin');
drop policy if exists leadgen_qualification_settings_agent_select on public.leadgen_client_qualification_settings;
create policy leadgen_qualification_settings_agent_select on public.leadgen_client_qualification_settings
  for select using (public.leadgen_user_role(auth.uid()) = 'agent' and public.leadgen_agent_client_allowed(auth.uid(), client_id));

drop policy if exists leadgen_lead_qualifications_admin_all on public.leadgen_lead_qualifications;
create policy leadgen_lead_qualifications_admin_all on public.leadgen_lead_qualifications
  for all using (public.leadgen_user_role(auth.uid()) = 'admin') with check (public.leadgen_user_role(auth.uid()) = 'admin');
drop policy if exists leadgen_lead_qualifications_agent_select on public.leadgen_lead_qualifications;
create policy leadgen_lead_qualifications_agent_select on public.leadgen_lead_qualifications
  for select using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (select 1 from public.leadgen_leads l where l.id = leadgen_lead_qualifications.lead_id and l.assigned_agent_id = auth.uid())
  );
drop policy if exists leadgen_lead_qualifications_agent_insert on public.leadgen_lead_qualifications;
create policy leadgen_lead_qualifications_agent_insert on public.leadgen_lead_qualifications
  for insert with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and agent_id = auth.uid()
    and exists (
      select 1 from public.leadgen_leads l
      where l.id = leadgen_lead_qualifications.lead_id
        and l.assigned_agent_id = auth.uid()
        and l.client_id = leadgen_lead_qualifications.client_id
        and l.campaign_id is not distinct from leadgen_lead_qualifications.campaign_id
    )
    and public.leadgen_agent_campaign_allowed(auth.uid(), campaign_id)
  );
drop policy if exists leadgen_lead_qualifications_agent_update on public.leadgen_lead_qualifications;
create policy leadgen_lead_qualifications_agent_update on public.leadgen_lead_qualifications
  for update using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (select 1 from public.leadgen_leads l where l.id = leadgen_lead_qualifications.lead_id and l.assigned_agent_id = auth.uid())
  ) with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and agent_id = auth.uid()
    and exists (select 1 from public.leadgen_leads l where l.id = leadgen_lead_qualifications.lead_id and l.assigned_agent_id = auth.uid())
  );

drop policy if exists leadgen_appointment_qc_reviews_admin_select on public.leadgen_appointment_qc_reviews;
create policy leadgen_appointment_qc_reviews_admin_select on public.leadgen_appointment_qc_reviews
  for select using (public.leadgen_user_role(auth.uid()) = 'admin');
drop policy if exists leadgen_appointment_qc_reviews_agent_select on public.leadgen_appointment_qc_reviews;
create policy leadgen_appointment_qc_reviews_agent_select on public.leadgen_appointment_qc_reviews
  for select using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (select 1 from public.leadgen_appointments a where a.id = leadgen_appointment_qc_reviews.appointment_id)
  );

drop policy if exists leadgen_appointment_legacy_flags_admin_all on public.leadgen_appointment_legacy_flags;
create policy leadgen_appointment_legacy_flags_admin_all on public.leadgen_appointment_legacy_flags
  for all using (public.leadgen_user_role(auth.uid()) = 'admin') with check (public.leadgen_user_role(auth.uid()) = 'admin');

revoke all on table public.leadgen_client_qualification_settings from anon, authenticated;
revoke all on table public.leadgen_lead_qualifications from anon, authenticated;
revoke all on table public.leadgen_appointment_qc_reviews from anon, authenticated;
revoke all on table public.leadgen_appointment_legacy_flags from anon, authenticated;
grant select on table public.leadgen_client_qualification_settings to authenticated;
grant select, insert, update on table public.leadgen_lead_qualifications to authenticated;
grant select on table public.leadgen_appointment_qc_reviews to authenticated;
grant select, update on table public.leadgen_appointment_legacy_flags to authenticated;
grant all on table public.leadgen_client_qualification_settings to service_role;
grant all on table public.leadgen_lead_qualifications to service_role;
grant all on table public.leadgen_appointment_qc_reviews to service_role;
grant all on table public.leadgen_appointment_legacy_flags to service_role;

-- ---------------------------------------------------------------------------
-- 6b. Clients must not see an appointment (or its auto-created conversion row)
--     until it is approved. Only the client-facing policies change; each keeps
--     its original condition and adds the notifiable check.
-- ---------------------------------------------------------------------------
create or replace function public.leadgen_appointment_visible_to_client(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_appointment_id is null
    or coalesce((select public.leadgen_appointment_client_notifiable(a.qc_status) from public.leadgen_appointments a where a.id = p_appointment_id), true);
$$;

drop policy if exists leadgen_appointments_client_select_own on public.leadgen_appointments;
create policy leadgen_appointments_client_select_own on public.leadgen_appointments
  for select using (client_id = public.leadgen_user_client_id(auth.uid()) and public.leadgen_appointment_client_notifiable(qc_status));

drop policy if exists leadgen_conversions_client_select_own on public.leadgen_conversions;
create policy leadgen_conversions_client_select_own on public.leadgen_conversions
  for select using (client_id = public.leadgen_user_client_id(auth.uid()) and public.leadgen_appointment_visible_to_client(appointment_id));

drop policy if exists leadgen_conversions_client_update_own on public.leadgen_conversions;
create policy leadgen_conversions_client_update_own on public.leadgen_conversions
  for update using (client_id = public.leadgen_user_client_id(auth.uid()) and public.leadgen_appointment_visible_to_client(appointment_id))
  with check (client_id = public.leadgen_user_client_id(auth.uid()) and public.leadgen_appointment_visible_to_client(appointment_id));

-- ---------------------------------------------------------------------------
-- 7. Seed per-client settings (Admin can change them afterwards)
--    Services are NOT assumed to be shared: Teknokraft's e-commerce is left off
--    until Admin confirms it is offered.
-- ---------------------------------------------------------------------------
insert into public.leadgen_client_qualification_settings (client_id, enabled, approved_services, notes)
select c.id, true,
       array['new_website', 'redesign_rebranding', 'ecommerce', 'seo_visibility', 'human_search_optimization'],
       'Seeded 2026-11-03: new website, redesign/rebranding, e-commerce, SEO and online visibility, human search optimization.'
from public.leadgen_clients c
where c.name = 'Hidebrandt Web Services'
on conflict (client_id) do nothing;

insert into public.leadgen_client_qualification_settings (client_id, enabled, approved_services, notes)
select c.id, true,
       array['new_website', 'redesign_rebranding', 'seo_visibility'],
       'Seeded 2026-11-03: new website, redesign/rebranding, SEO and online visibility. E-commerce and other services stay off until Admin confirms them.'
from public.leadgen_clients c
where c.name = 'Teknokraft Canada Inc.'
on conflict (client_id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Flag existing appointments of the gated clients whose website-service
--    interest is unclear. Evidence is read from the appointment note, the lead
--    note and the agent's own call/note entries. Nothing is changed or deleted.
-- ---------------------------------------------------------------------------
insert into public.leadgen_appointment_legacy_flags (appointment_id, client_id, reason)
select e.id, e.client_id,
  case
    when e.has_leadgen and not e.has_website then 'Prospect interest appears to be lead generation / cold calling, not website services.'
    when e.has_leadgen and e.has_website then 'Mixed interest: lead generation is mentioned alongside website services. Confirm which service the prospect wants.'
    else 'No documented interest in website-related services (new site, redesign, e-commerce, SEO).'
  end
from (
  select a.id, a.client_id,
    (t.txt ~* '(web ?site|redesign|re-?brand|\mseo\M|e-?commerce|online store|shopify|search engine|online visib)') as has_website,
    (t.txt ~* '(lead[ -]?gen(eration)?|cold[ -]?call)') as has_leadgen
  from public.leadgen_appointments a
  join public.leadgen_client_qualification_settings s on s.client_id = a.client_id and s.enabled
  left join public.leadgen_leads l on l.id = a.lead_id
  cross join lateral (
    select concat_ws(' ', a.appointment_notes, l.notes,
      (select string_agg(x.notes, ' ') from public.leadgen_lead_activities x where x.lead_id = a.lead_id and x.activity_type in ('call', 'note'))) as txt
  ) t
  where a.status not in ('Cancelled', 'Replaced')
    and a.qc_status = 'not_required'
) e
where (not e.has_website) or e.has_leadgen
on conflict (appointment_id) do nothing;

comment on table public.leadgen_client_qualification_settings is 'Per-client Admin-approved services and whether the qualification + Admin approval gate is enabled. Services are never assumed to be shared between clients.';
comment on table public.leadgen_lead_qualifications is 'Agent qualification answers per lead. outcome=qualified is enforced by trigger (complete answers, understood, agreed, not lead-gen-only, approved service). Category values set automatically are preliminary until category_source=agent_verified.';
comment on table public.leadgen_appointment_qc_reviews is 'Append-only audit of appointment quality-control events, written by trigger.';
comment on table public.leadgen_appointment_legacy_flags is 'Existing appointments flagged for Admin review because website-service interest is unclear. Flag only; appointments are never modified.';
