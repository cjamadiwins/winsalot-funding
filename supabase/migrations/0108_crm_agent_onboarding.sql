-- Required onboarding for newly invited Growth CRM agents. Existing users have
-- no row and therefore retain their current access.
create table if not exists public.crm_agent_onboarding (
  agent_id uuid primary key references public.crm_users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'in_progress', 'submitted', 'approved', 'changes_requested')),
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  timezone text not null default 'America/Toronto',
  policies_acknowledged_at timestamptz,
  attendance_acknowledged_at timestamptz,
  confidentiality_acknowledged_at timestamptz,
  quiz_score int check (quiz_score between 0 and 100),
  quiz_passed_at timestamptz,
  acknowledgement_name text,
  acknowledgement_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.crm_users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_agent_onboarding enable row level security;

create policy "crm_agent_onboarding_admin_all" on public.crm_agent_onboarding for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_agent_onboarding_self_select" on public.crm_agent_onboarding for select
  using (agent_id = auth.uid());

create policy "crm_agent_onboarding_self_update" on public.crm_agent_onboarding for update
  using (agent_id = auth.uid() and status <> 'approved')
  with check (agent_id = auth.uid() and status in ('in_progress', 'submitted', 'changes_requested'));

create or replace function public.crm_agent_onboarding_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_agent_onboarding_set_updated_at
  before update on public.crm_agent_onboarding
  for each row execute function public.crm_agent_onboarding_set_updated_at();

