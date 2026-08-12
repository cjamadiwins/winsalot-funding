-- Weekly Agent Incentive - adds a Rejected outcome and payment
-- date/reference to the shared ledger (winsalot_agent_incentive_ledger,
-- migration 0059). Purely additive workflow/audit fields - does not
-- touch computeWeeklyIncentiveBonus, the ₦5,000 flat-bonus math, the
-- 4-record weekly quota, the ₦25,000 monthly cap, or any qualifying-
-- record rule in either CRM. "Rejected" sits alongside 'pending'/
-- 'approved'/'paid' as a fourth terminal-ish outcome: an admin who
-- reviews a week's qualifying records and decides they don't actually
-- satisfy the requirements can record that decision (with a mandatory
-- reason, reusing the existing adjustment_reason column) instead of
-- either approving it or leaving it silently unreviewed forever.
--
-- payment_date/payment_reference are optional admin-entered fields
-- distinct from paid_at (the timestamp the "Mark Paid" action itself was
-- clicked) - e.g. an admin marking a bonus paid in the system today for
-- a bank transfer that actually posted two days ago.
alter table public.winsalot_agent_incentive_ledger
  add column if not exists rejected_by_name text,
  add column if not exists rejected_at timestamptz,
  add column if not exists payment_date date,
  add column if not exists payment_reference text;

comment on column public.winsalot_agent_incentive_ledger.adjustment_reason is
  'Mandatory written reason for either an approval-amount adjustment (status approved/paid, approved_total != calculated_bonus) or a rejection (status = rejected).';

-- Widen the status enum to include 'rejected'. The column has no
-- explicit constraint name from migration 0059's inline `check (status
-- in (...))`, so Postgres auto-named it
-- winsalot_agent_incentive_ledger_status_check.
alter table public.winsalot_agent_incentive_ledger
  drop constraint if exists winsalot_agent_incentive_ledger_status_check;
alter table public.winsalot_agent_incentive_ledger
  add constraint winsalot_agent_incentive_ledger_status_check
  check (status in ('pending', 'approved', 'rejected', 'paid'));

-- Replace the approval pairing constraint: a rejected row never has an
-- approved_total (it was explicitly *not* approved), same as pending.
alter table public.winsalot_agent_incentive_ledger
  drop constraint if exists winsalot_agent_incentive_ledger_status_approval_pairing;
alter table public.winsalot_agent_incentive_ledger
  add constraint winsalot_agent_incentive_ledger_status_approval_pairing check (
    (status in ('pending', 'rejected') and approved_total is null and approved_by_name is null and approved_at is null)
    or (status in ('approved', 'paid') and approved_total is not null and approved_by_name is not null and approved_at is not null)
  );

-- New: a rejected row must record who/when, and must always carry a
-- reason (brief: "Reject the weekly incentive with a required
-- explanation"); every other status must leave these columns null.
alter table public.winsalot_agent_incentive_ledger
  add constraint winsalot_agent_incentive_ledger_rejection_pairing check (
    (status = 'rejected' and rejected_by_name is not null and rejected_at is not null and adjustment_reason is not null and length(trim(adjustment_reason)) > 0)
    or (status != 'rejected' and rejected_by_name is null and rejected_at is null)
  );

-- payment_date is optional even when paid (admin may not always know/
-- enter it), but if set at all, only makes sense alongside a paid row.
alter table public.winsalot_agent_incentive_ledger
  add constraint winsalot_agent_incentive_ledger_payment_date_requires_paid check (
    payment_date is null or status = 'paid'
  );

-- winsalot_agent_incentive_audit (migration 0059) needs a matching
-- 'rejected' action value so a rejection can be logged the same way an
-- approval/adjustment/payment already is.
alter table public.winsalot_agent_incentive_audit
  drop constraint if exists winsalot_agent_incentive_audit_action_check;
alter table public.winsalot_agent_incentive_audit
  add constraint winsalot_agent_incentive_audit_action_check
  check (action in ('approved', 'adjusted', 'rejected', 'paid'));
