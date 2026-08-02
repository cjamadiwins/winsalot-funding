-- Prevents two customers from ever booking the same client's calendar
-- slot at once via the new public booking page (/book/[slug],
-- src/app/book/[slug]/actions.ts) - a race between two concurrent
-- submissions for the same (client, date, time) now fails the second
-- insert with a unique-violation, which the action catches and turns
-- into a friendly "that time was just booked - pick another" error,
-- instead of silently double-booking the client. Cancelled appointments
-- are excluded so a freed-up slot (after a cancellation) can be rebooked.
create unique index if not exists leadgen_appointments_unique_active_slot
  on public.leadgen_appointments (client_id, appointment_date, appointment_time)
  where status <> 'Cancelled';
