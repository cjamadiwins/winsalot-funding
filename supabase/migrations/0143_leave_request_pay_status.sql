-- Two-part leave decision (both CRMs): management now approves the time
-- off separately from whether it's paid. `status` (crm_leave_requests /
-- leadgen_leave_requests) keeps its existing meaning as the Leave Status
-- (pending/approved/declined) - this migration adds a sibling
-- `pay_status` column (pending/paid/unpaid) alongside it, so a request
-- can be Approved + Paid, Approved + Unpaid, or Declined, matching the
-- new policy exactly.
--
-- `attendance_status` gains a new 'unpaid_leave' value: an *approved*
-- leave whose workdays are unpaid, attendance-facing as "Unpaid Leave" -
-- entirely distinct from the pre-existing 'unpaid_absence', which is a
-- *declined* request the agent was nevertheless absent for, handled
-- under the existing attendance/absence rules this feature never
-- touches. 'paid_leave' (Approved + Paid, attendance "Paid Leave") is
-- unchanged.
--
-- Backfill: every leave request approved under the old single-status
-- policy was, by definition, paid - there was no other option - so
-- every existing 'approved' row becomes Approved + Paid here. Every
-- 'pending'/'declined' row keeps the 'pending' default: Pay Status has
-- nothing to decide until Leave Status is Approved (enforced below by
-- crm_leave_requests_pay_status_requires_approval), matching the spec's
-- own display rule that Declined/Pending show no separate Pay Status.
alter table public.crm_leave_requests
  add column if not exists pay_status text not null default 'pending' check (pay_status in ('pending', 'paid', 'unpaid'));

alter table public.leadgen_leave_requests
  add column if not exists pay_status text not null default 'pending' check (pay_status in ('pending', 'paid', 'unpaid'));

update public.crm_leave_requests set pay_status = 'paid' where status = 'approved' and pay_status = 'pending';
update public.leadgen_leave_requests set pay_status = 'paid' where status = 'approved' and pay_status = 'pending';

alter table public.crm_leave_requests
  add constraint crm_leave_requests_pay_status_requires_approval check (pay_status = 'pending' or status = 'approved');

alter table public.leadgen_leave_requests
  add constraint leadgen_leave_requests_pay_status_requires_approval check (pay_status = 'pending' or status = 'approved');

alter table public.crm_leave_requests
  drop constraint if exists crm_leave_requests_attendance_status_check;
alter table public.crm_leave_requests
  add constraint crm_leave_requests_attendance_status_check
  check (attendance_status in ('none', 'paid_leave', 'unpaid_leave', 'unpaid_absence'));

alter table public.leadgen_leave_requests
  drop constraint if exists leadgen_leave_requests_attendance_status_check;
alter table public.leadgen_leave_requests
  add constraint leadgen_leave_requests_attendance_status_check
  check (attendance_status in ('none', 'paid_leave', 'unpaid_leave', 'unpaid_absence'));

-- Both audit-log check constraints gain 'attendance_marked_unpaid_leave' -
-- additive only, every existing action value stays valid.
alter table public.crm_leave_request_audit_log
  drop constraint if exists crm_leave_request_audit_log_action_check;
alter table public.crm_leave_request_audit_log
  add constraint crm_leave_request_audit_log_action_check check (action in (
    'submitted', 'approved', 'declined',
    'attendance_marked_paid_leave', 'attendance_marked_unpaid_leave', 'attendance_marked_unpaid_absence',
    'deduction_confirmed', 'payroll_applied', 'edited', 'deleted'
  ));

alter table public.leadgen_leave_request_audit_log
  drop constraint if exists leadgen_leave_request_audit_log_action_check;
alter table public.leadgen_leave_request_audit_log
  add constraint leadgen_leave_request_audit_log_action_check check (action in (
    'submitted', 'approved', 'declined',
    'attendance_marked_paid_leave', 'attendance_marked_unpaid_leave', 'attendance_marked_unpaid_absence',
    'deduction_confirmed', 'payroll_applied', 'edited', 'deleted'
  ));

-- An agent's own insert must still land as a plain pending request with
-- every admin-only field at its default - pay_status included, same
-- rationale as every other decision field already listed here (migration
-- 0069).
drop policy if exists "crm_leave_requests_agent_insert_own" on public.crm_leave_requests;
create policy "crm_leave_requests_agent_insert_own"
  on public.crm_leave_requests for insert
  with check (
    agent_id = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and status = 'pending'
    and pay_status = 'pending'
    and decided_by is null
    and decided_at is null
    and attendance_status = 'none'
    and deduction_confirmed = false
    and payroll_applied_id is null
  );

drop policy if exists "leadgen_leave_requests_agent_insert_own" on public.leadgen_leave_requests;
create policy "leadgen_leave_requests_agent_insert_own"
  on public.leadgen_leave_requests for insert
  with check (
    agent_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and status = 'pending'
    and pay_status = 'pending'
    and decided_by is null
    and decided_at is null
    and attendance_status = 'none'
    and deduction_confirmed = false
    and payroll_applied_id is null
  );
