-- Admin Edit/Delete for Leave Requests (both CRMs): lets an admin correct
-- a leave request after the fact (leave type, dates, reason, status) or
-- remove one entirely, while keeping attendance/payroll and the audit
-- trail consistent - "If an approved request is edited or deleted,
-- automatically reverse or update any attendance and payroll entries
-- connected to it," "Record who edited or deleted the request, what
-- changed, and when."
--
-- Delete is a SOFT delete (deleted_at/deleted_by/deleted_by_name), not a
-- real DELETE FROM: both audit log tables reference their leave request
-- with `on delete cascade`, so a real delete would destroy the very
-- "who deleted this and when" audit row it's supposed to preserve. The
-- app filters every list query (admin + agent, both CRMs) to exclude
-- deleted_at is not null rows, so a deleted request disappears from view
-- everywhere exactly like a real delete, while the row itself - and its
-- full audit history - remains in the database.
alter table public.crm_leave_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.crm_users(id) on delete set null,
  add column if not exists deleted_by_name text;

alter table public.leadgen_leave_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.leadgen_users(id) on delete set null,
  add column if not exists deleted_by_name text;

-- Both audit-log check constraints gain 'edited' and 'deleted' - additive
-- only, every existing action value stays valid.
alter table public.crm_leave_request_audit_log
  drop constraint if exists crm_leave_request_audit_log_action_check;
alter table public.crm_leave_request_audit_log
  add constraint crm_leave_request_audit_log_action_check check (action in (
    'submitted', 'approved', 'declined',
    'attendance_marked_paid_leave', 'attendance_marked_unpaid_absence',
    'deduction_confirmed', 'payroll_applied', 'edited', 'deleted'
  ));

alter table public.leadgen_leave_request_audit_log
  drop constraint if exists leadgen_leave_request_audit_log_action_check;
alter table public.leadgen_leave_request_audit_log
  add constraint leadgen_leave_request_audit_log_action_check check (action in (
    'submitted', 'approved', 'declined',
    'attendance_marked_paid_leave', 'attendance_marked_unpaid_absence',
    'deduction_confirmed', 'payroll_applied', 'edited', 'deleted'
  ));
