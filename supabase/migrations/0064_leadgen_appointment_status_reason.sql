-- Winsalot Lead Generation CRM: an appointment that gets corrected (e.g.
-- rebooked after the original contact email bounced) previously had no
-- distinct status from a genuine cancellation - both used 'Cancelled',
-- with no way to record why the appointment was pulled out of the
-- active count. Every dashboard/report total (Appointments Booked,
-- Results by Client/Agent, weekly/monthly performance and incentive
-- calculations) counted every row regardless of status, so a corrected
-- duplicate kept inflating every total right alongside the appointment
-- that replaced it.
--
-- Adds:
--  - 'Replaced' status: the original, no-longer-valid appointment a
--    correction superseded (kept for audit - never deleted, and lead
--    activity history is untouched).
--  - status_reason / status_set_by / status_set_at: an optional
--    admin-entered reason plus who/when, captured by the new
--    "Cancel/Replace Appointment" admin action (see
--    leadgen/admin/(dashboard)/appointments/actions.ts). Nullable - only
--    ever set by that action, never required for the normal
--    Booked/Confirmed/Completed/No-show/Rescheduled/Cancelled lifecycle.
alter table public.leadgen_appointments
  drop constraint if exists leadgen_appointments_status_check;

alter table public.leadgen_appointments
  add constraint leadgen_appointments_status_check
  check (status in ('Booked', 'Confirmed', 'Completed', 'No-show', 'Rescheduled', 'Cancelled', 'Replaced'));

alter table public.leadgen_appointments
  add column if not exists status_reason text,
  add column if not exists status_set_by uuid references auth.users(id) on delete set null,
  add column if not exists status_set_at timestamptz;
