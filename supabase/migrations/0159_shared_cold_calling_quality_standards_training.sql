-- "Winsalot Cold Calling Quality Standards" training manual: a single
-- shared training item that must appear, with identical content, in both
-- the Growth CRM (admin + agent) and the Lead Generation CRM (admin +
-- agent). Neither existing training-completion system fits this brief on
-- its own:
--   - crm_training_progress (migration 0105, the "Winsalot Training
--     Portal") tracks completion with no quiz score column and is scoped
--     to crm_users only - Lead Generation CRM has no equivalent tables at
--     all today (see that migration's own header note that leadgen
--     training was deliberately left out of scope).
--   - crm_training_materials (migration 0018) is a free-form link/text
--     library with no completion tracking whatsoever.
--   - crm_subcontractor_training_progress is subcontractor-only.
-- So this is one new, narrow, purpose-built completion-tracking table for
-- this shared manual - not a new competing "training module system".
-- Cross-CRM identity is handled the same way holiday_pay_assignments
-- (migration 0106) already does it in this codebase: two nullable FK
-- columns, exactly one populated per row, never both.
create table if not exists public.crm_shared_training_completions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Stable slug for the training item, so this same table can hold future
  -- shared manuals without a schema change.
  training_key text not null check (length(trim(training_key)) > 0),
  -- Bumped only if the manual's content changes materially enough that
  -- past completions should no longer count as current - mirrors
  -- crm_training_modules.current_version's role in migration 0105.
  training_version integer not null default 1 check (training_version > 0),
  crm_user_id uuid references public.crm_users(id) on delete cascade,
  leadgen_user_id uuid references public.leadgen_users(id) on delete cascade,
  -- Denormalized so admin views don't need a second query against whichever
  -- of the two user tables applies, and so the record is still readable if
  -- the underlying user account is ever removed.
  user_name text not null check (length(trim(user_name)) > 0),
  user_email text not null check (length(trim(user_email)) > 0),
  quiz_score integer not null check (quiz_score >= 0),
  quiz_total integer not null check (quiz_total > 0 and quiz_score <= quiz_total),
  passed boolean not null,
  completed_at timestamptz not null default now(),
  constraint crm_shared_training_completions_one_agent check (
    (crm_user_id is not null and leadgen_user_id is null)
    or (crm_user_id is null and leadgen_user_id is not null)
  )
);

-- One row per (training item, version, real user) - a retake overwrites
-- the previous attempt for the same version rather than accumulating rows
-- (upserted via these indexes as the ON CONFLICT target), while a later
-- training_version bump starts a fresh row (old attempts stay on record
-- under their own version). Plain (non-partial) unique indexes rather than
-- the partial-index style used by holiday_pay_assignments: since exactly
-- one of crm_user_id/leadgen_user_id is populated per row (see the check
-- constraint above) and Postgres never treats two NULLs as conflicting,
-- each index already only ever fires for its own CRM's rows - and a plain
-- unique index, unlike a partial one, can be used directly as an upsert's
-- ON CONFLICT target without repeating a WHERE clause there.
create unique index if not exists crm_shared_training_completions_unique_crm_agent
  on public.crm_shared_training_completions(training_key, training_version, crm_user_id);
create unique index if not exists crm_shared_training_completions_unique_leadgen_agent
  on public.crm_shared_training_completions(training_key, training_version, leadgen_user_id);

create index if not exists crm_shared_training_completions_training_key_idx
  on public.crm_shared_training_completions(training_key);

create or replace function public.crm_shared_training_completions_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_shared_training_completions_touch_updated_at_trigger
  on public.crm_shared_training_completions;
create trigger crm_shared_training_completions_touch_updated_at_trigger
  before update on public.crm_shared_training_completions
  for each row execute function public.crm_shared_training_completions_touch_updated_at();

alter table public.crm_shared_training_completions enable row level security;

-- Admin from either CRM can see every completion for this shared manual -
-- there is no per-CRM data here to isolate, the same rationale as
-- holidays_admin_all in migration 0106.
create policy "crm_shared_training_completions_admin_select" on public.crm_shared_training_completions
  for select
  using (public.crm_user_role(auth.uid()) = 'admin' or public.leadgen_user_role(auth.uid()) = 'admin');

-- An agent may only ever see their own completion record.
create policy "crm_shared_training_completions_self_select" on public.crm_shared_training_completions
  for select
  using (
    (crm_user_id = auth.uid() and public.crm_user_role(auth.uid()) = 'agent')
    or (leadgen_user_id = auth.uid() and public.leadgen_user_role(auth.uid()) = 'agent')
  );

-- Any active CRM member (agent or admin previewing the training as a
-- learner) may record their own completion - never someone else's, and
-- never edit another column set out from under themselves via a crafted
-- request, since with check mirrors using exactly.
create policy "crm_shared_training_completions_self_insert" on public.crm_shared_training_completions
  for insert
  with check (
    (crm_user_id = auth.uid() and public.crm_user_role(auth.uid()) in ('agent', 'admin'))
    or (leadgen_user_id = auth.uid() and public.leadgen_user_role(auth.uid()) in ('agent', 'admin'))
  );

create policy "crm_shared_training_completions_self_update" on public.crm_shared_training_completions
  for update
  using (
    (crm_user_id = auth.uid() and public.crm_user_role(auth.uid()) in ('agent', 'admin'))
    or (leadgen_user_id = auth.uid() and public.leadgen_user_role(auth.uid()) in ('agent', 'admin'))
  )
  with check (
    (crm_user_id = auth.uid() and public.crm_user_role(auth.uid()) in ('agent', 'admin'))
    or (leadgen_user_id = auth.uid() and public.leadgen_user_role(auth.uid()) in ('agent', 'admin'))
  );
