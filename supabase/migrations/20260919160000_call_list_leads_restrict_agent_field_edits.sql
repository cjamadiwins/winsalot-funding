-- Closes a permission gap in the Call List Segments feature: the agent
-- UPDATE policy on call_list_leads (migration
-- 20260919150000_call_list_segments_upload_workflow.sql) is row-scoped
-- only (an agent may update a lead in a segment deployed to them) with
-- no column-level restriction, so nothing at the database layer stopped
-- an agent from calling the Supabase REST API directly (bypassing this
-- app's UI and Server Actions entirely, e.g. from the browser console
-- with their own session) to edit business_name/phone/email/etc, or to
-- silently clear a duplicate/DNC flag, reassign a lead, or fake a
-- promotion.
--
-- Every legitimate write an agent makes goes through this app's own
-- Server Actions (logCallListCallAction / promoteCallListLeadAction in
-- both CRMs), which always use the service-role client
-- (getSupabaseAdmin()) - a connection with no authenticated user, where
-- auth.uid() is null. Those writes are therefore completely unaffected
-- by this trigger; only a write made through the session-scoped client
-- (anon key + a real agent's JWT) can ever have auth.uid() resolve to an
-- 'agent' role, which is exactly the bypass path being closed here.
--
-- Explicitly NOT a restriction on reading this data - agents must still
-- see every field on a lead in a segment deployed to them (business
-- name, contact name, phone, email, etc.) so they can work it and copy/
-- paste that information into the existing Call Log or elsewhere in the
-- CRM; only which columns an agent-authenticated session may *write* is
-- restricted here. The existing call_list_leads_*_agent_select policies
-- are untouched.
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
    then
      raise exception 'Agents may only update call outcome fields (last_outcome, last_contacted_at, callback_at) on a Call List lead - editing, reassigning, or promoting is Admin/Server-Action only.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists call_list_leads_restrict_agent_update_trigger on public.call_list_leads;
create trigger call_list_leads_restrict_agent_update_trigger
  before update on public.call_list_leads
  for each row execute function public.call_list_leads_restrict_agent_update();

revoke execute on function public.call_list_leads_restrict_agent_update() from public, anon, authenticated;
