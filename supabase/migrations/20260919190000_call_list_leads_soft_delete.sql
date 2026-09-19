-- Adds reversible row removal ("safe delete") to Call List Segments, both
-- CRMs. Admin needs to be able to clean an imported call list (drop
-- obviously-wrong rows) without permanently destroying them, and without
-- touching crm_call_logs/leadgen_call_logs history, which already only
-- ever references a call_list_leads row via "on delete set null" (see
-- 20260919150000_call_list_segments_upload_workflow.sql) - it never
-- cascades, so soft-deleting the lead row itself is enough to keep every
-- call log/outcome/callback intact and still linked.
--
-- No existing column on call_list_leads can double for this:
-- call_list_segments.status (draft/active/completed/archived) is a
-- whole-segment lifecycle field, not per-row, and is_possible_duplicate/
-- dnc_flag are informational flags an Admin reviews, not a delete marker -
-- neither removes a row from the working list. A migration is genuinely
-- needed here.
alter table public.call_list_leads
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users(id) on delete set null;

create index if not exists call_list_leads_segment_removed_idx
  on public.call_list_leads(segment_id)
  where removed_at is not null;

comment on column public.call_list_leads.removed_at is
  'Set when Admin removes this row from the active call list (reversible - see removed_by, restore clears both). Never a permanent delete.';
comment on column public.call_list_leads.removed_by is
  'Admin (auth.users id) who removed this row; cleared on restore.';

-- ---------------------------------------------------------------------
-- Agents must not be able to remove, view, or restore rows - not just in
-- the UI, but through the backend/API too (same threat model as
-- 20260919160000_call_list_leads_restrict_agent_field_edits.sql: a direct
-- Supabase REST call using an agent's own session, bypassing this app's
-- Server Actions entirely).
--
-- 1. The agent SELECT/UPDATE policies are re-scoped to exclude removed
--    rows outright, so a removed row is invisible to an agent-authenticated
--    session regardless of how it queries call_list_leads - this is what
--    actually protects the agent working-list pages (both
--    src/app/agent/.../call-list-segments/[id]/page.tsx and the Lead Gen
--    mirror), since those pages query call_list_leads directly through the
--    session-scoped client, not through src/lib/call-list-leads.ts.
-- ---------------------------------------------------------------------
drop policy if exists "call_list_leads_growth_agent_select" on public.call_list_leads;
create policy "call_list_leads_growth_agent_select"
  on public.call_list_leads for select
  using (
    removed_at is null
    and public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'growth' and s.status in ('active', 'completed') and sa.agent_id = auth.uid()
    )
  );

drop policy if exists "call_list_leads_growth_agent_update" on public.call_list_leads;
create policy "call_list_leads_growth_agent_update"
  on public.call_list_leads for update
  using (
    removed_at is null
    and public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'growth' and s.status = 'active' and sa.agent_id = auth.uid()
    )
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'growth' and s.status = 'active' and sa.agent_id = auth.uid()
    )
  );

drop policy if exists "call_list_leads_leadgen_agent_select" on public.call_list_leads;
create policy "call_list_leads_leadgen_agent_select"
  on public.call_list_leads for select
  using (
    removed_at is null
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'lead_generation' and s.status in ('active', 'completed') and sa.agent_id = auth.uid()
    )
  );

drop policy if exists "call_list_leads_leadgen_agent_update" on public.call_list_leads;
create policy "call_list_leads_leadgen_agent_update"
  on public.call_list_leads for update
  using (
    removed_at is null
    and public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'lead_generation' and s.status = 'active' and sa.agent_id = auth.uid()
    )
  )
  with check (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.call_list_segments s
      join public.call_list_segment_agents sa on sa.segment_id = s.id
      where s.id = segment_id and s.crm = 'lead_generation' and s.status = 'active' and sa.agent_id = auth.uid()
    )
  );

-- 2. Even on the one row an agent's update policy still reaches (their
-- own segment, not yet removed), block them from writing removed_at/
-- removed_by directly - closes the same bypass the 20260919160000
-- trigger already closes for every other Admin-only field.
create or replace function public.call_list_leads_restrict_agent_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seg_crm text;
  caller_role text;
begin
  select crm into seg_crm from public.call_list_segments where id = new.segment_id;

  caller_role := case seg_crm
    when 'growth' then public.crm_user_role(auth.uid())
    when 'lead_generation' then public.leadgen_user_role(auth.uid())
    else null
  end;

  if caller_role = 'agent' then
    if new.business_name is distinct from old.business_name
      or new.contact_name is distinct from old.contact_name
      or new.phone is distinct from old.phone
      or new.email is distinct from old.email
      or new.website is distinct from old.website
      or new.city is distinct from old.city
      or new.province is distinct from old.province
      or new.industry is distinct from old.industry
      or new.notes is distinct from old.notes
      or new.extra_fields is distinct from old.extra_fields
      or new.is_possible_duplicate is distinct from old.is_possible_duplicate
      or new.duplicate_reason is distinct from old.duplicate_reason
      or new.dnc_flag is distinct from old.dnc_flag
      or new.segment_id is distinct from old.segment_id
      or new.source_row_number is distinct from old.source_row_number
      or new.assigned_agent_id is distinct from old.assigned_agent_id
      or new.promoted_opportunity_id is distinct from old.promoted_opportunity_id
      or new.promoted_leadgen_lead_id is distinct from old.promoted_leadgen_lead_id
      or new.promoted_at is distinct from old.promoted_at
      or new.created_by is distinct from old.created_by
      or new.removed_at is distinct from old.removed_at
      or new.removed_by is distinct from old.removed_by
    then
      raise exception 'Agents may only update call outcome fields (last_outcome, last_contacted_at, callback_at) on a Call List lead - editing, reassigning, removing/restoring, or promoting is Admin/Server-Action only.';
    end if;
  end if;

  return new;
end;
$$;
