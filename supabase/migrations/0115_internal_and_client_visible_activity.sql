-- Keep staff notes private while creating a separate, neutral progress
-- message for clients. Client summaries are generated from structured
-- activity fields only; the internal notes column is never copied.

alter table public.leadgen_lead_activities
  add column if not exists client_visible boolean not null default false,
  add column if not exists client_summary text;

alter table public.crm_activities
  add column if not exists client_visible boolean not null default false,
  add column if not exists client_summary text;

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
    else 'Lead activity updated.'
  end;
  return new;
end;
$$;

drop trigger if exists leadgen_client_activity_summary_trigger on public.leadgen_lead_activities;
create trigger leadgen_client_activity_summary_trigger
  before insert or update of activity_type, call_outcome, notes
  on public.leadgen_lead_activities
  for each row execute function public.set_leadgen_client_activity_summary();

-- Backfill safe summaries for existing structured activity. Existing
-- internal note text is intentionally not used by this update.
update public.leadgen_lead_activities
set activity_type = activity_type;

-- Public copies live in a separate table that has no private-note column.
-- This is stronger than relying on the application to omit `notes`: even
-- a handcrafted client query has no private field available to request.
create table if not exists public.leadgen_client_activities (
  id uuid primary key references public.leadgen_lead_activities(id) on delete cascade,
  lead_id uuid not null references public.leadgen_leads(id) on delete cascade,
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  activity_type text not null,
  summary text not null,
  occurred_at timestamptz not null
);

create index if not exists leadgen_client_activities_client_idx
  on public.leadgen_client_activities(client_id, occurred_at desc);
create index if not exists leadgen_client_activities_lead_idx
  on public.leadgen_client_activities(lead_id, occurred_at desc);

alter table public.leadgen_client_activities enable row level security;

create policy "leadgen_client_activities_admin_all"
  on public.leadgen_client_activities for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_client_activities_agent_select_own_lead"
  on public.leadgen_client_activities for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.leadgen_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    )
  );

create policy "leadgen_client_activities_client_select_own"
  on public.leadgen_client_activities for select
  using (client_id = public.leadgen_user_client_id(auth.uid()));

create or replace function public.sync_leadgen_client_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owning_client_id uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.leadgen_client_activities where id = old.id;
    return old;
  end if;

  if not new.client_visible or new.client_summary is null then
    delete from public.leadgen_client_activities where id = new.id;
    return new;
  end if;

  select client_id into owning_client_id
  from public.leadgen_leads
  where id = new.lead_id;

  if owning_client_id is null then
    delete from public.leadgen_client_activities where id = new.id;
    return new;
  end if;

  insert into public.leadgen_client_activities
    (id, lead_id, client_id, activity_type, summary, occurred_at)
  values
    (new.id, new.lead_id, owning_client_id, new.activity_type, new.client_summary, new.occurred_at)
  on conflict (id) do update set
    lead_id = excluded.lead_id,
    client_id = excluded.client_id,
    activity_type = excluded.activity_type,
    summary = excluded.summary,
    occurred_at = excluded.occurred_at;
  return new;
end;
$$;

drop trigger if exists leadgen_sync_client_activity_trigger on public.leadgen_lead_activities;
create trigger leadgen_sync_client_activity_trigger
  after insert or update or delete on public.leadgen_lead_activities
  for each row execute function public.sync_leadgen_client_activity();

-- Populate the isolated client table for the safe summaries backfilled
-- above. No private notes are selected or copied.
insert into public.leadgen_client_activities
  (id, lead_id, client_id, activity_type, summary, occurred_at)
select a.id, a.lead_id, l.client_id, a.activity_type, a.client_summary, a.occurred_at
from public.leadgen_lead_activities a
join public.leadgen_leads l on l.id = a.lead_id
where a.client_visible = true and a.client_summary is not null
on conflict (id) do update set
  lead_id = excluded.lead_id,
  client_id = excluded.client_id,
  activity_type = excluded.activity_type,
  summary = excluded.summary,
  occurred_at = excluded.occurred_at;

create or replace function public.set_crm_client_activity_summary()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.activity_type = 'note' then
    new.client_visible := false;
    new.client_summary := null;
    return new;
  end if;

  new.client_visible := true;
  new.client_summary := case new.activity_type
    when 'call' then 'Call completed.'
    when 'email' then 'Email sent.'
    when 'text' then 'Text message sent.'
    when 'voicemail' then 'Voicemail left.'
    when 'outcome' then 'Follow-up updated.'
    when 'consultation_booked' then 'Consultation booked.'
    when 'consultation_rescheduled' then 'Consultation rescheduled.'
    when 'consultation_cancelled' then 'Consultation cancelled.'
    else 'Activity updated.'
  end;
  return new;
end;
$$;

drop trigger if exists crm_client_activity_summary_trigger on public.crm_activities;
create trigger crm_client_activity_summary_trigger
  before insert or update of activity_type, notes
  on public.crm_activities
  for each row execute function public.set_crm_client_activity_summary();

update public.crm_activities
set activity_type = activity_type;

revoke execute on function public.set_leadgen_client_activity_summary() from public, anon, authenticated;
revoke execute on function public.sync_leadgen_client_activity() from public, anon, authenticated;
revoke execute on function public.set_crm_client_activity_summary() from public, anon, authenticated;
