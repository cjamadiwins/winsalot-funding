-- CRM for calling agents: interested leads, follow-up activity, and a
-- crm_users table that layers agent/admin roles on top of existing
-- Supabase Auth accounts. Purely additive - no existing table, column, or
-- row is modified.
--
-- Unlike the legacy quote_requests/cleaning_providers tables (RLS enabled,
-- no policies, service-role key only), these three tables use real RLS
-- policies driven by auth.uid() so agents are restricted to their own
-- leads at the database level, not just by application code. Reads/writes
-- from the app go through the session-scoped Supabase client (anon key +
-- user JWT), the same client already used for admin login, so RLS is what
-- actually enforces access.

-- One row per Supabase Auth user who's part of the CRM. role = 'admin'
-- also gates the *existing* /admin quote dashboard (see requireAdminUser
-- in src/lib/admin-auth.ts), so agent accounts can't reach it.
create table if not exists public.crm_users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  active boolean not null default true
);

alter table public.crm_users enable row level security;

-- Every Supabase Auth user that exists today is a de-facto admin of the
-- quote dashboard (requireAdminUser has no role check before this
-- migration). Seed a matching admin crm_users row for each of them so
-- nobody loses access once the role check is added in application code.
insert into public.crm_users (id, full_name, email, role, active)
select u.id, coalesce(u.email, 'Admin'), coalesce(u.email, ''), 'admin', true
from auth.users u
on conflict (id) do nothing;

-- security definer so policies can look up a caller's role without
-- re-triggering RLS on crm_users (the standard Supabase pattern for
-- avoiding self-referential recursion in a table's own policies).
create or replace function public.crm_user_role(uid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.crm_users where id = uid and active limit 1;
$$;

create policy "crm_users_select_active_members"
  on public.crm_users for select
  using (public.crm_user_role(auth.uid()) is not null);

create policy "crm_users_admin_write"
  on public.crm_users for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  business_name text not null,
  contact_name text,
  phone text not null,
  email text,
  city text not null,
  service_address text,
  service_requested text not null,
  property_type text,
  approximate_size text,
  cleaning_frequency text,
  preferred_start_date date,
  best_time_to_contact text,
  lead_source text,
  notes text,
  stage text not null default 'New interested lead' check (stage in (
    'New interested lead',
    'Waiting for cleaning details',
    'Quote requested from provider',
    'Provider quote received',
    'Quote sent to customer',
    'Follow-up required',
    'Customer accepted',
    'Customer declined',
    'No response',
    'Closed/completed'
  )),
  assigned_agent_id uuid references public.crm_users(id) on delete set null,
  created_by uuid references public.crm_users(id) on delete set null,
  next_follow_up_at timestamptz,
  last_contacted_at timestamptz,
  -- Nullable link to the existing quote-request workflow. One nullable FK
  -- rather than a separate join table, since a lead maps to at most one
  -- active quote request.
  quote_request_id uuid references public.quote_requests(id) on delete set null
);

create index if not exists crm_leads_assigned_agent_idx on public.crm_leads(assigned_agent_id);
create index if not exists crm_leads_stage_idx on public.crm_leads(stage);
create index if not exists crm_leads_quote_request_idx on public.crm_leads(quote_request_id);

alter table public.crm_leads enable row level security;

-- Admins can read/write/delete every lead.
create policy "crm_leads_admin_all"
  on public.crm_leads for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Agents can only see leads assigned to them.
create policy "crm_leads_agent_select_own"
  on public.crm_leads for select
  using (assigned_agent_id = auth.uid());

-- Agents can create leads, but only assigned to themselves.
create policy "crm_leads_agent_insert_own"
  on public.crm_leads for insert
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and created_by = auth.uid()
    and assigned_agent_id = auth.uid()
  );

-- Agents can update leads assigned to them (stage, notes, follow-up date,
-- etc.), but cannot reassign a lead to someone else or delete it - only
-- the admin policy above covers delete.
create policy "crm_leads_agent_update_own"
  on public.crm_leads for update
  using (assigned_agent_id = auth.uid())
  with check (assigned_agent_id = auth.uid());

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  agent_id uuid references public.crm_users(id) on delete set null,
  activity_type text not null check (activity_type in (
    'call', 'email', 'text', 'voicemail', 'note', 'outcome'
  )),
  notes text,
  occurred_at timestamptz not null default now(),
  -- Logging an activity with a next follow-up date is also copied onto
  -- crm_leads.next_follow_up_at by the app so the lead always reflects
  -- its current next follow-up while this table keeps full history.
  next_follow_up_at timestamptz
);

create index if not exists crm_activities_lead_idx on public.crm_activities(lead_id, occurred_at desc);

alter table public.crm_activities enable row level security;

create policy "crm_activities_admin_all"
  on public.crm_activities for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_activities_agent_select_own_lead"
  on public.crm_activities for select
  using (exists (
    select 1 from public.crm_leads l
    where l.id = lead_id and l.assigned_agent_id = auth.uid()
  ));

create policy "crm_activities_agent_insert_own_lead"
  on public.crm_activities for insert
  with check (
    agent_id = auth.uid()
    and exists (
      select 1 from public.crm_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    )
  );

-- No update/delete policy for agents on crm_activities - the timeline is
-- an append-only log for them; only admins (covered by crm_activities_admin_all)
-- can edit or remove an entry.
