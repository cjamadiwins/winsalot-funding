-- Fixes the Agent Idle & Break Alert System's idle-duration calculation
-- (migrations 20260919180000_agent_idle_break_alerts.sql and
-- 20260919200000_agent_idle_acknowledgment.sql): idle_duration_minutes
-- must represent the agent's TRUE total CRM inactivity time - from their
-- actual last meaningful activity to acknowledgment - never just "the
-- time from when the 30-minute warning banner appeared until they
-- acknowledged it."
--
-- Root cause: the app previously set a new agent_idle_sessions row's
-- idle_start to "now" at the moment the 30-minute warning was raised,
-- rather than to the agent's actual last_activity_at (which was already
-- ~30 minutes in the past at that point). Since idle_duration_minutes is
-- computed as idle_end - idle_start, this meant an agent who acknowledged
-- immediately after the warning appeared showed as "idle for ~0-1
-- minutes" even though they had genuinely been inactive for 30+ minutes.
--
-- Fix (application-side, src/lib/attendance-pay.ts's
-- computeAgentActivityPollPlan + both CRMs' activity-actions.ts): a new
-- idle_start now always equals the agent's real last_activity_at. This
-- migration only adds the column needed to keep recording "when the
-- warning was actually shown" now that idle_start no longer means that -
-- alert_at. Purely additive: nullable column, existing rows backfilled
-- from their own idle_start (which, before this fix, held exactly what
-- alert_at now means), so no data is lost or invented. No existing
-- column, row, trigger, or policy is altered or removed - the
-- idle_duration_minutes trigger (set_agent_idle_session_duration /
-- set_leadgen_agent_idle_session_duration) is untouched; it already
-- computes idle_end - idle_start, which is now simply fed the correct
-- idle_start going forward.

-- ---------------------------------------------------------------------
-- 1. Growth CRM
-- ---------------------------------------------------------------------

alter table public.agent_idle_sessions
  add column if not exists alert_at timestamptz;

update public.agent_idle_sessions set alert_at = idle_start where alert_at is null;

comment on column public.agent_idle_sessions.idle_start is
  'The agent''s true last-CRM-activity timestamp - the real start of this inactivity period. Rows created before the 2026-09-21 idle-duration fix instead hold the moment the 30-minute warning was raised (see alert_at, backfilled from this column''s old value for those rows).';
comment on column public.agent_idle_sessions.alert_at is
  'When the 30-minute idle warning was actually shown to the agent. For rows predating the 2026-09-21 idle-duration fix, backfilled from idle_start, which held exactly this meaning before the fix.';

-- ---------------------------------------------------------------------
-- 2. Lead Generation CRM (identical shape)
-- ---------------------------------------------------------------------

alter table public.leadgen_agent_idle_sessions
  add column if not exists alert_at timestamptz;

update public.leadgen_agent_idle_sessions set alert_at = idle_start where alert_at is null;

comment on column public.leadgen_agent_idle_sessions.idle_start is
  'Lead Generation CRM mirror of public.agent_idle_sessions.idle_start - see its comment.';
comment on column public.leadgen_agent_idle_sessions.alert_at is
  'Lead Generation CRM mirror of public.agent_idle_sessions.alert_at - see its comment.';
