-- Agent Performance Report (Lead Gen CRM): credits each booked
-- appointment to "the agent responsible for the lead" automatically, so
-- the report never depends on anyone manually attributing a booking.
--
-- booking_agent_id is set once, at insert time, by the trigger below - it
-- is deliberately NOT kept in sync with later lead reassignments, so a
-- booking's credit is a fixed historical fact ("who this counted toward
-- when it was booked"), matching "keep all historical records" and "do
-- not count the same appointment twice" in the brief. It is independent
-- of assigned_specialist_id, which can be a different person (the one
-- actually taking the consultation) than the calling agent who gets
-- credit for booking it.
alter table public.leadgen_appointments
  add column if not exists booking_agent_id uuid references public.leadgen_users(id) on delete set null;

create index if not exists leadgen_appointments_booking_agent_idx on public.leadgen_appointments(booking_agent_id);

-- Every existing way an appointment gets created (agent's own "Book
-- Appointment" form, admin's "Book Appointment" form, the public
-- /book/[slug] page, and the Calendly webhook) already sets lead_id when
-- it can match one - this trigger is the single place that turns that
-- into "credit the lead's current agent," without any of those call
-- sites needing to change. Falls back to assigned_specialist_id only for
-- a lead-less appointment, so a booking still credits *someone* rather
-- than nobody when there's no lead to read an owner from.
--
-- security definer so it can read leadgen_leads regardless of the
-- caller's own RLS - the public booking page and Calendly webhook insert
-- via the service-role client with no auth.uid() at all, and an agent's
-- own insert is already restricted to a lead they can see by
-- leadgen_appointments_agent_insert_own, so this never widens what an
-- agent can attribute. Like crm_leads_restrict_agent_stage (migration
-- 0009), EXECUTE is revoked from every role below since trigger firing
-- isn't subject to the calling role's own grants.
create or replace function public.leadgen_appointments_set_booking_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booking_agent_id is not null then
    return new;
  end if;

  if new.lead_id is not null then
    select assigned_agent_id into new.booking_agent_id
    from public.leadgen_leads
    where id = new.lead_id;
  end if;

  if new.booking_agent_id is null then
    new.booking_agent_id := new.assigned_specialist_id;
  end if;

  return new;
end;
$$;

drop trigger if exists leadgen_appointments_set_booking_agent_trigger on public.leadgen_appointments;

create trigger leadgen_appointments_set_booking_agent_trigger
  before insert on public.leadgen_appointments
  for each row
  execute function public.leadgen_appointments_set_booking_agent();

revoke execute on function public.leadgen_appointments_set_booking_agent() from public;
revoke execute on function public.leadgen_appointments_set_booking_agent() from anon;
revoke execute on function public.leadgen_appointments_set_booking_agent() from authenticated;

-- Backfill every appointment that already existed before this migration,
-- the same way the trigger would have credited it at insert time, so the
-- report's "previous week"/"monthly"/historical figures are correct from
-- day one instead of only counting bookings made after this deploy.
update public.leadgen_appointments a
set booking_agent_id = coalesce(l.assigned_agent_id, a.assigned_specialist_id)
from public.leadgen_leads l
where a.lead_id = l.id and a.booking_agent_id is null;

update public.leadgen_appointments
set booking_agent_id = assigned_specialist_id
where lead_id is null and booking_agent_id is null and assigned_specialist_id is not null;
