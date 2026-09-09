-- Opportunity Finder upgrade: replace the old score-threshold categories
-- (High/Medium/Low/Closed - migrations 0112/0113) with four rule-based
-- priority categories agents actually asked for: Hot, Warm, Follow-Up, and
-- Retry. This changes classification logic only - the scoring tables
-- themselves (crm_opportunity_scores / leadgen_opportunity_scores), their
-- columns, RLS, and the "trusted internal writer" trigger technique are
-- all reused as-is; nothing new is created.
--
-- Why rule-based instead of score-threshold: the brief is explicit that a
-- prospect must never be ranked Hot purely from call/activity volume -
-- actual interest and buying signals have to carry more weight than
-- activity. A single 0-100 score threshold can't express that (more
-- touchpoints always nudges the score up a little). So `score` stays
-- exactly as before - a 0-100 engagement/likelihood number used for
-- sorting and admin transparency - but `category` is now decided by
-- explicit signal checks in priority order (closed > hot > warm >
-- follow_up > retry), each keyed off real signals already on file: call/
-- lead status, recent call/email/note activity, pending callbacks, and
-- appointment state. Call/activity *volume* only ever contributes a small
-- fixed amount to `score`, never to `category`.
--
-- Hot: explicit interest/buying signals (asked for pricing/info, positive
--   conversation, "Interested" status/stage) - a prospect who might convert.
-- Warm: real but softer progress (callback requested, asked to speak to
--   the owner/decision-maker, reached the decision-maker, not ready to
--   book) - includes a follow-up the agent scheduled for a *future* date.
-- Follow-Up: a scheduled follow-up is due today or overdue, or notes say
--   another contact attempt is needed - a *timing* signal, independent of
--   how the prospect felt about the call.
-- Retry: No Answer / Voicemail / Gatekeeper (or nothing informative yet) -
--   still worth another attempt, but no signal above applied.
--
-- Once an appointment is booked, the record now also drops out of the
-- active Opportunity Finder list entirely (closed) unless a distinct
-- follow-up is still pending - previously an upcoming appointment instead
-- *added* to the score, which could keep a booked prospect showing as an
-- active opportunity indefinitely.

-- ---------------------------------------------------------------------
-- 1. Remap existing category/priority_override values so the stricter
--    check constraints below can be added without violating current rows.
--    The real, rule-based category for every row is then recomputed by
--    the engine rewrite + backfill at the bottom of this migration - this
--    remap only needs to be constraint-valid, not accurate.
-- ---------------------------------------------------------------------
update public.crm_opportunity_scores
set category = case category when 'high' then 'hot' when 'medium' then 'warm' when 'low' then 'retry' else category end;
update public.crm_opportunity_scores
set priority_override = case priority_override when 'high' then 'hot' when 'medium' then 'warm' when 'low' then 'retry' else priority_override end
where priority_override is not null;

update public.leadgen_opportunity_scores
set category = case category when 'high' then 'hot' when 'medium' then 'warm' when 'low' then 'retry' else category end;
update public.leadgen_opportunity_scores
set priority_override = case priority_override when 'high' then 'hot' when 'medium' then 'warm' when 'low' then 'retry' else priority_override end
where priority_override is not null;

alter table public.crm_opportunity_scores drop constraint if exists crm_opportunity_scores_category_check;
alter table public.crm_opportunity_scores
  add constraint crm_opportunity_scores_category_check
  check (category in ('hot', 'warm', 'follow_up', 'retry', 'closed'));

alter table public.crm_opportunity_scores drop constraint if exists crm_opportunity_scores_priority_override_check;
alter table public.crm_opportunity_scores
  add constraint crm_opportunity_scores_priority_override_check
  check (priority_override in ('hot', 'warm', 'follow_up', 'retry'));

alter table public.leadgen_opportunity_scores drop constraint if exists leadgen_opportunity_scores_category_check;
alter table public.leadgen_opportunity_scores
  add constraint leadgen_opportunity_scores_category_check
  check (category in ('hot', 'warm', 'follow_up', 'retry', 'closed'));

alter table public.leadgen_opportunity_scores drop constraint if exists leadgen_opportunity_scores_priority_override_check;
alter table public.leadgen_opportunity_scores
  add constraint leadgen_opportunity_scores_priority_override_check
  check (priority_override in ('hot', 'warm', 'follow_up', 'retry'));

alter table public.crm_opportunity_scores alter column category set default 'retry';
alter table public.leadgen_opportunity_scores alter column category set default 'retry';

-- ---------------------------------------------------------------------
-- 2. Growth CRM scoring engine rewrite.
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
  v_appointment_booked_any boolean;
  v_email_engaged boolean;
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
  v_appointment_booked_any := v_appointment_start is not null;

  select exists(
    select 1 from public.crm_lead_emails
    where opportunity_id = p_opportunity_id and status in ('opened', 'clicked')
  ) into v_email_engaged;

  -- Disqualifying signals force the Closed / Not Opportunity bucket
  -- regardless of score - explicit stage first, then "an appointment is
  -- already booked and nothing else is still outstanding" (brief: "Once an
  -- appointment is booked, the prospect should no longer remain as an
  -- active Opportunity Finder item unless another follow-up is actually
  -- required"), then a keyword safety net over recent notes for signals
  -- this CRM's stage list can't express directly.
  if v_opp.stage = 'Not Interested' then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Marked Not Interested' || case when v_opp.closed_reason is not null then ': ' || v_opp.closed_reason else '' end);
  elsif v_opp.stage = 'Client Won' then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Closed - Client Won');
  elsif v_appointment_booked_any and not v_pending_followup then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Appointment already booked - no further Opportunity Finder action needed');
  elsif v_recent_notes ~ '(wrong number|duplicate (lead|entry|business)|bad (number|business|info)|invalid number|no longer in business|out of business|do not call|don''t call|remove me from|no further contact|not interested)' then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Recent notes indicate this lead should not be contacted further');
  end if;

  -- Signal detail reasons (unchanged from the previous engine) - these
  -- still explain *what happened*; the four-way category bucket below
  -- explains *what to do about it*.
  if v_recent_notes ~ '(decision maker|decision-maker|spoke (with|to) the owner|owner reached|talk(ed)? to the owner|speak (with|to) the owner)' then
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Decision-maker reached or requested');
  end if;

  if v_recent_notes ~ '(pricing|price quote|requested (more )?information|asked for (info|information|pricing|a quote|details)|send (more )?info|more details)' or v_opp.stage = 'Interested' then
    v_score := v_score + 20;
    v_reasons := array_append(v_reasons, 'Requested pricing or information');
  end if;

  if v_recent_notes ~ '(call (me |him |her |them )?back|callback requested|requested a callback)' then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'Requested a callback');
  end if;

  if v_recent_notes ~ '(sounds good|wants to (move forward|proceed|sign up|get started)|ready to (move forward|sign|start)|very interested|great call|promising|positive (call|note|response)|excited about)' then
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Positive agent note on file');
  end if;

  if v_pending_followup and v_opp.next_follow_up_at is not null and v_opp.next_follow_up_at > v_now then
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Follow-up scheduled for ' || to_char(v_opp.next_follow_up_at, 'Mon DD, YYYY HH24:MI'));
  end if;

  if not v_force_closed and (v_appointment_upcoming or v_opp.stage = 'Consultation Booked') then
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

  -- Activity *volume* only ever contributes this one small, capped
  -- amount - it can never be the reason a prospect is Hot.
  if v_activity_count >= 3 then
    v_score := v_score + 5;
    v_reasons := array_append(v_reasons, v_activity_count || ' touchpoints logged');
  end if;

  if v_email_engaged then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'Opened or clicked a tracked email');
  end if;

  v_score := least(v_score, 100);

  -- Four-way priority classification - real interest/buying signals (Hot)
  -- outrank softer progress (Warm), which outranks a due/overdue callback
  -- with no stronger signal (Follow-Up), which outranks a bare retry
  -- (Retry, also the default for a prospect with no informative signal
  -- yet). Evaluated only when not force-closed above.
  v_hot_signal := v_opp.stage = 'Interested'
    or v_recent_notes ~ '(pricing|price quote|requested (more )?information|asked for (info|information|pricing|a quote|details)|send (more )?info|more details|sounds good|wants to (move forward|proceed|sign up|get started)|ready to (move forward|sign|start)|very interested|great call|promising|positive (call|note|response)|excited about)';

  v_warm_signal := v_recent_notes ~ '(decision maker|decision-maker|spoke (with|to) the owner|owner reached|talk(ed)? to the owner|speak (with|to) the owner|call (me |him |her |them )?back|callback requested|requested a callback|contact (me |us )?(on|at) another (date|time|day)|not (the )?right time|needs? to think|thinking it over|not ready (yet|to (book|move forward))|good (call|conversation|chat)|will call back)'
    or (v_pending_followup and v_opp.next_follow_up_at is not null and v_opp.next_follow_up_at::date > v_now::date);

  v_followup_due := v_opp.stage = 'Follow-Up Required'
    or (v_pending_followup and v_opp.next_follow_up_at is not null and v_opp.next_follow_up_at::date <= v_now::date)
    or v_recent_notes ~ '(call (them |him |her )?again|another (contact )?attempt|follow up again|needs? (another|a) follow[- ]?up|try (calling|contacting) again)';

  v_retry_signal := v_recent_notes ~ '(no answer|left (a )?voicemail|voicemail|went to voicemail|gatekeeper|spoke (with|to) (the )?(receptionist|assistant|secretary)|couldn''t reach|could not reach|not available)';

  if v_force_closed then
    v_category := 'closed';
  elsif v_hot_signal then
    v_category := 'hot';
    v_reasons := array_append(v_reasons, 'Hot: prospect has shown real interest and may be ready to convert');
  elsif v_warm_signal then
    v_category := 'warm';
    v_reasons := array_append(v_reasons, 'Warm: meaningful contact made, not yet ready to book');
  elsif v_followup_due then
    v_category := 'follow_up';
    v_reasons := array_append(v_reasons, 'Follow-Up: a scheduled follow-up is due today or overdue');
  elsif v_retry_signal then
    v_category := 'retry';
    v_reasons := array_append(v_reasons, 'Retry: no answer/voicemail/gatekeeper on the last attempt - still worth another try');
  else
    v_category := 'retry';
    v_reasons := array_append(v_reasons, 'Retry: no strong signal yet - worth another attempt');
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
  elsif v_category = 'retry' then
    v_recommended := 'Attempt another call or leave a voicemail to re-engage.';
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
      'appointment_booked', v_appointment_booked_any,
      'email_engaged', v_email_engaged,
      'stage', v_opp.stage,
      'hot_signal', v_hot_signal,
      'warm_signal', v_warm_signal,
      'follow_up_due', v_followup_due,
      'retry_signal', v_retry_signal
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

-- ---------------------------------------------------------------------
-- 3. Lead Generation CRM scoring engine rewrite - same rule set, applied
--    to this CRM's own richer status enum (which already directly
--    expresses several signals the Growth CRM can only infer from notes:
--    'No answer', 'Voicemail', 'Gatekeeper', 'Owner reached', 'Callback
--    requested', 'Interested', 'Information requested').
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
  v_appointment_booked_any boolean;
  v_appointment_completed boolean;
  v_email_engaged boolean;
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
    bool_or(status in ('Booked', 'Confirmed')),
    bool_or(status = 'Completed')
  into v_appointment_upcoming, v_appointment_booked_any, v_appointment_completed
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
  elsif v_lead.status = 'Closed' then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Lead closed');
  elsif (coalesce(v_appointment_booked_any, false) or coalesce(v_appointment_completed, false)) and not v_pending_followup then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, case when v_appointment_completed then 'Consultation completed - no further Opportunity Finder action needed' else 'Appointment already booked - no further Opportunity Finder action needed' end);
  elsif v_recent_notes ~ '(wrong number|duplicate (lead|entry|business)|bad (number|business|info)|invalid number|no longer in business|out of business|do not call|don''t call|remove me from|no further contact)' then
    v_force_closed := true;
    v_reasons := array_append(v_reasons, 'Recent notes indicate this lead should not be contacted further');
  end if;

  if v_lead.status = 'Owner reached' or v_recent_notes ~ '(decision maker|decision-maker|spoke (with|to) the owner|owner reached)' then
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Decision-maker reached or requested');
  end if;

  if v_lead.status = 'Information requested' or v_recent_notes ~ '(pricing|price quote|requested (more )?information|asked for (info|information|pricing|a quote|details)|send (more )?info|more details)' then
    v_score := v_score + 20;
    v_reasons := array_append(v_reasons, 'Requested pricing or information');
  end if;

  if v_lead.status = 'Callback requested' or v_recent_notes ~ '(call (me |him |her |them )?back|callback requested|requested a callback)' then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'Requested a callback');
  end if;

  if v_recent_notes ~ '(sounds good|wants to (move forward|proceed|sign up|get started)|ready to (move forward|sign|start)|very interested|great call|promising|positive (call|note|response)|excited about)' then
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Positive agent note on file');
  end if;

  if v_pending_followup and v_lead.next_follow_up_at is not null and v_lead.next_follow_up_at > v_now then
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Follow-up scheduled for ' || to_char(v_lead.next_follow_up_at, 'Mon DD, YYYY HH24:MI'));
  end if;

  if not v_force_closed and (coalesce(v_appointment_upcoming, false) or v_lead.status = 'Appointment booked') then
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

  v_hot_signal := v_lead.status in ('Interested', 'Information requested')
    or v_recent_notes ~ '(pricing|price quote|requested (more )?information|asked for (info|information|pricing|a quote|details)|send (more )?info|more details|sounds good|wants to (move forward|proceed|sign up|get started)|ready to (move forward|sign|start)|very interested|great call|promising|positive (call|note|response)|excited about)';

  v_warm_signal := v_lead.status in ('Owner reached', 'Callback requested')
    or v_recent_notes ~ '(decision maker|decision-maker|spoke (with|to) the owner|owner reached|call (me |him |her |them )?back|callback requested|requested a callback|contact (me |us )?(on|at) another (date|time|day)|not (the )?right time|needs? to think|thinking it over|not ready (yet|to (book|move forward))|good (call|conversation|chat)|will call back)'
    or (v_pending_followup and v_lead.next_follow_up_at is not null and v_lead.next_follow_up_at::date > v_now::date);

  v_followup_due := (v_pending_followup and v_lead.next_follow_up_at is not null and v_lead.next_follow_up_at::date <= v_now::date)
    or v_recent_notes ~ '(call (them |him |her )?again|another (contact )?attempt|follow up again|needs? (another|a) follow[- ]?up|try (calling|contacting) again)';

  v_retry_signal := v_lead.status in ('No answer', 'Voicemail', 'Gatekeeper')
    or v_recent_notes ~ '(no answer|left (a )?voicemail|voicemail|went to voicemail|gatekeeper|spoke (with|to) (the )?(receptionist|assistant|secretary)|couldn''t reach|could not reach|not available)';

  if v_force_closed then
    v_category := 'closed';
  elsif v_hot_signal then
    v_category := 'hot';
    v_reasons := array_append(v_reasons, 'Hot: prospect has shown real interest and may be ready to convert');
  elsif v_warm_signal then
    v_category := 'warm';
    v_reasons := array_append(v_reasons, 'Warm: meaningful contact made, not yet ready to book');
  elsif v_followup_due then
    v_category := 'follow_up';
    v_reasons := array_append(v_reasons, 'Follow-Up: a scheduled follow-up is due today or overdue');
  elsif v_retry_signal then
    v_category := 'retry';
    v_reasons := array_append(v_reasons, 'Retry: no answer/voicemail/gatekeeper on the last attempt - still worth another try');
  else
    v_category := 'retry';
    v_reasons := array_append(v_reasons, 'Retry: no strong signal yet - worth another attempt');
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
  elsif v_category = 'retry' then
    v_recommended := 'Attempt another call or leave a voicemail to re-engage.';
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
      'appointment_booked', coalesce(v_appointment_booked_any, false),
      'appointment_completed', coalesce(v_appointment_completed, false),
      'email_engaged', v_email_engaged,
      'status', v_lead.status,
      'hot_signal', v_hot_signal,
      'warm_signal', v_warm_signal,
      'follow_up_due', v_followup_due,
      'retry_signal', v_retry_signal
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

-- ---------------------------------------------------------------------
-- 4. Backfill: recompute every existing row under the new rule set. The
--    triggers from migrations 0112/0113 are untouched (same function
--    names/signatures), so this is the only step needed to bring existing
--    data onto the new categories - no application code or RLS changes.
-- ---------------------------------------------------------------------
do $$
declare rec record;
begin
  for rec in select id from public.crm_opportunities loop
    perform public.crm_recompute_opportunity_score(rec.id);
  end loop;
end;
$$;

do $$
declare rec record;
begin
  for rec in select id from public.leadgen_leads loop
    perform public.leadgen_recompute_opportunity_score(rec.id);
  end loop;
end;
$$;
