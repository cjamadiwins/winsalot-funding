-- Opportunity Finder (Lead Generation CRM): same feature as migration 0112,
-- built against this CRM's own schema (leadgen_leads/leadgen_lead_activities/
-- leadgen_followups/leadgen_appointments/leadgen_emails) - deliberately a
-- fully separate table/functions/triggers, matching this codebase's
-- established convention of never coupling the two CRMs' schemas together
-- (see leadgen_crm.sql's own header). Reads only activity already on file
-- for a lead that already exists in this CRM; nothing external is ever
-- fetched or considered.
create table if not exists public.leadgen_opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  lead_id uuid not null unique references public.leadgen_leads(id) on delete cascade,

  score integer not null default 0 check (score between 0 and 100),
  category text not null default 'low' check (category in ('high', 'medium', 'low', 'closed')),
  -- Admin manual override (brief: "manually change priority").
  priority_override text check (priority_override in ('high', 'medium', 'low')),

  -- The AI-generated explanation, stored separately from the agent's own
  -- notes (leadgen_leads.notes / leadgen_lead_activities.notes) - recompute
  -- overwrites these, never anything on the source records.
  reasons jsonb not null default '[]'::jsonb,
  recommended_action text not null default '',
  signals jsonb not null default '{}'::jsonb,

  -- Agent-only workflow marker, independent of the lead's own `status`.
  agent_status text not null default 'new' check (agent_status in (
    'new', 'contacted', 'follow_up', 'interested', 'appointment_booked', 'closed'
  )),

  -- Admin dismiss/reopen, independent of the lead's own status.
  finder_state text not null default 'active' check (finder_state in ('active', 'dismissed')),
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users(id) on delete set null,
  dismissed_reason text,
  reopened_at timestamptz,

  last_scored_at timestamptz not null default now()
);

create index if not exists leadgen_opportunity_scores_category_idx on public.leadgen_opportunity_scores(category);
create index if not exists leadgen_opportunity_scores_finder_state_idx on public.leadgen_opportunity_scores(finder_state);
create index if not exists leadgen_opportunity_scores_agent_status_idx on public.leadgen_opportunity_scores(agent_status);

alter table public.leadgen_opportunity_scores enable row level security;

create policy "leadgen_opportunity_scores_admin_all"
  on public.leadgen_opportunity_scores for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_opportunity_scores_agent_select_own"
  on public.leadgen_opportunity_scores for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.leadgen_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    )
  );

create policy "leadgen_opportunity_scores_agent_update_own"
  on public.leadgen_opportunity_scores for update
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.leadgen_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    )
  )
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.leadgen_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    )
  );

-- Same "trusted internal writer" GUC technique as crm_opportunity_scores
-- (migration 0112) - lets the scoring engine below write every column even
-- when the recompute was triggered by an agent's own action, while still
-- blocking an agent's own direct update to anything but agent_status.
create or replace function public.leadgen_opportunity_scores_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.leadgen_score_engine', true), '') = 'true' then
    new.updated_at := now();
    return new;
  end if;

  if public.leadgen_user_role(auth.uid()) = 'agent' then
    if new.lead_id is distinct from old.lead_id
      or new.score is distinct from old.score
      or new.category is distinct from old.category
      or new.priority_override is distinct from old.priority_override
      or new.reasons is distinct from old.reasons
      or new.recommended_action is distinct from old.recommended_action
      or new.signals is distinct from old.signals
      or new.finder_state is distinct from old.finder_state
      or new.dismissed_at is distinct from old.dismissed_at
      or new.dismissed_by is distinct from old.dismissed_by
      or new.dismissed_reason is distinct from old.dismissed_reason
      or new.reopened_at is distinct from old.reopened_at
      or new.last_scored_at is distinct from old.last_scored_at
    then
      raise exception 'Agents may only update their own opportunity status.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.leadgen_opportunity_scores_before_update() from public, anon, authenticated;

drop trigger if exists leadgen_opportunity_scores_before_update_trigger on public.leadgen_opportunity_scores;

create trigger leadgen_opportunity_scores_before_update_trigger
  before update on public.leadgen_opportunity_scores
  for each row
  execute function public.leadgen_opportunity_scores_before_update();

-- ---------------------------------------------------------------------
-- Scoring engine. leadgen_leads.status already carries most of the
-- brief's positive/negative signals directly (Owner reached, Callback
-- requested, Interested, Information requested, Appointment booked vs Not
-- interested, Wrong number, Do not call) - a keyword scan over recent
-- notes is only a supplementary safety net for signals the status enum
-- can't express (duplicate, bad business info).
-- ---------------------------------------------------------------------
create or replace function public.leadgen_recompute_opportunity_score(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_recent_notes text;
  v_activity_count integer;
  v_call_count integer;
  v_last_call_at timestamptz;
  v_last_email_activity_at timestamptz;
  v_last_note_at timestamptz;
  v_pending_followup boolean;
  v_appointment_upcoming boolean;
  v_appointment_completed boolean;
  v_email_engaged boolean;
  v_score integer := 0;
  v_reasons text[] := '{}';
  v_category text;
  v_force_closed boolean := false;
  v_recommended text;
  v_now timestamptz := now();
begin
  select * into v_lead from public.leadgen_leads where id = p_lead_id;
  if not found then
    delete from public.leadgen_opportunity_scores where lead_id = p_lead_id;
    return;
  end if;

  select
    count(*),
    count(*) filter (where activity_type = 'call'),
    max(occurred_at) filter (where activity_type = 'call'),
    max(occurred_at) filter (where activity_type like 'consultation%' or activity_type = 'email'),
    max(occurred_at) filter (where activity_type = 'note')
  into v_activity_count, v_call_count, v_last_call_at, v_last_email_activity_at, v_last_note_at
  from public.leadgen_lead_activities
  where lead_id = p_lead_id;

  select string_agg(notes, ' | ')
  into v_recent_notes
  from (
    select notes from public.leadgen_lead_activities
    where lead_id = p_lead_id and notes is not null
    order by occurred_at desc
    limit 8
  ) recent;

  v_recent_notes := lower(coalesce(v_recent_notes, '') || ' ' || coalesce(v_lead.notes, ''));

  select exists(
    select 1 from public.leadgen_followups
    where lead_id = p_lead_id and status = 'pending'
  ) into v_pending_followup;

  select
    bool_or(status in ('Booked', 'Confirmed') and appointment_date >= current_date),
    bool_or(status = 'Completed')
  into v_appointment_upcoming, v_appointment_completed
  from public.leadgen_appointments
  where lead_id = p_lead_id;

  select exists(
    select 1 from public.leadgen_emails
    where lead_id = p_lead_id and status in ('opened', 'clicked')
  ) into v_email_engaged;

  -- Disqualifying signals force the Closed / Not Opportunity bucket.
  if v_lead.status in ('Not interested', 'Wrong number', 'Do not call') then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Marked "' || v_lead.status || '"');
  elsif v_lead.status = 'Closed' or coalesce(v_appointment_completed, false) then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, case when v_appointment_completed then 'Consultation completed - closed' else 'Lead closed' end);
  elsif v_recent_notes ~ '(wrong number|duplicate (lead|entry|business)|bad (number|business|info)|invalid number|no longer in business|out of business|do not call|don''t call|remove me from|no further contact)' then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Recent notes indicate this lead should not be contacted further');
  end if;

  if v_lead.status = 'Owner reached' or v_recent_notes ~ '(decision maker|decision-maker|spoke (with|to) the owner|owner reached)' then
    v_score := v_score + 20;
    v_reasons := array_append(v_reasons, 'Decision-maker reached');
  end if;

  if v_lead.status = 'Information requested' or v_recent_notes ~ '(pricing|price quote|requested (more )?information|asked for (info|information)|send (more )?info|more details)' then
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Requested pricing or information');
  end if;

  if v_lead.status = 'Callback requested' or v_recent_notes ~ '(call (me |him |her |them )?back|callback requested|requested a callback)' then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'Requested a callback');
  end if;

  if v_recent_notes ~ '(sounds good|wants to (move forward|proceed)|very interested|great call|promising|positive (call|note|response)|excited about)' then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'Positive agent note on file');
  end if;

  if v_pending_followup and v_lead.next_follow_up_at is not null and v_lead.next_follow_up_at > v_now then
    v_score := v_score + 20;
    v_reasons := array_append(v_reasons, 'Follow-up scheduled for ' || to_char(v_lead.next_follow_up_at, 'Mon DD, YYYY HH24:MI'));
  end if;

  if coalesce(v_appointment_upcoming, false) or v_lead.status = 'Appointment booked' then
    v_score := v_score + 25;
    v_reasons := array_append(v_reasons, 'Appointment booked');
  elsif v_lead.status = 'Interested' then
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Showed interest but has not booked an appointment yet');
  end if;

  if v_lead.status = 'Consultation Information Sent' then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'Consultation information sent, awaiting response');
  end if;

  if v_lead.last_contacted_at is not null then
    if v_lead.last_contacted_at > v_now - interval '7 days' then
      v_score := v_score + 10;
      v_reasons := array_append(v_reasons, 'Contacted within the last 7 days');
    elsif v_lead.last_contacted_at > v_now - interval '30 days' then
      v_score := v_score + 5;
      v_reasons := array_append(v_reasons, 'Contacted within the last 30 days');
    end if;
  end if;

  if v_activity_count >= 3 then
    v_score := v_score + 5;
    v_reasons := array_append(v_reasons, v_activity_count || ' touchpoints logged');
  end if;

  if v_email_engaged then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'Opened or clicked a tracked email');
  end if;

  v_score := least(v_score, 100);

  if v_force_closed then
    v_category := 'closed';
  elsif v_score >= 70 then
    v_category := 'high';
  elsif v_score >= 40 then
    v_category := 'medium';
  else
    v_category := 'low';
  end if;

  if array_length(v_reasons, 1) is null then
    v_reasons := array_append(v_reasons, 'No significant activity recorded yet');
  end if;

  if v_force_closed then
    v_recommended := 'No further action needed - this lead is closed.';
  elsif v_lead.next_follow_up_at is not null and v_lead.next_follow_up_at < v_now then
    v_recommended := 'Call now - the scheduled follow-up is overdue.';
  elsif coalesce(v_appointment_upcoming, false) then
    v_recommended := 'Confirm the upcoming appointment.';
  elsif v_lead.next_follow_up_at is not null then
    v_recommended := 'Follow up as scheduled on ' || to_char(v_lead.next_follow_up_at, 'Mon DD, YYYY HH24:MI') || '.';
  elsif v_activity_count = 0 then
    v_recommended := 'Make the first contact call.';
  elsif v_lead.status = 'Interested' then
    v_recommended := 'Send pricing/information and schedule a follow-up.';
  else
    v_recommended := 'Reach out with a follow-up call or email to re-engage.';
  end if;

  perform set_config('app.leadgen_score_engine', 'true', true);

  insert into public.leadgen_opportunity_scores as s (
    lead_id, score, category, reasons, recommended_action, signals, last_scored_at, updated_at
  ) values (
    p_lead_id, v_score, v_category, to_jsonb(v_reasons), v_recommended,
    jsonb_build_object(
      'activity_count', v_activity_count,
      'call_count', v_call_count,
      'last_call_at', v_last_call_at,
      'last_email_activity_at', v_last_email_activity_at,
      'last_note_at', v_last_note_at,
      'pending_followup', v_pending_followup,
      'appointment_upcoming', coalesce(v_appointment_upcoming, false),
      'appointment_completed', coalesce(v_appointment_completed, false),
      'email_engaged', v_email_engaged,
      'status', v_lead.status
    ),
    v_now, v_now
  )
  on conflict (lead_id) do update
  set score = excluded.score,
      category = excluded.category,
      reasons = excluded.reasons,
      recommended_action = excluded.recommended_action,
      signals = excluded.signals,
      last_scored_at = excluded.last_scored_at,
      updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.leadgen_recompute_opportunity_score(uuid) from public, anon, authenticated;

create or replace function public.leadgen_opportunity_scores_from_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.lead_id, old.lead_id);
  if target_id is not null then
    perform public.leadgen_recompute_opportunity_score(target_id);
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.leadgen_opportunity_scores_from_activity() from public, anon, authenticated;

drop trigger if exists leadgen_opportunity_scores_activities_trigger on public.leadgen_lead_activities;
create trigger leadgen_opportunity_scores_activities_trigger
  after insert or update or delete on public.leadgen_lead_activities
  for each row
  execute function public.leadgen_opportunity_scores_from_activity();

drop trigger if exists leadgen_opportunity_scores_followups_trigger on public.leadgen_followups;
create trigger leadgen_opportunity_scores_followups_trigger
  after insert or update or delete on public.leadgen_followups
  for each row
  execute function public.leadgen_opportunity_scores_from_activity();

drop trigger if exists leadgen_opportunity_scores_appointments_trigger on public.leadgen_appointments;
create trigger leadgen_opportunity_scores_appointments_trigger
  after insert or update or delete on public.leadgen_appointments
  for each row
  execute function public.leadgen_opportunity_scores_from_activity();

drop trigger if exists leadgen_opportunity_scores_emails_trigger on public.leadgen_emails;
create trigger leadgen_opportunity_scores_emails_trigger
  after insert or update on public.leadgen_emails
  for each row
  execute function public.leadgen_opportunity_scores_from_activity();

create or replace function public.leadgen_opportunity_scores_from_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.leadgen_recompute_opportunity_score(new.id);
  return new;
end;
$$;

revoke execute on function public.leadgen_opportunity_scores_from_lead() from public, anon, authenticated;

drop trigger if exists leadgen_opportunity_scores_lead_trigger on public.leadgen_leads;
create trigger leadgen_opportunity_scores_lead_trigger
  after insert or update of status, last_contacted_at, next_follow_up_at, notes
  on public.leadgen_leads
  for each row
  execute function public.leadgen_opportunity_scores_from_lead();

-- Backfill: score every lead that already exists today.
do $$
declare rec record;
begin
  for rec in select id from public.leadgen_leads loop
    perform public.leadgen_recompute_opportunity_score(rec.id);
  end loop;
end;
$$;
