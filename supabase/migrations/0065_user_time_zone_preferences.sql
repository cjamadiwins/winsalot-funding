-- "Client Local Time" panel (upgraded from the old hardcoded Toronto +
-- British Columbia dual clock shared by every logged-in CRM screen - see
-- CrmShell/DualTimeClock) becomes user-configurable: any two locations,
-- picked from a canonical Canada/U.S. province-or-state + major-city list
-- (src/lib/timezone-locations.ts), persisted per Supabase Auth user so
-- the choice survives a refresh, a logout, or a new device.
--
-- One shared table keyed on auth.users(id) rather than crm_users or
-- leadgen_users - this panel is rendered by all four logged-in CRM areas
-- (Cleaning admin/agent, Lead Gen admin/agent, and the Lead Gen client
-- portal too) and those roles live in two separate, deliberately
-- unlinked tables (see crm-auth.ts / leadgen-auth.ts), but every one of
-- them is still a row in auth.users. A user manages only their own row -
-- no admin-visible-to-all policy is needed since this is a personal
-- display preference, not CRM data.
create table if not exists public.user_time_zone_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  location_1_country text not null default 'CA' check (location_1_country in ('CA', 'US')),
  location_1_region_code text not null default 'ON',
  location_1_city text not null default 'Toronto',
  location_1_time_zone text not null default 'America/Toronto',

  location_2_country text not null default 'CA' check (location_2_country in ('CA', 'US')),
  location_2_region_code text not null default 'BC',
  location_2_city text not null default 'Vancouver',
  location_2_time_zone text not null default 'America/Vancouver'
);

create or replace function public.user_time_zone_preferences_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_time_zone_preferences_set_updated_at
  before update on public.user_time_zone_preferences
  for each row execute function public.user_time_zone_preferences_set_updated_at();

alter table public.user_time_zone_preferences enable row level security;

create policy "user_time_zone_preferences_select_own"
  on public.user_time_zone_preferences for select
  using (user_id = auth.uid());

create policy "user_time_zone_preferences_insert_own"
  on public.user_time_zone_preferences for insert
  with check (user_id = auth.uid());

create policy "user_time_zone_preferences_update_own"
  on public.user_time_zone_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Backfill: give every existing account (any of today's four CRM areas,
-- plus any /admin account with no crm_users row) an explicit row with
-- the same Toronto/Vancouver defaults the old hardcoded dual clock
-- always showed, so nobody's panel looks any different until they
-- change it themselves via "Edit Locations".
insert into public.user_time_zone_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;
