-- Extends the existing Agent Idle & Break Alert System (migration
-- 20260919180000_agent_idle_break_alerts.sql) with a required 30-minute
-- idle acknowledgment. Modifies that system in place rather than
-- replacing it: idle_since (the 45-minute "Idle" Live Status marker) and
-- agent_idle_sessions (one row per idle episode) both keep their existing
-- meaning and every existing column; this only adds what's genuinely new
-- - a pending-acknowledgment marker on the shift row, and the
-- acknowledgment's own fields on the idle session it belongs to.
--
-- Design: an idle *episode* now begins at the 30-minute warning (not the
-- 45-minute escalation as before) - its agent_idle_sessions row is opened
-- at 30 minutes, closed only by an explicit acknowledgment (idle_end =
-- acknowledged_at) or by the agent entering an exempted state (break/
-- lunch/clocked out/on a call) before ever acknowledging. If the agent
-- reaches 45 minutes without acknowledging, the SAME row is marked
-- escalated_at (not a second row) - so one episode's full lifecycle,
-- acknowledged or not, before or after escalation, is always one
-- agent_idle_sessions row. idle_since itself is untouched: it still only
-- gets set at the 45-minute mark and still drives computeAgentLiveStatus
-- exactly as before.
--
-- No RLS policy changes needed: every column added below is written by
-- either (a) the owning agent, on their own still-open row, which the
-- existing agent_idle_sessions_*_update_own_open / agent_attendance_*_
-- update_own_open policies already permit (they're row-level, not
-- column-restricted), or (b) nothing at all for admins, who keep their
-- existing select-only access - so agents still cannot edit or delete a
-- closed (acknowledged) record, and admins still cannot either.

-- ---------------------------------------------------------------------
-- 1. Growth CRM
-- ---------------------------------------------------------------------

alter table public.agent_attendance
  add column if not exists idle_ack_pending_since timestamptz;

comment on column public.agent_attendance.idle_ack_pending_since is
  'Set when the 30-minute idle warning is raised; cleared only when the agent submits the acknowledgment (or the pending warning is superseded by an exempted state). While set, the agent-side idle acknowledgment modal must be shown/reappear.';

alter table public.agent_idle_sessions
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_reason text,
  add column if not exists acknowledged_explanation text,
  add column if not exists escalated_at timestamptz,
  add column if not exists acknowledged_before_escalation boolean;

alter table public.agent_idle_sessions
  drop constraint if exists agent_idle_sessions_ack_reason_valid;
alter table public.agent_idle_sessions
  add constraint agent_idle_sessions_ack_reason_valid check (
    acknowledged_reason is null or acknowledged_reason in (
      'working_outside_crm', 'business_call', 'researching_prospect',
      'technical_issue', 'connectivity_issue', 'stepped_away', 'other'
    )
  );

alter table public.agent_idle_sessions
  drop constraint if exists agent_idle_sessions_other_requires_explanation;
alter table public.agent_idle_sessions
  add constraint agent_idle_sessions_other_requires_explanation check (
    acknowledged_reason is distinct from 'other'
    or (acknowledged_explanation is not null and length(trim(acknowledged_explanation)) > 0)
  );

comment on column public.agent_idle_sessions.escalated_at is
  'Set if this episode reached 45 minutes of inactivity before being acknowledged (the existing escalation) - independent of whether it was later acknowledged.';
comment on column public.agent_idle_sessions.acknowledged_before_escalation is
  'True if the agent submitted the 30-minute acknowledgment before escalated_at was ever set; false if it was set after (or never acknowledged). Null until acknowledged.';

-- ---------------------------------------------------------------------
-- 2. Lead Generation CRM (identical shape)
-- ---------------------------------------------------------------------

alter table public.leadgen_agent_attendance
  add column if not exists idle_ack_pending_since timestamptz;

comment on column public.leadgen_agent_attendance.idle_ack_pending_since is
  'Lead Generation CRM mirror of public.agent_attendance.idle_ack_pending_since - see its comment.';

alter table public.leadgen_agent_idle_sessions
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_reason text,
  add column if not exists acknowledged_explanation text,
  add column if not exists escalated_at timestamptz,
  add column if not exists acknowledged_before_escalation boolean;

alter table public.leadgen_agent_idle_sessions
  drop constraint if exists leadgen_agent_idle_sessions_ack_reason_valid;
alter table public.leadgen_agent_idle_sessions
  add constraint leadgen_agent_idle_sessions_ack_reason_valid check (
    acknowledged_reason is null or acknowledged_reason in (
      'working_outside_crm', 'business_call', 'researching_prospect',
      'technical_issue', 'connectivity_issue', 'stepped_away', 'other'
    )
  );

alter table public.leadgen_agent_idle_sessions
  drop constraint if exists leadgen_agent_idle_sessions_other_requires_explanation;
alter table public.leadgen_agent_idle_sessions
  add constraint leadgen_agent_idle_sessions_other_requires_explanation check (
    acknowledged_reason is distinct from 'other'
    or (acknowledged_explanation is not null and length(trim(acknowledged_explanation)) > 0)
  );

comment on column public.leadgen_agent_idle_sessions.escalated_at is
  'Lead Generation CRM mirror of public.agent_idle_sessions.escalated_at - see its comment.';
comment on column public.leadgen_agent_idle_sessions.acknowledged_before_escalation is
  'Lead Generation CRM mirror of public.agent_idle_sessions.acknowledged_before_escalation - see its comment.';
