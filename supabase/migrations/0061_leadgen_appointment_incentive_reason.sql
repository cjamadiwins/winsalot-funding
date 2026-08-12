-- Weekly Agent Incentive - a reason column alongside leadgen_appointments.
-- incentive_status (migration 0057), for when an admin marks an
-- appointment as one of the non-Qualified values (Cancelled/Invalid/
-- Duplicate/Unqualified) - brief: "Reject invalid records using a
-- required reason." Nullable at the database level (application code in
-- the admin Appointments page enforces "required" when the marked
-- status isn't Qualified/unreviewed) so a plain 'Qualified' marking, or
-- clearing back to unreviewed, never needs one. Purely additive - does
-- not change which appointments count toward the weekly quota.
alter table public.leadgen_appointments
  add column if not exists incentive_status_reason text;
