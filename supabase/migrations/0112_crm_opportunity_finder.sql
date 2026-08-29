-- Opportunity Finder (Growth CRM): scores every existing crm_opportunities
-- row (0-100) from real activity already on file - crm_activities,
-- crm_followups, winsalot_appointments, crm_lead_emails - and classifies it
-- High/Medium/Low/Closed. This never reads or writes anything outside the
-- CRM's own data (no external scraping/enrichment) and never touches an
-- agent's own notes/activity rows; the score, the AI-generated reasons, and
-- the recommended action all live in this new table only.
--
-- Table name is deliberately `crm_opportunity_scores`, not
-- "crm_opportunities_*", to avoid any confusion with the existing
-- crm_opportunities table (migration 0080) - that table already *is* this
-- CRM's lead pipeline; this one is the Opportunity Finder's own scoring
-- layer on top of it, one row per opportunity.
create table if not exists public.crm_opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  opportunity_id uuid not null unique references public.crm_opportunities(id) on delete cascade,

  score integer not null default 0 check (score between 0 and 100),
  category text not null default 'low' check (category in ('high', 'medium', 'low', 'closed')),
  -- Admin manual override (brief: "manually change priority") - when set,
  -- takes precedence over the computed `category` for display/filtering,
  -- but is never cleared by a recompute; only an admin clears it.
  priority_override text check (priority_override in ('high', 'medium', 'low')),

  -- The AI-generated explanation, stored separately from the agent's own
  -- notes (crm_opportunities.notes / crm_activities.notes) per the brief -
  -- recompute overwrites these, never anything on the source records.
  reasons jsonb not null default '[]'::jsonb,
  recommended_action text not null default '',
  -- Raw signal snapshot backing the score, for admin/debug transparency.
  signals jsonb not null default '{}'::jsonb,

  -- Agent-only workflow marker (brief: "mark the opportunity as Contacted,
  -- Follow-Up, Interested, Appointment Booked, or Closed") - independent of
  -- the underlying opportunity's own `stage` field entirely.
  agent_status text not null default 'new' check (agent_status in (
    'new', 'contacted', 'follow_up', 'interested', 'appointment_booked', 'closed'
  )),

  -- Admin dismiss/reopen (brief: "dismiss/close an opportunity" / "reopen
  -- it") - independent of the underlying opportunity's own stage/closed
  -- state; dismissing here never touches crm_opportunities.
  finder_state text not null default 'active' check (finder_state in ('active', 'dismissed')),
  dismissed_at timestamptz,
  dismissed_by uuid references public.crm_users(id) on delete set null,
  dismissed_reason text,
  reopened_at timestamptz,

  last_scored_at timestamptz not null default now()
);

create index if not exists crm_opportunity_scores_category_idx on public.crm_opportunity_scores(category);
create index if not exists crm_opportunity_scores_finder_state_idx on public.crm_opportunity_scores(finder_state);
create index if not exists crm_opportunity_scores_agent_status_idx on public.crm_opportunity_scores(agent_status);

alter table public.crm_opportunity_scores enable row level security;

create policy "crm_opportunity_scores_admin_all"
  on public.crm_opportunity_scores for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Agents may only ever see a score for an opportunity assigned to them -
-- "opportunities generated from leads they personally worked" in practice
-- means opportunities currently assigned to them, the same scoping every
-- other agent-facing view in this CRM already uses.
create policy "crm_opportunity_scores_agent_select_own"
  on public.crm_opportunity_scores for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_opportunities o
      where o.id = opportunity_id and o.assigned_agent_id = auth.uid()
    )
  );

create policy "crm_opportunity_scores_agent_update_own"
  on public.crm_opportunity_scores for update
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_opportunities o
      where o.id = opportunity_id and o.assigned_agent_id = auth.uid()
    )
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_opportunities o
      where o.id = opportunity_id and o.assigned_agent_id = auth.uid()
    )
  );

-- Column-level lock: an agent's update policy above still permits changing
-- any column on a row they can see, so this trigger is what actually
-- restricts an agent to `agent_status` only (brief: "Agents must NOT be
-- able to assign an opportunity to another agent" or otherwise touch the
-- score/priority/dismiss state). The scoring engine itself needs to update
-- every other column though, including for a row whose assigned agent
-- triggered the recompute (e.g. by logging a call) - it flags its own
-- writes via a transaction-local GUC so this trigger can tell the two
-- apart, same "trusted internal writer" technique used nowhere else yet in
-- this codebase but standard Postgres practice for this exact problem.
create or replace function public.crm_opportunity_scores_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.crm_score_engine', true), '') = 'true' then
    new.updated_at := now();
    return new;
  end if;

  if public.crm_user_role(auth.uid()) = 'agent' then
    if new.opportunity_id is distinct from old.opportunity_id
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

revoke execute on function public.crm_opportunity_scores_before_update() from public, anon, authenticated;

drop trigger if exists crm_opportunity_scores_before_update_trigger on public.crm_opportunity_scores;

create trigger crm_opportunity_scores_before_update_trigger
  before update on public.crm_opportunity_scores
  for each row
  execute function public.crm_opportunity_scores_before_update();

-- ---------------------------------------------------------------------
-- The scoring engine itself. Reads only activity already on file for this
-- one opportunity (calls/emails/notes/outcomes in crm_activities, pending
-- callbacks in crm_followups, consultation bookings in
-- winsalot_appointments, tracked email opens/clicks in crm_lead_emails,
-- and the opportunity's own stage/contact/follow-up fields) - nothing
-- external is ever fetched or considered.
-- ---------------------------------------------------------------------
create or replace function public.crm_recompute_opportunity_score(p_opportunity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp record;
  v_recent_notes text;
  v_activity_count integer;
  v_call_count integer;
  v_last_call_at timestamptz;
  v_last_email_activity_at timestamptz;
  v_last_note_at timestamptz;
  v_pending_followup boolean;
  v_appointment_start timestamptz;
  v_appointment_upcoming boolean;
  v_email_engaged boolean;
  v_score integer := 0;
  v_reasons text[] := '{}';
  v_category text;
  v_force_closed boolean := false;
  v_recommended text;
  v_now timestamptz := now();
begin
  select * into v_opp from public.crm_opportunities where id = p_opportunity_id;
  if not found then
    delete from public.crm_opportunity_scores where opportunity_id = p_opportunity_id;
    return;
  end if;

  select
    count(*),
    count(*) filter (where activity_type = 'call'),
    max(occurred_at) filter (where activity_type = 'call'),
    max(occurred_at) filter (where activity_type in ('email', 'consultation_booked')),
    max(occurred_at) filter (where activity_type = 'note')
  into v_activity_count, v_call_count, v_last_call_at, v_last_email_activity_at, v_last_note_at
  from public.crm_activities
  where opportunity_id = p_opportunity_id;

  select string_agg(notes, ' | ')
  into v_recent_notes
  from (
    select notes from public.crm_activities
    where opportunity_id = p_opportunity_id and notes is not null
    order by occurred_at desc
    limit 8
  ) recent;

  v_recent_notes := lower(coalesce(v_recent_notes, '') || ' ' || coalesce(v_opp.notes, '') || ' ' || coalesce(v_opp.closed_reason, ''));

  select exists(
    select 1 from public.crm_followups
    where opportunity_id = p_opportunity_id and status = 'pending'
  ) into v_pending_followup;

  select appointment_start_at into v_appointment_start
  from public.winsalot_appointments
  where opportunity_id = p_opportunity_id and status = 'booked'
  order by appointment_start_at desc
  limit 1;
  v_appointment_upcoming := v_appointment_start is not null and v_appointment_start > v_now;

  select exists(
    select 1 from public.crm_lead_emails
    where opportunity_id = p_opportunity_id and status in ('opened', 'clicked')
  ) into v_email_engaged;

  -- Disqualifying signals force the Closed / Not Opportunity bucket
  -- regardless of score - explicit stage first, then a keyword safety net
  -- over recent notes for signals this CRM's stage list can't express
  -- directly (wrong number, duplicate, bad business info, do-not-contact).
  if v_opp.stage = 'Not Interested' then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Marked Not Interested' || case when v_opp.closed_reason is not null then ': ' || v_opp.closed_reason else '' end);
  elsif v_opp.stage = 'Client Won' then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Closed - Client Won');
  elsif v_recent_notes ~ '(wrong number|duplicate (lead|entry|business)|bad (number|business|info)|invalid number|no longer in business|out of business|do not call|don''t call|remove me from|no further contact|not interested)' then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Recent notes indicate this lead should not be contacted further');
  end if;

  if v_recent_notes ~ '(decision maker|decision-maker|spoke (with|to) the owner|owner reached|spoke with owner)' then
    v_score := v_score + 20;
    v_reasons := array_append(v_reasons, 'Decision-maker reached');
  end if;

  if v_recent_notes ~ '(pricing|price quote|requested (more )?information|asked for (info|information)|send (more )?info|more details)' or v_opp.stage = 'Interested' then
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Requested pricing or information');
  end if;

  if v_recent_notes ~ '(call (me |him |her |them )?back|callback requested|requested a callback)' then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'Requested a callback');
  end if;

  if v_recent_notes ~ '(sounds good|wants to (move forward|proceed)|very interested|great call|promising|positive (call|note|response)|excited about)' then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'Positive agent note on file');
  end if;

  if v_pending_followup and v_opp.next_follow_up_at is not null and v_opp.next_follow_up_at > v_now then
    v_score := v_score + 20;
    v_reasons := array_append(v_reasons, 'Follow-up scheduled for ' || to_char(v_opp.next_follow_up_at, 'Mon DD, YYYY HH24:MI'));
  end if;

  if v_appointment_upcoming or v_opp.stage = 'Consultation Booked' then
    v_score := v_score + 25;
    v_reasons := array_append(v_reasons, 'Consultation appointment booked');
  elsif v_opp.stage = 'Interested' then
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Showed interest but has not booked an appointment yet');
  end if;

  if v_opp.stage = 'Proposal or Application Sent' then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'Proposal or application already sent');
  end if;

  if v_opp.last_contacted_at is not null then
    if v_opp.last_contacted_at > v_now - interval '7 days' then
      v_score := v_score + 10;
      v_reasons := array_append(v_reasons, 'Contacted within the last 7 days');
    elsif v_opp.last_contacted_at > v_now - interval '30 days' then
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
    v_recommended := 'No further action needed - this opportunity is closed.';
  elsif v_opp.next_follow_up_at is not null and v_opp.next_follow_up_at < v_now then
    v_recommended := 'Call now - the scheduled follow-up is overdue.';
  elsif v_appointment_upcoming then
    v_recommended := 'Confirm the upcoming consultation appointment.';
  elsif v_opp.next_follow_up_at is not null then
    v_recommended := 'Follow up as scheduled on ' || to_char(v_opp.next_follow_up_at, 'Mon DD, YYYY HH24:MI') || '.';
  elsif v_activity_count = 0 then
    v_recommended := 'Make the first contact call.';
  elsif v_opp.stage = 'Interested' then
    v_recommended := 'Send pricing/information and schedule a follow-up.';
  else
    v_recommended := 'Reach out with a follow-up call or email to re-engage.';
  end if;

  perform set_config('app.crm_score_engine', 'true', true);

  insert into public.crm_opportunity_scores as s (
    opportunity_id, score, category, reasons, recommended_action, signals, last_scored_at, updated_at
  ) values (
    p_opportunity_id, v_score, v_category, to_jsonb(v_reasons), v_recommended,
    jsonb_build_object(
      'activity_count', v_activity_count,
      'call_count', v_call_count,
      'last_call_at', v_last_call_at,
      'last_email_activity_at', v_last_email_activity_at,
      'last_note_at', v_last_note_at,
      'pending_followup', v_pending_followup,
      'appointment_upcoming', v_appointment_upcoming,
      'email_engaged', v_email_engaged,
      'stage', v_opp.stage
    ),
    v_now, v_now
  )
  on conflict (opportunity_id) do update
  set score = excluded.score,
      category = excluded.category,
      reasons = excluded.reasons,
      recommended_action = excluded.recommended_action,
      signals = excluded.signals,
      last_scored_at = excluded.last_scored_at,
      updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.crm_recompute_opportunity_score(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Automatic recalculation triggers - one per data source the brief lists
-- (calls/emails/notes via crm_activities, follow-ups via crm_followups,
-- status changes via crm_opportunities, appointments via
-- winsalot_appointments, email engagement via crm_lead_emails). Each is a
-- thin AFTER trigger that just calls the engine above for the affected
-- opportunity - no application code anywhere needs to know this exists.
-- ---------------------------------------------------------------------
create or replace function public.crm_opportunity_scores_from_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.opportunity_id, old.opportunity_id);
  if target_id is not null then
    perform public.crm_recompute_opportunity_score(target_id);
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.crm_opportunity_scores_from_activity() from public, anon, authenticated;

drop trigger if exists crm_opportunity_scores_activities_trigger on public.crm_activities;
create trigger crm_opportunity_scores_activities_trigger
  after insert or update or delete on public.crm_activities
  for each row
  execute function public.crm_opportunity_scores_from_activity();

drop trigger if exists crm_opportunity_scores_followups_trigger on public.crm_followups;
create trigger crm_opportunity_scores_followups_trigger
  after insert or update or delete on public.crm_followups
  for each row
  execute function public.crm_opportunity_scores_from_activity();

drop trigger if exists crm_opportunity_scores_appointments_trigger on public.winsalot_appointments;
create trigger crm_opportunity_scores_appointments_trigger
  after insert or update or delete on public.winsalot_appointments
  for each row
  execute function public.crm_opportunity_scores_from_activity();

drop trigger if exists crm_opportunity_scores_emails_trigger on public.crm_lead_emails;
create trigger crm_opportunity_scores_emails_trigger
  after insert or update on public.crm_lead_emails
  for each row
  execute function public.crm_opportunity_scores_from_activity();

create or replace function public.crm_opportunity_scores_from_opportunity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crm_recompute_opportunity_score(new.id);
  return new;
end;
$$;

revoke execute on function public.crm_opportunity_scores_from_opportunity() from public, anon, authenticated;

drop trigger if exists crm_opportunity_scores_opportunity_trigger on public.crm_opportunities;
create trigger crm_opportunity_scores_opportunity_trigger
  after insert or update of stage, last_contacted_at, next_follow_up_at, closed_reason, notes
  on public.crm_opportunities
  for each row
  execute function public.crm_opportunity_scores_from_opportunity();

-- Backfill: score every opportunity that already exists today.
do $$
declare rec record;
begin
  for rec in select id from public.crm_opportunities loop
    perform public.crm_recompute_opportunity_score(rec.id);
  end loop;
end;
$$;
