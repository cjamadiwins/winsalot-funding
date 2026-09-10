-- Smart Opportunities dashboard upgrade for both CRMs.
--
-- Reuses the existing score tables, RLS policies, trigger architecture,
-- and CRM-specific source tables. The only new stored value is handled_on,
-- which is genuine workflow state (not duplicated score data). Scores and
-- explanations continue to be recalculated automatically by the triggers
-- installed in migrations 0112/0113 whenever source activity changes.

alter table public.crm_opportunity_scores
  add column if not exists handled_on date;

alter table public.leadgen_opportunity_scores
  add column if not exists handled_on date;

create index if not exists crm_opportunity_scores_active_score_idx
  on public.crm_opportunity_scores (score desc)
  where finder_state = 'active';

create index if not exists leadgen_opportunity_scores_active_score_idx
  on public.leadgen_opportunity_scores (score desc)
  where finder_state = 'active';

-- Preserve the existing agent_status permission and additionally allow an
-- agent to mark an assigned opportunity handled for the current Toronto
-- business day. Every other computed/admin field remains protected.
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
      raise exception 'Agents may only update their own opportunity status or daily handled marker.';
    end if;
    if new.handled_on is distinct from old.handled_on
      and new.handled_on is distinct from timezone('America/Toronto', now())::date
    then
      raise exception 'An opportunity can only be marked handled for the current business day.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

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
      raise exception 'Agents may only update their own opportunity status or daily handled marker.';
    end if;
    if new.handled_on is distinct from old.handled_on
      and new.handled_on is distinct from timezone('America/Toronto', now())::date
    then
      raise exception 'An opportunity can only be marked handled for the current business day.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.crm_opportunity_scores_before_update() from public, anon, authenticated;
revoke execute on function public.leadgen_opportunity_scores_before_update() from public, anon, authenticated;

-- Growth CRM: Winsalot Corp.'s own sales opportunities only.
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
  v_last_call_outcome text;
  v_last_note_summary text;
  v_pending_followup boolean;
  v_followup_due_today boolean;
  v_followup_overdue boolean;
  v_appointment_start timestamptz;
  v_appointment_upcoming boolean;
  v_appointment_booked_any boolean;
  v_email_engaged boolean;
  v_decision_maker boolean;
  v_information_requested boolean;
  v_callback_requested boolean;
  v_positive_note boolean;
  v_appointment_discussed boolean;
  v_meaningful_conversations boolean;
  v_repeated_no_answer boolean;
  v_score integer := 0;
  v_reasons text[] := '{}';
  v_category text;
  v_force_closed boolean := false;
  v_hot_signal boolean;
  v_warm_signal boolean;
  v_followup_due boolean;
  v_retry_signal boolean;
  v_recommended text;
  v_now timestamptz := now();
  v_today date := timezone('America/Toronto', now())::date;
begin
  select * into v_opp from public.crm_opportunities where id = p_opportunity_id;
  if not found then
    delete from public.crm_opportunity_scores where opportunity_id = p_opportunity_id;
    return;
  end if;

  select count(*), count(*) filter (where activity_type = 'call'),
    max(occurred_at) filter (where activity_type = 'call'),
    max(occurred_at) filter (where activity_type in ('email', 'consultation_booked')),
    max(occurred_at) filter (where activity_type = 'note')
  into v_activity_count, v_call_count, v_last_call_at, v_last_email_activity_at, v_last_note_at
  from public.crm_activities where opportunity_id = p_opportunity_id;

  select call_outcome, left(notes, 220) into v_last_call_outcome, v_last_note_summary
  from public.crm_activities
  where opportunity_id = p_opportunity_id and activity_type = 'call'
  order by occurred_at desc limit 1;

  if v_last_note_summary is null then
    select left(notes, 220) into v_last_note_summary from public.crm_activities
    where opportunity_id = p_opportunity_id and notes is not null order by occurred_at desc limit 1;
  end if;
  -- Growth CRM's current call form stores its outcome in the call note;
  -- newer/legacy rows may also have the optional first-class call_outcome.
  v_last_call_outcome := coalesce(v_last_call_outcome, left(v_last_note_summary, 100));

  select string_agg(notes, ' | ') into v_recent_notes
  from (select notes from public.crm_activities where opportunity_id = p_opportunity_id and notes is not null order by occurred_at desc limit 8) recent;
  v_recent_notes := lower(coalesce(v_recent_notes, '') || ' ' || coalesce(v_opp.notes, '') || ' ' || coalesce(v_opp.closed_reason, ''));

  select exists(select 1 from public.crm_followups where opportunity_id = p_opportunity_id and status = 'pending') into v_pending_followup;
  v_followup_due_today := v_pending_followup and v_opp.next_follow_up_at is not null and (v_opp.next_follow_up_at at time zone 'America/Toronto')::date = v_today;
  v_followup_overdue := v_pending_followup and v_opp.next_follow_up_at is not null and (v_opp.next_follow_up_at at time zone 'America/Toronto')::date < v_today;

  select appointment_start_at into v_appointment_start
  from public.winsalot_appointments where opportunity_id = p_opportunity_id and status = 'booked'
  order by appointment_start_at desc limit 1;
  v_appointment_upcoming := v_appointment_start is not null and v_appointment_start > v_now;
  v_appointment_booked_any := v_appointment_start is not null;

  select exists(select 1 from public.crm_lead_emails where opportunity_id = p_opportunity_id and status in ('opened', 'clicked')) into v_email_engaged;

  v_decision_maker := v_recent_notes ~ '(decision maker|decision-maker|spoke (with|to) the owner|owner reached|talk(ed)? to the owner|speak (with|to) the owner)';
  v_information_requested := v_recent_notes ~ '(pricing|price quote|requested (more )?information|asked for (info|information|pricing|a quote|details)|send (more )?info|more details)';
  v_callback_requested := v_recent_notes ~ '(call (me |him |her |them )?back|callback requested|requested a callback)';
  v_positive_note := v_recent_notes ~ '(sounds good|wants to (move forward|proceed|sign up|get started)|ready to (move forward|sign|start)|very interested|great call|promising|positive (call|note|response)|excited about)';
  v_appointment_discussed := not v_appointment_booked_any and v_recent_notes ~ '(appointment discussed|discussed (an |the )?appointment|ready to book|book (a |the )?(call|appointment|consultation)|schedule (a |the )?(call|appointment|consultation))';
  v_meaningful_conversations := v_call_count >= 2 and (v_decision_maker or v_information_requested or v_callback_requested or v_positive_note);
  v_repeated_no_answer := v_call_count >= 3 and not (v_decision_maker or v_information_requested or v_callback_requested or v_positive_note) and v_recent_notes ~ '(no answer|voicemail|gatekeeper|could not reach|couldn''t reach)';

  if v_opp.stage = 'Not Interested' or v_opp.stage = 'Client Won' then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, case when v_opp.stage = 'Client Won' then 'Closed - Client Won' else 'Marked Not Interested' end);
  elsif v_appointment_booked_any and not v_pending_followup then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Appointment already booked - no further Opportunity Finder action needed');
  elsif v_recent_notes ~ '(wrong number|duplicate (lead|entry|business)|bad (number|business|info)|invalid number|no longer in business|out of business|do not call|don''t call|remove me from|no further contact|not interested)' then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Recent notes indicate this prospect should not be contacted further');
  end if;

  if v_opp.stage = 'Interested' then v_score := v_score + 30; v_reasons := array_append(v_reasons, 'Interested lead (+30)'); end if;
  if v_callback_requested then v_score := v_score + 25; v_reasons := array_append(v_reasons, 'Callback requested (+25)'); end if;
  if v_decision_maker then v_score := v_score + 15; v_reasons := array_append(v_reasons, 'Decision-maker reached (+15)'); end if;
  if v_positive_note then v_score := v_score + 15; v_reasons := array_append(v_reasons, 'Positive call notes (+15)'); end if;
  if v_information_requested then v_score := v_score + 15; v_reasons := array_append(v_reasons, 'Requested pricing or information (+15)'); end if;
  if v_followup_due_today then v_score := v_score + 15; v_reasons := array_append(v_reasons, 'Follow-up due today (+15)');
  elsif v_followup_overdue then v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Follow-up overdue (+10)'); end if;
  if v_appointment_discussed then v_score := v_score + 20; v_reasons := array_append(v_reasons, 'Appointment discussed but not booked (+20)'); end if;
  if v_opp.last_contacted_at > v_now - interval '7 days' then v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Recent contact within 7 days (+10)'); end if;
  if v_meaningful_conversations then v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Multiple meaningful conversations (+10)'); end if;
  if v_email_engaged then v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Tracked email opened or clicked (+10)'); end if;
  if v_opp.stage = 'Proposal or Application Sent' then v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Proposal or application sent (+10)'); end if;
  if v_appointment_booked_any and v_pending_followup then v_score := v_score - 20; v_reasons := array_append(v_reasons, 'Appointment already booked (-20)'); end if;
  if v_repeated_no_answer then v_score := v_score - 15; v_reasons := array_append(v_reasons, 'Repeated no answer without engagement (-15)'); end if;
  if coalesce(v_opp.last_contacted_at, v_opp.created_at) < v_now - interval '60 days' then v_score := v_score - 15; v_reasons := array_append(v_reasons, 'Inactive for more than 60 days (-15)');
  elsif coalesce(v_opp.last_contacted_at, v_opp.created_at) < v_now - interval '30 days' then v_score := v_score - 8; v_reasons := array_append(v_reasons, 'Inactive for more than 30 days (-8)'); end if;

  v_hot_signal := v_opp.stage = 'Interested' or v_information_requested or v_positive_note or v_appointment_discussed;
  v_warm_signal := v_callback_requested or v_decision_maker or (v_pending_followup and not v_followup_due_today and not v_followup_overdue);
  v_followup_due := v_opp.stage = 'Follow-Up Required' or v_followup_due_today or v_followup_overdue;
  v_retry_signal := v_recent_notes ~ '(no answer|voicemail|gatekeeper|couldn''t reach|could not reach|not available)';

  if v_force_closed then v_score := 0; v_category := 'closed';
  elsif v_hot_signal then v_category := 'hot';
  elsif v_warm_signal then v_category := 'warm';
  elsif v_followup_due then v_category := 'follow_up';
  else v_category := 'retry'; end if;
  v_score := greatest(0, least(v_score, 100));

  if array_length(v_reasons, 1) is null then v_reasons := array_append(v_reasons, 'No significant activity recorded yet'); end if;

  if v_force_closed then v_recommended := 'Review Notes';
  elsif v_followup_due_today or v_followup_overdue then v_recommended := 'Call Today';
  elsif v_appointment_discussed or v_opp.stage = 'Interested' then v_recommended := 'Book Appointment';
  elsif v_pending_followup then v_recommended := 'Follow Up';
  elsif v_email_engaged or v_information_requested then v_recommended := 'Send Email';
  elsif v_retry_signal or v_activity_count = 0 then v_recommended := 'Call Today';
  else v_recommended := 'Review Notes'; end if;

  perform set_config('app.crm_score_engine', 'true', true);
  insert into public.crm_opportunity_scores as s (opportunity_id, score, category, reasons, recommended_action, signals, last_scored_at, updated_at)
  values (p_opportunity_id, v_score, v_category, to_jsonb(v_reasons), v_recommended,
    jsonb_build_object('activity_count', v_activity_count, 'call_count', v_call_count, 'last_call_at', v_last_call_at,
      'last_email_activity_at', v_last_email_activity_at, 'last_note_at', v_last_note_at,
      'last_call_outcome', v_last_call_outcome, 'last_note_summary', v_last_note_summary,
      'pending_followup', v_pending_followup, 'followup_due_today', v_followup_due_today,
      'followup_overdue', v_followup_overdue, 'appointment_upcoming', v_appointment_upcoming,
      'appointment_booked', v_appointment_booked_any, 'email_engaged', v_email_engaged, 'stage', v_opp.stage), v_now, v_now)
  on conflict (opportunity_id) do update set score = excluded.score, category = excluded.category,
    reasons = excluded.reasons, recommended_action = excluded.recommended_action, signals = excluded.signals,
    last_scored_at = excluded.last_scored_at, updated_at = excluded.updated_at;
end;
$$;

-- Lead Generation CRM: client/campaign leads only. No Growth CRM table is
-- referenced here, preserving the existing data and permission boundary.
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
  v_last_call_outcome text;
  v_last_note_summary text;
  v_pending_followup boolean;
  v_followup_due_today boolean;
  v_followup_overdue boolean;
  v_appointment_upcoming boolean;
  v_appointment_booked_any boolean;
  v_appointment_completed boolean;
  v_email_engaged boolean;
  v_decision_maker boolean;
  v_information_requested boolean;
  v_callback_requested boolean;
  v_positive_note boolean;
  v_appointment_discussed boolean;
  v_meaningful_conversations boolean;
  v_repeated_no_answer boolean;
  v_score integer := 0;
  v_reasons text[] := '{}';
  v_category text;
  v_force_closed boolean := false;
  v_hot_signal boolean;
  v_warm_signal boolean;
  v_followup_due boolean;
  v_retry_signal boolean;
  v_recommended text;
  v_now timestamptz := now();
  v_today date := timezone('America/Toronto', now())::date;
begin
  select * into v_lead from public.leadgen_leads where id = p_lead_id;
  if not found then delete from public.leadgen_opportunity_scores where lead_id = p_lead_id; return; end if;

  select count(*), count(*) filter (where activity_type = 'call'),
    max(occurred_at) filter (where activity_type = 'call'),
    max(occurred_at) filter (where activity_type like 'consultation%' or activity_type = 'email'),
    max(occurred_at) filter (where activity_type = 'note')
  into v_activity_count, v_call_count, v_last_call_at, v_last_email_activity_at, v_last_note_at
  from public.leadgen_lead_activities where lead_id = p_lead_id;

  select call_outcome, left(notes, 220) into v_last_call_outcome, v_last_note_summary
  from public.leadgen_lead_activities
  where lead_id = p_lead_id and activity_type = 'call'
  order by occurred_at desc limit 1;

  if v_last_note_summary is null then
    select left(notes, 220) into v_last_note_summary from public.leadgen_lead_activities
    where lead_id = p_lead_id and notes is not null order by occurred_at desc limit 1;
  end if;

  select string_agg(notes, ' | ') into v_recent_notes
  from (select notes from public.leadgen_lead_activities where lead_id = p_lead_id and notes is not null order by occurred_at desc limit 8) recent;
  v_recent_notes := lower(coalesce(v_recent_notes, '') || ' ' || coalesce(v_lead.notes, ''));

  select exists(select 1 from public.leadgen_followups where lead_id = p_lead_id and status = 'pending') into v_pending_followup;
  v_followup_due_today := v_pending_followup and v_lead.next_follow_up_at is not null and (v_lead.next_follow_up_at at time zone 'America/Toronto')::date = v_today;
  v_followup_overdue := v_pending_followup and v_lead.next_follow_up_at is not null and (v_lead.next_follow_up_at at time zone 'America/Toronto')::date < v_today;

  select bool_or(status in ('Booked', 'Confirmed') and appointment_date >= v_today),
    bool_or(status in ('Booked', 'Confirmed')), bool_or(status = 'Completed')
  into v_appointment_upcoming, v_appointment_booked_any, v_appointment_completed
  from public.leadgen_appointments where lead_id = p_lead_id;

  select exists(select 1 from public.leadgen_emails where lead_id = p_lead_id and status in ('opened', 'clicked')) into v_email_engaged;

  v_decision_maker := v_lead.status = 'Owner reached' or v_recent_notes ~ '(decision maker|decision-maker|spoke (with|to) the owner|owner reached)';
  v_information_requested := v_lead.status = 'Information requested' or v_recent_notes ~ '(pricing|price quote|requested (more )?information|asked for (info|information|pricing|a quote|details)|send (more )?info|more details)';
  v_callback_requested := v_lead.status = 'Callback requested' or v_recent_notes ~ '(call (me |him |her |them )?back|callback requested|requested a callback)';
  v_positive_note := v_recent_notes ~ '(sounds good|wants to (move forward|proceed|sign up|get started)|ready to (move forward|sign|start)|very interested|great call|promising|positive (call|note|response)|excited about)';
  v_appointment_discussed := not coalesce(v_appointment_booked_any, false) and v_recent_notes ~ '(appointment discussed|discussed (an |the )?appointment|ready to book|book (a |the )?(call|appointment|consultation)|schedule (a |the )?(call|appointment|consultation))';
  v_meaningful_conversations := v_call_count >= 2 and (v_decision_maker or v_information_requested or v_callback_requested or v_positive_note);
  v_repeated_no_answer := v_call_count >= 3 and not (v_decision_maker or v_information_requested or v_callback_requested or v_positive_note)
    and (v_lead.status in ('No answer', 'Voicemail', 'Gatekeeper') or v_recent_notes ~ '(no answer|voicemail|gatekeeper|could not reach|couldn''t reach)');

  if v_lead.status in ('Not interested', 'Wrong number', 'Do not call', 'Closed') then
    v_force_closed := true; v_reasons := array_append(v_reasons, 'Marked "' || v_lead.status || '"');
  elsif coalesce(v_appointment_completed, false) then
    v_force_closed := true; v_reasons := array_append(v_reasons, 'Appointment completed - no further Opportunity Finder action needed');
  elsif coalesce(v_appointment_booked_any, false) and not v_pending_followup then
    v_force_closed := true; v_reasons := array_append(v_reasons, 'Appointment already booked - no further Opportunity Finder action needed');
  elsif v_recent_notes ~ '(wrong number|duplicate (lead|entry|business)|bad (number|business|info)|invalid number|no longer in business|out of business|do not call|don''t call|remove me from|no further contact)' then
    v_force_closed := true; v_reasons := array_append(v_reasons, 'Recent notes indicate this prospect should not be contacted further');
  end if;

  if v_lead.status = 'Interested' then v_score := v_score + 30; v_reasons := array_append(v_reasons, 'Interested lead (+30)'); end if;
  if v_callback_requested then v_score := v_score + 25; v_reasons := array_append(v_reasons, 'Callback requested (+25)'); end if;
  if v_decision_maker then v_score := v_score + 15; v_reasons := array_append(v_reasons, 'Decision-maker reached (+15)'); end if;
  if v_positive_note then v_score := v_score + 15; v_reasons := array_append(v_reasons, 'Positive call notes (+15)'); end if;
  if v_information_requested then v_score := v_score + 15; v_reasons := array_append(v_reasons, 'Requested pricing or information (+15)'); end if;
  if v_followup_due_today then v_score := v_score + 15; v_reasons := array_append(v_reasons, 'Follow-up due today (+15)');
  elsif v_followup_overdue then v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Follow-up overdue (+10)'); end if;
  if v_appointment_discussed then v_score := v_score + 20; v_reasons := array_append(v_reasons, 'Appointment discussed but not booked (+20)'); end if;
  if v_lead.last_contacted_at > v_now - interval '7 days' then v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Recent contact within 7 days (+10)'); end if;
  if v_meaningful_conversations then v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Multiple meaningful conversations (+10)'); end if;
  if v_email_engaged then v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Tracked email opened or clicked (+10)'); end if;
  if v_lead.status = 'Consultation Information Sent' then v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Consultation information sent (+10)'); end if;
  if coalesce(v_appointment_booked_any, false) and v_pending_followup then v_score := v_score - 20; v_reasons := array_append(v_reasons, 'Appointment already booked (-20)'); end if;
  if v_repeated_no_answer then v_score := v_score - 15; v_reasons := array_append(v_reasons, 'Repeated no answer without engagement (-15)'); end if;
  if coalesce(v_lead.last_contacted_at, v_lead.created_at) < v_now - interval '60 days' then v_score := v_score - 15; v_reasons := array_append(v_reasons, 'Inactive for more than 60 days (-15)');
  elsif coalesce(v_lead.last_contacted_at, v_lead.created_at) < v_now - interval '30 days' then v_score := v_score - 8; v_reasons := array_append(v_reasons, 'Inactive for more than 30 days (-8)'); end if;

  v_hot_signal := v_lead.status in ('Interested', 'Information requested') or v_positive_note or v_appointment_discussed;
  v_warm_signal := v_lead.status in ('Owner reached', 'Callback requested') or v_decision_maker or v_callback_requested or (v_pending_followup and not v_followup_due_today and not v_followup_overdue);
  v_followup_due := v_followup_due_today or v_followup_overdue;
  v_retry_signal := v_lead.status in ('No answer', 'Voicemail', 'Gatekeeper') or v_recent_notes ~ '(no answer|voicemail|gatekeeper|couldn''t reach|could not reach|not available)';

  if v_force_closed then v_score := 0; v_category := 'closed';
  elsif v_hot_signal then v_category := 'hot';
  elsif v_warm_signal then v_category := 'warm';
  elsif v_followup_due then v_category := 'follow_up';
  else v_category := 'retry'; end if;
  v_score := greatest(0, least(v_score, 100));

  if array_length(v_reasons, 1) is null then v_reasons := array_append(v_reasons, 'No significant activity recorded yet'); end if;
  if v_force_closed then v_recommended := 'Review Notes';
  elsif v_followup_due_today or v_followup_overdue then v_recommended := 'Call Today';
  elsif v_appointment_discussed or v_lead.status = 'Interested' then v_recommended := 'Book Appointment';
  elsif v_pending_followup then v_recommended := 'Follow Up';
  elsif v_email_engaged or v_information_requested or v_lead.status = 'Consultation Information Sent' then v_recommended := 'Send Email';
  elsif v_retry_signal or v_activity_count = 0 then v_recommended := 'Call Today';
  else v_recommended := 'Review Notes'; end if;

  perform set_config('app.leadgen_score_engine', 'true', true);
  insert into public.leadgen_opportunity_scores as s (lead_id, score, category, reasons, recommended_action, signals, last_scored_at, updated_at)
  values (p_lead_id, v_score, v_category, to_jsonb(v_reasons), v_recommended,
    jsonb_build_object('activity_count', v_activity_count, 'call_count', v_call_count, 'last_call_at', v_last_call_at,
      'last_email_activity_at', v_last_email_activity_at, 'last_note_at', v_last_note_at,
      'last_call_outcome', v_last_call_outcome, 'last_note_summary', v_last_note_summary,
      'pending_followup', v_pending_followup, 'followup_due_today', v_followup_due_today,
      'followup_overdue', v_followup_overdue, 'appointment_upcoming', coalesce(v_appointment_upcoming, false),
      'appointment_booked', coalesce(v_appointment_booked_any, false), 'appointment_completed', coalesce(v_appointment_completed, false),
      'email_engaged', v_email_engaged, 'status', v_lead.status), v_now, v_now)
  on conflict (lead_id) do update set score = excluded.score, category = excluded.category,
    reasons = excluded.reasons, recommended_action = excluded.recommended_action, signals = excluded.signals,
    last_scored_at = excluded.last_scored_at, updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.crm_recompute_opportunity_score(uuid) from public, anon, authenticated;
revoke execute on function public.leadgen_recompute_opportunity_score(uuid) from public, anon, authenticated;

-- Existing trigger names/functions remain unchanged, so this one-time
-- backfill is sufficient to refresh every current prospect under the new
-- weights without altering source lead/opportunity records.
do $$ declare rec record; begin
  for rec in select id from public.crm_opportunities loop perform public.crm_recompute_opportunity_score(rec.id); end loop;
end; $$;

do $$ declare rec record; begin
  for rec in select id from public.leadgen_leads loop perform public.leadgen_recompute_opportunity_score(rec.id); end loop;
end; $$;
