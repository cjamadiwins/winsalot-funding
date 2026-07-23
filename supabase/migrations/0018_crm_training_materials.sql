-- Sales Training & Call Scripts: a read-only reference section for
-- agents, kept as its own area rather than a tab on the lead-management
-- screen so it doesn't clutter the day-to-day working view. Agents can
-- view and copy training content; only admins can add, edit, or remove
-- it - same admin-authors/agent-consumes split already used elsewhere in
-- the CRM (e.g. crm_users role).
--
-- Applied directly to the live Supabase project and verified there
-- (select/insert/update/delete tested against the crm_users_select_self-
-- style role simulation, same approach used to verify migration 0007's
-- policies): an active agent can select but is blocked on insert/update/
-- delete (42501), an active admin can do all four.

create table if not exists public.crm_training_materials (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  content text not null,
  sort_order int not null default 0,
  created_by uuid references public.crm_users(id) on delete set null
);

create index if not exists crm_training_materials_sort_idx
  on public.crm_training_materials (sort_order, created_at);

alter table public.crm_training_materials enable row level security;

create or replace function public.crm_training_materials_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_training_materials_set_updated_at
  before update on public.crm_training_materials
  for each row execute function public.crm_training_materials_set_updated_at();

-- Any active CRM member (agent or admin) can read every training
-- material - it's shared reference content, not scoped per-agent the way
-- leads are.
create policy "crm_training_materials_select_members"
  on public.crm_training_materials for select
  using (public.crm_user_role(auth.uid()) is not null);

-- Only admins can add, edit, or remove training materials.
create policy "crm_training_materials_admin_all"
  on public.crm_training_materials for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

insert into public.crm_training_materials (title, content, sort_order) values (
  'Property Management Cleaning Call Script',
  '"Hi, is this [Business Name]?"

"Great, my name is [Agent Name], calling from Winsalot Corp on behalf of a commercial cleaning provider."

"We are reaching out to property management companies that may need cleaning services for offices, apartment buildings, common areas, move-ins, move-outs, or managed properties."

"Are you currently open to receiving a free cleaning quote?"

If yes:

"Perfect. I just need a few details so we can arrange the quote for you."',
  0
);
