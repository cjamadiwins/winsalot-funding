-- Client Portal, Phase 3: opportunity pipeline + client-editable
-- consultation outcome (brief sections 5, 6, 12, 14). Purely additive -
-- no existing table, column, row, policy, or trigger is altered except
-- the two narrow, backward-compatible additions called out below.
--
-- leadgen_client_opportunities: one row per appointment that has been
-- completed, layered ON TOP of leadgen_leads/leadgen_appointments -
-- never overwrites or deletes either (brief: "Do not overwrite or delete
-- the original appointment or lead record"). Pipeline "stage" itself is
-- NEVER stored here or anywhere - Contacted/Interested/Consultation
-- Booked/Consultation Completed are derived from the underlying lead and
-- appointment rows at read time (see derivePipelineStage() in
-- src/lib/leadgen-types.ts), matching this repo's existing
-- never-store-a-derived-status rule (see deriveCrmOnboardingStage() in
-- src/lib/crm-agreement-types.ts). Only `client_outcome` (Pending /
-- Follow-Up Needed / Proposal Sent / Won / Lost) is a real, stored,
-- client-editable field - the brief's #6 "Client Consultation Outcome".
create table public.leadgen_client_opportunities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leadgen_leads(id) on delete restrict,
  appointment_id uuid references public.leadgen_appointments(id) on delete set null,
  -- Denormalized (also reachable via lead_id/appointment_id) so RLS can
  -- scope this table directly, same convention as leadgen_client_activities.
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  campaign_id uuid references public.leadgen_campaigns(id) on delete set null,
  client_outcome text not null default 'Pending' check (client_outcome in ('Pending', 'Follow-Up Needed', 'Proposal Sent', 'Won', 'Lost')),
  closed_date date,
  deal_value numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set by the trigger (system-created) or by the client's own update.
  updated_by uuid references auth.users(id) on delete set null,
  -- deal_value/closed_date only ever make sense once the client has
  -- actually marked the opportunity Won - enforced here, not just in the UI,
  -- so a raw API call can't leave the row in a contradictory state.
  check (deal_value is null or client_outcome = 'Won'),
  check (closed_date is null or client_outcome = 'Won')
);

-- One opportunity per appointment - the auto-create trigger below relies
-- on this for its "don't duplicate" check.
create unique index leadgen_client_opportunities_appointment_idx on public.leadgen_client_opportunities(appointment_id) where appointment_id is not null;
create index leadgen_client_opportunities_client_idx on public.leadgen_client_opportunities(client_id, created_at desc);
create index leadgen_client_opportunities_lead_idx on public.leadgen_client_opportunities(lead_id);

alter table public.leadgen_client_opportunities enable row level security;

create policy "leadgen_client_opportunities_admin_all" on public.leadgen_client_opportunities for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_client_opportunities_client_select_own" on public.leadgen_client_opportunities for select
  using (client_id = public.leadgen_user_client_id(auth.uid()));

-- The client's only write path: their own rows only (both before and
-- after the update), and only via the column-level grant below - RLS
-- alone can restrict *which rows*, not *which columns*, so the grant is
-- what actually stops a client request from touching lead_id,
-- appointment_id, client_id, or campaign_id even though the row-level
-- policy would otherwise allow updating a row they own.
create policy "leadgen_client_opportunities_client_update_own" on public.leadgen_client_opportunities for update
  using (client_id = public.leadgen_user_client_id(auth.uid()))
  with check (client_id = public.leadgen_user_client_id(auth.uid()));

-- This project's default schema privileges grant `authenticated` (and
-- `anon`) blanket table-level privileges, with RLS as the real gate - so
-- an RLS UPDATE policy alone would let a client rewrite lead_id/
-- appointment_id/client_id on their own row. Revoke the blanket UPDATE
-- and grant back only the four columns a client is ever meant to change
-- (brief requirement #16: "explicit Data API GRANT statements only for
-- roles that actually need access... do not apply broad permissions").
revoke update on public.leadgen_client_opportunities from authenticated, anon;
grant update (client_outcome, closed_date, deal_value, updated_at) on public.leadgen_client_opportunities to authenticated;

comment on table public.leadgen_client_opportunities is 'One row per completed consultation, layered on top of leadgen_leads/leadgen_appointments - never overwrites either. client_outcome is the only field a client can edit (RLS + column grant enforced); everything else is Admin/system-set.';
comment on column public.leadgen_client_opportunities.client_outcome is 'Client-editable via the Pipeline page. Won unlocks closed_date/deal_value in the UI; enforced at the DB level by the two CHECK constraints above.';

-- Two new client-visible activity types (extends, does not remove any
-- existing value) so pipeline changes surface in the Client Portal's
-- Recent Activity feed through the SAME existing pipeline as every other
-- client-visible event (see supabase/migrations/
-- 0115_internal_and_client_visible_activity.sql) - no separate feed
-- mechanism needed.
alter table public.leadgen_lead_activities drop constraint leadgen_lead_activities_activity_type_check;
alter table public.leadgen_lead_activities add constraint leadgen_lead_activities_activity_type_check check (activity_type in (
  'call', 'email', 'note', 'status_change', 'lead_assigned', 'lead_reassigned',
  'follow_up_scheduled', 'follow_up_completed', 'appointment_booked',
  'appointment_updated', 'consultation_email_sent', 'consultation_invitation_sent',
  'consultation_follow_up_sent', 'appointment_confirmation_resent',
  'appointment_reminder_sent', 'appointment_reminder_auto_sent',
  'appointment_business_reminder_auto_sent', 'mantra_collab_intro_sent',
  'opportunity_created', 'opportunity_outcome_changed'
));

create or replace function public.set_leadgen_client_activity_summary()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.activity_type in ('note', 'lead_assigned', 'lead_reassigned') then
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
    else 'Lead activity updated.'
  end;
  return new;
end;
$$;

-- Auto-creates an opportunity the moment a consultation is marked
-- Completed, from whichever admin/agent action changed the status - a
-- single trigger on leadgen_appointments covers every path uniformly.
-- SECURITY DEFINER + revoked execute (matches sync_leadgen_client_activity's
-- own pattern) so this can only ever run as the trigger, never be called
-- directly by an authenticated/anon request.
create or replace function public.sync_leadgen_appointment_opportunity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'Completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'Completed' then
    return new;
  end if;
  if new.lead_id is null then
    -- No lead to attribute this consultation to - nothing to create.
    return new;
  end if;

  insert into public.leadgen_client_opportunities (lead_id, appointment_id, client_id, campaign_id)
  values (new.lead_id, new.id, new.client_id, new.campaign_id)
  on conflict (appointment_id) where appointment_id is not null do nothing;

  if found then
    insert into public.leadgen_lead_activities (lead_id, activity_type, notes)
    values (new.lead_id, 'opportunity_created', 'Consultation completed; opportunity added to the client pipeline.');
  end if;

  return new;
end;
$$;

drop trigger if exists leadgen_appointment_opportunity_trigger on public.leadgen_appointments;
create trigger leadgen_appointment_opportunity_trigger
  after insert or update of status on public.leadgen_appointments
  for each row execute function public.sync_leadgen_appointment_opportunity();

revoke execute on function public.sync_leadgen_appointment_opportunity() from public, anon, authenticated;

-- Backfill: every already-Completed appointment with a lead attached gets
-- its opportunity row now, so the pipeline reflects real, existing
-- history immediately (brief: "The pipeline must use real CRM data" /
-- "Preserve all existing historical data") instead of only appearing for
-- consultations completed after this migration. Plain data insert, no
-- deletes, no updates to any existing row. Deliberately does NOT also
-- insert a "Consultation completed" activity entry for each one - that
-- would backdate a flood of Recent Activity noise for old history dated
-- "now" instead of when it actually happened.
insert into public.leadgen_client_opportunities (lead_id, appointment_id, client_id, campaign_id, created_at, updated_at)
select a.lead_id, a.id, a.client_id, a.campaign_id, a.updated_at, a.updated_at
from public.leadgen_appointments a
where a.status = 'Completed' and a.lead_id is not null
on conflict (appointment_id) where appointment_id is not null do nothing;
