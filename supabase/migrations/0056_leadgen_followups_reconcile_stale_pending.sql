-- One-time data correction for a bug in recordCallOutcomeAction (Lead
-- Generation CRM, admin and agent lead-detail actions): logging a call
-- outcome that scheduled a new follow-up never marked the previous
-- pending follow-up as completed, leaving it orphaned - so the
-- dashboard's Overdue Follow-ups count (which scanned leadgen_followups
-- directly) kept counting call outcomes that had already been actioned,
-- while the Leads page's Overdue filter (which reads
-- leadgen_leads.next_follow_up_at, already correctly advanced by that
-- same action) showed nothing. The application code is fixed alongside
-- this migration; this reconciles the rows already left in that
-- inconsistent state.
--
-- Safe/idempotent: only ever touches a 'pending' row whose scheduled_at
-- no longer matches its own lead's current next_follow_up_at - which can
-- only arise from the exact bug above (every write path into this table
-- - scheduleFollowUpAction, completeFollowUpAction, and now
-- recordCallOutcomeAction - recomputes next_follow_up_at immediately
-- after touching it). Rows are marked completed, never deleted, so
-- follow-up history and activity records are fully preserved.
update public.leadgen_followups f
set status = 'completed',
    completed_at = now()
from public.leadgen_leads l
where l.id = f.lead_id
  and f.status = 'pending'
  and f.scheduled_at is distinct from l.next_follow_up_at;
